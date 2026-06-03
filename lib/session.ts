import { supabase } from "./supabase";
import { customAlphabet } from "nanoid";

const nanoid = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 7);

export interface LineItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  assignedTo: string[]; // participant names
}

export interface Participant {
  name: string;
  tngPhone?: string;
  hasPaid: boolean;
}

export interface Session {
  id: string;
  code: string;
  createdAt: string;
  owner: string; // creator's name — only they can change split mode
  paidBy: string; // participant name
  paidByPhone: string;
  participants: Participant[];
  items: LineItem[];
  splitMode: "even" | "byItem";
  status: "scanning" | "splitting" | "paying" | "done";
  totals: Record<string, number>; // name → amount owed
  serviceCharge: number;
  sst: number;
  receiptTotal: number;
}

function generateCode(): string {
  const words = ["MAKAN", "MAMAK", "TAPAU", "LUNCH", "MINUM", "KOPITIAM"];
  const word = words[Math.floor(Math.random() * words.length)];
  const suffix = nanoid().slice(0, 3);
  return `${word}-${suffix}`;
}

export async function createSession(creatorName: string): Promise<Session> {
  const code = generateCode();
  const session: Omit<Session, "id" | "createdAt"> = {
    code,
    owner: creatorName,
    paidBy: "",
    paidByPhone: "",
    participants: [{ name: creatorName, hasPaid: false }],
    items: [],
    splitMode: "even",
    status: "scanning",
    totals: {},
    serviceCharge: 0,
    sst: 0,
    receiptTotal: 0,
  };

  const { data, error } = await supabase
    .from("sessions")
    .insert({ code, data: session })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return { ...session, id: data.id, createdAt: data.created_at };
}

export async function joinSession(code: string, name: string): Promise<Session> {
  const { data, error } = await supabase
    .from("sessions")
    .select()
    .eq("code", code)
    .single();

  if (error || !data) throw new Error("Room not found");

  const session: Session = { ...data.data, id: data.id, createdAt: data.created_at };

  // Add participant if not already in
  if (!session.participants.find((p) => p.name === name)) {
    session.participants.push({ name, hasPaid: false });
    await updateSession(data.id, { participants: session.participants });
  }

  return session;
}

export async function getSession(id: string): Promise<Session | null> {
  const { data, error } = await supabase
    .from("sessions")
    .select()
    .eq("id", id)
    .single();

  if (error || !data) return null;
  return { ...data.data, id: data.id, createdAt: data.created_at };
}

export async function getSessionByCode(code: string): Promise<Session | null> {
  const { data, error } = await supabase
    .from("sessions")
    .select()
    .eq("code", code)
    .single();

  if (error || !data) return null;
  return { ...data.data, id: data.id, createdAt: data.created_at };
}

export async function updateSession(id: string, patch: Partial<Session>) {
  // First fetch current data, then merge
  const { data } = await supabase.from("sessions").select().eq("id", id).single();
  if (!data) throw new Error("Session not found");

  const merged = { ...data.data, ...patch };

  const { error } = await supabase
    .from("sessions")
    .update({ data: merged })
    .eq("id", id);

  if (error) throw new Error(error.message);
}

export function subscribeToSession(id: string, callback: (session: Session) => void) {
  return supabase
    .channel(`session:${id}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "sessions", filter: `id=eq.${id}` },
      (payload) => {
        const s = payload.new as any;
        callback({ ...s.data, id: s.id, createdAt: s.created_at });
      }
    )
    .subscribe();
}

/**
 * Calculate how much each person owes.
 * Service charge and SST are included in the items list (as special line items),
 * so they are automatically part of the calculation.
 *
 * Even split: total of all items / number of participants
 * By-item split: each person pays for items they claimed.
 *   - Unassigned items are split evenly among ALL participants.
 */
export function calculateTotals(session: Session): Record<string, number> {
  const { items, participants, splitMode } = session;
  const totals: Record<string, number> = {};
  participants.forEach((p) => (totals[p.name] = 0));

  if (participants.length === 0) return totals;

  const grandTotal = items.reduce((sum, i) => sum + (Number(i.price) || 0), 0);

  if (splitMode === "even") {
    const share = grandTotal / participants.length;
    participants.forEach((p) => {
      totals[p.name] = Math.round(share * 100) / 100;
    });
  } else {
    // By-item mode
    for (const item of items) {
      const price = Number(item.price) || 0;
      if (price <= 0) continue;

      if (item.assignedTo.length > 0) {
        // Split among assigned people
        const share = price / item.assignedTo.length;
        for (const name of item.assignedTo) {
          if (totals[name] !== undefined) {
            totals[name] += share;
          }
        }
      } else {
        // Unassigned items → split evenly among all participants
        const share = price / participants.length;
        for (const p of participants) {
          totals[p.name] += share;
        }
      }
    }

    // Round to 2dp
    for (const k of Object.keys(totals)) {
      totals[k] = Math.round(totals[k] * 100) / 100;
    }
  }

  // Fix rounding so sum matches grand total
  const currentSum = Object.values(totals).reduce((a, b) => a + b, 0);
  const roundedGrandTotal = Math.round(grandTotal * 100) / 100;
  const diff = Math.round((roundedGrandTotal - currentSum) * 100) / 100;
  if (diff !== 0 && participants.length > 0) {
    // Add the rounding difference to the first non-payer, or first participant
    const adjustTarget = participants.find((p) => p.name !== session.paidBy) || participants[0];
    totals[adjustTarget.name] = Math.round((totals[adjustTarget.name] + diff) * 100) / 100;
  }

  return totals;
}
