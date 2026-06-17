import { supabase } from "./supabase";
import { customAlphabet } from "nanoid";

const nanoid = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 7);

export interface LineItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  assignedTo: string[] | Record<string, number>; // participant names or mapping of name -> quantity
  addedLater?: boolean; // true for items added via "Add missing item" after initial scan
}

export interface Participant {
  name: string;
  icon?: string;
  tngPhone?: string;
  hasPaid: boolean;
  paymentMethod?: "cash" | "tng" | "other";
  proofUrl?: string; // base64 data URI of payment proof screenshot
  paidAmount?: number; // Tracks the total amount paid so far (to handle add-ons)
}

export interface Session {
  id: string;
  name?: string; // Optional group name
  code: string;
  createdAt: string;
  owner: string; // creator's name — only they can change split mode
  paidBy: string; // participant name
  paidByPhone: string;
  qrImage?: string; // Base64 of the uploaded payment QR code
  receiptImage?: string; // Base64 of the scanned receipt
  participants: Participant[];
  items: LineItem[];
  splitMode: "even" | "byItem";
  status: "scanning" | "splitting" | "paying" | "done";
  totals: Record<string, number>; // name → amount owed
  serviceCharge: number;
  sst: number;
  rounding?: number;
  receiptTotal: number;
}

function generateCode(): string {
  const words = ["MAKAN", "MAMAK", "TAPAU", "LUNCH", "MINUM", "KOPITIAM"];
  const word = words[Math.floor(Math.random() * words.length)];
  const suffix = nanoid().slice(0, 3);
  return `${word}-${suffix}`;
}

export async function createSession(
  creatorName: string, 
  splitMode: "even" | "byItem" = "even", 
  qrImage?: string,
  creatorIcon?: string,
  phone?: string,
  groupName?: string
): Promise<Session> {
  const code = generateCode();
  const session: Omit<Session, "id" | "createdAt"> = {
    name: groupName || code,
    code,
    owner: creatorName,
    paidBy: "",
    paidByPhone: phone || "",
    qrImage,
    participants: [{ name: creatorName, icon: creatorIcon, hasPaid: false }],
    items: [],
    splitMode,
    status: "scanning",
    totals: {},
    serviceCharge: 0,
    sst: 0,
    rounding: 0,
    receiptTotal: 0,
  };

  const { data, error } = await supabase
    .from("sessions")
    .insert({ 
      code, 
      created_by: creatorName,
      participants_list: session.participants.map(p => p.name),
      data: session 
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return { ...session, id: data.id, createdAt: data.created_at };
}

export async function joinSession(code: string, name: string, icon?: string): Promise<Session> {
  const { data, error } = await supabase
    .from("sessions")
    .select()
    .eq("code", code)
    .neq("deleted", true)
    .single();

  if (error || !data) throw new Error("Room not found");

  const session: Session = { ...data.data, id: data.id, createdAt: data.created_at };

  // Add participant if not already in
  const existing = session.participants.find((p) => p.name === name);
  if (!existing) {
    session.participants.push({ name, icon, hasPaid: false });
    const patch: Partial<Session> = { participants: session.participants };
    if (session.status === "paying" || session.status === "done") {
      patch.totals = calculateTotals(session);
    }
    await updateSession(data.id, patch);
    if (patch.totals) {
      session.totals = patch.totals;
    }
  } else if (icon && existing.icon !== icon) {
    // Update icon if they rejoined with a new icon
    existing.icon = icon;
    await updateSession(data.id, { participants: session.participants });
  }

  return session;
}

export async function getSession(id: string): Promise<Session | null> {
  const { data, error } = await supabase
    .from("sessions")
    .select()
    .eq("id", id)
    .neq("deleted", true)
    .single();

  if (error || !data) return null;
  return { ...data.data, id: data.id, createdAt: data.created_at };
}

export async function getSessionByCode(code: string): Promise<Session | null> {
  const { data, error } = await supabase
    .from("sessions")
    .select()
    .eq("code", code)
    .neq("deleted", true)
    .single();

  if (error || !data) return null;
  return { ...data.data, id: data.id, createdAt: data.created_at };
}

export async function updateSession(id: string, patch: Partial<Session>) {
  // First fetch current data, then merge
  const { data } = await supabase.from("sessions").select().eq("id", id).single();
  if (!data) throw new Error("Session not found");

  const merged = { ...data.data, ...patch };

  const updatePayload: any = { data: merged };
  if (patch.participants) {
    updatePayload.participants_list = patch.participants.map(p => p.name);
  }

  const { error } = await supabase
    .from("sessions")
    .update(updatePayload)
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
 * Gets a clean record representation of assignments from an item.
 * Supports both legacy string[] arrays and the new Record<string, number> mappings.
 */
export function getAssignments(item: LineItem): Record<string, number> {
  if (!item.assignedTo) return {};
  if (Array.isArray(item.assignedTo)) {
    const record: Record<string, number> = {};
    for (const name of item.assignedTo) {
      record[name] = 1;
    }
    return record;
  }
  return item.assignedTo;
}

/**
 * Calculates a participant's exact share of a single line item.
 * In by-item mode:
 *   - Claimed portions go to whoever claimed them.
 *   - Unclaimed items/portions go to the payer (host), NOT split evenly.
 */
export function getItemShare(item: LineItem, name: string, totalParticipants: number, isLocked: boolean = false, paidBy: string = ""): number {
  const price = Number(item.price) || 0;
  if (price <= 0) return 0;

  const assignments = getAssignments(item);
  const assignedNames = Object.keys(assignments).filter((n) => assignments[n] > 0);

  if (assignedNames.length === 0) {
    // Fully unassigned → goes to the payer when locked
    if (!isLocked) return 0;
    return name === paidBy ? price : 0;
  }

  const totalQty = item.quantity || 1;
  const totalClaimed = assignedNames.reduce((sum, n) => sum + assignments[n], 0);

  if (totalClaimed <= totalQty) {
    // User pays for their claimed portion.
    // Unclaimed portion goes to the payer (host).
    const myClaim = assignments[name] || 0;
    const claimedShare = price * (myClaim / totalQty);
    const unclaimedPrice = price * ((totalQty - totalClaimed) / totalQty);
    const unclaimedShare = isLocked && name === paidBy ? unclaimedPrice : 0;
    return claimedShare + unclaimedShare;
  } else {
    // Over-claimed case: scale claims to fit the price
    const myClaim = assignments[name] || 0;
    return price * (myClaim / totalClaimed);
  }
}

/**
 * Calculate how much each person owes.
 *
 * Even split: total of all items / number of participants
 * By-item split: each person pays for items they claimed.
 *   - Unassigned items/portions go to the payer (host), not split evenly.
 */
export function calculateTotals(session: Session, forceLocked: boolean = false): Record<string, number> {
  const { items, participants, splitMode, serviceCharge, sst } = session;
  const totals: Record<string, number> = {};
  participants.forEach((p) => (totals[p.name] = 0));

  if (participants.length === 0) return totals;

  const itemsSubtotal = items.reduce((sum, i) => sum + (Number(i.price) || 0), 0);
  const grandTotal = itemsSubtotal + (serviceCharge || 0) + (sst || 0);
  const isLocked = true; // Room is always considered locked for calculations since manual lock phase is removed

  if (splitMode === "even") {
    const share = grandTotal / participants.length;
    participants.forEach((p) => {
      totals[p.name] = Math.round(share * 100) / 100;
    });
  } else {
    // By-item mode
    // 1. Calculate subtotals based on claimed items
    const subtotals: Record<string, number> = {};
    participants.forEach((p) => (subtotals[p.name] = 0));

    for (const item of items) {
      for (const p of participants) {
        subtotals[p.name] += getItemShare(item, p.name, participants.length, isLocked, session.paidBy);
      }
    }

    // 2. Add proportional Service Charge and SST to each person's subtotal
    const totalSubtotal = Object.values(subtotals).reduce((a, b) => a + b, 0);

    for (const p of participants) {
      const mySubtotal = subtotals[p.name];
      const ratio = totalSubtotal > 0 ? mySubtotal / totalSubtotal : 1 / participants.length;
      
      const myServiceCharge = (serviceCharge || 0) * ratio;
      const mySst = (sst || 0) * ratio;

      totals[p.name] = mySubtotal + myServiceCharge + mySst;
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

export async function deleteSession(id: string): Promise<void> {
  const { error } = await supabase.from("sessions").update({ deleted: true }).eq("id", id);
  if (error) throw new Error(error.message);
}
