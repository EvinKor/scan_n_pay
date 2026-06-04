"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  getSession,
  updateSession,
  subscribeToSession,
  calculateTotals,
  Session,
  LineItem,
  getAssignments,
  getItemShare,
} from "@/lib/session";
import { getLocalUser } from "@/lib/identity";

import clsx from "clsx";

type Tab = "split" | "pay";

export default function RoomPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const user = getLocalUser();

  const [session, setSession] = useState<Session | null>(null);
  const [tab, setTab] = useState<Tab>("split");
  const [saving, setSaving] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "tng" | "other" | null>(null);
  const [proofImage, setProofImage] = useState<string | null>(null);
  const [viewingProof, setViewingProof] = useState<string | null>(null);
  const proofInputRef = useRef<HTMLInputElement>(null);

  // Add missing item state
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [newItemPrice, setNewItemPrice] = useState("");
  const [newItemQty, setNewItemQty] = useState(1);

  const myName = user?.name || "";

  // Load + subscribe
  useEffect(() => {
    if (!user) { router.push("/"); return; }

    getSession(id).then((s) => {
      if (!s) { router.push("/"); return; }
      if (s.status === "scanning") router.push(`/scan?session=${id}`);
      setSession(s);
    });

    // Supabase Realtime Subscription
    const channel = subscribeToSession(id, (updated) => {
      setSession(updated);
    });

    // Fallback polling (in case Supabase Realtime is not enabled on the sessions table)
    const pollInterval = setInterval(() => {
      getSession(id).then((s) => {
        if (s) setSession(s);
      });
    }, 3000);

    return () => {
      channel.unsubscribe();
      clearInterval(pollInterval);
    };
  }, [id]);

  const isOwner = session?.owner === myName;

  async function setSplitMode(mode: "even" | "byItem") {
    if (!session || !isOwner) return; // only owner can change
    setSaving(true);
    const updated = { ...session, splitMode: mode };
    setSession(updated);
    await updateSession(id, { splitMode: mode });
    setSaving(false);
  }

  async function handleAddMissingItem() {
    if (!session || !newItemName.trim() || !newItemPrice) return;
    const price = parseFloat(newItemPrice);
    if (isNaN(price) || price < 0) return;
    
    setSaving(true);
    const newItem: LineItem = {
      id: Math.random().toString(36).substring(2, 9),
      name: newItemName.trim(),
      quantity: newItemQty,
      price: price,
      assignedTo: { [myName]: newItemQty },
      addedLater: true,
    };
    
    const items = [...session.items, newItem];
    const updated = { ...session, items };
    setSession(updated);
    await updateSession(id, { items });
    
    setIsAddingItem(false);
    setNewItemName("");
    setNewItemPrice("");
    setNewItemQty(1);
    setSaving(false);
  }

  async function toggleItemAssignment(itemId: string) {
    if (!session || session.splitMode !== "byItem") return;
    const item = session.items.find(i => i.id === itemId);
    if (!item) return;
    // If user has paid, they can only interact with addedLater items
    if (myParticipant?.hasPaid && !item.addedLater) return;

    const items = session.items.map((item) => {
      if (item.id !== itemId) return item;
      const assignments = { ...getAssignments(item) };
      const alreadyHas = (assignments[myName] || 0) > 0;
      if (alreadyHas) {
        delete assignments[myName];
      } else {
        assignments[myName] = 1;
      }
      return {
        ...item,
        assignedTo: assignments,
      };
    });
    const updated = { ...session, items };
    setSession(updated);
    await updateSession(id, { items });
  }

  async function adjustClaimedQuantity(itemId: string, delta: number) {
    if (!session || session.splitMode !== "byItem") return;
    const item = session.items.find(i => i.id === itemId);
    if (!item) return;
    // If user has paid, they can only interact with addedLater items
    if (myParticipant?.hasPaid && !item.addedLater) return;
    const items = session.items.map((item) => {
      if (item.id !== itemId) return item;
      const assignments = { ...getAssignments(item) };
      const current = assignments[myName] || 0;
      const next = current + delta;
      if (next <= 0) {
        delete assignments[myName];
      } else {
        assignments[myName] = Math.min(next, item.quantity);
      }
      return {
        ...item,
        assignedTo: assignments,
      };
    });
    const updated = { ...session, items };
    setSession(updated);
    await updateSession(id, { items });
  }

  async function lockAndPay() {
    if (!session || !isOwner) return; // only owner can lock
    const totals = calculateTotals(session, true);
    await updateSession(id, { totals, status: "paying" });
    setSession((s) => s ? { ...s, totals, status: "paying" } : s);
    setTab("pay");
  }

  async function markPaidWithMethod(method: "cash" | "tng" | "other", proof?: string) {
    if (!session) return;
    const currentTotal = totals?.[myName] ?? 0;
    const participants = session.participants.map((p) =>
      p.name === myName
        ? { ...p, hasPaid: true, paymentMethod: method, proofUrl: proof || p.proofUrl, paidAmount: currentTotal }
        : p
    );
    await updateSession(id, { participants });
    setSession((s) => s ? { ...s, participants } : s);
  }

  function handleTNGPay() {
    if (!session) return;
    
    // If there is a QR image, trigger download
    if (session.qrImage) {
      const a = document.createElement("a");
      a.href = session.qrImage;
      a.download = `QR_${session.paidBy}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
    
    // Open TNG app via App Store Link (which auto-launches if installed on iOS)
    window.location.href = "https://apps.apple.com/my/app/touch-n-go-ewallet/id1343446791";
  }

  function handleProofUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Compress and convert to base64
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX = 800;
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
          else { w = Math.round(w * MAX / h); h = MAX; }
        }
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
        setProofImage(dataUrl);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
    // Reset input so user can re-select
    e.target.value = "";
  }

  async function confirmPayment() {
    if (!paymentMethod) return;
    await markPaidWithMethod(paymentMethod, proofImage || undefined);
    setPaymentMethod(null);
    setProofImage(null);
  }

  async function handleShare() {
    if (!session) return;
    const joinUrl = `${window.location.origin}/join/${session.code}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: "Join SplitLah",
          text: `Join my bill split room: ${session.code}`,
          url: joinUrl,
        });
        return;
      } catch {
        // User cancelled share
      }
    }

    try {
      await navigator.clipboard.writeText(joinUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // Clipboard failed
    }
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-brand border-t-transparent animate-spin" />
      </div>
    );
  }

  const totals = calculateTotals(session);

  const myTotal = totals?.[myName] ?? 0;
  const amIPayer = session.paidBy === myName;
  const myParticipant = session.participants.find((p) => p.name === myName);
  const pendingCount = session.participants.filter((p) => {
    if (p.name === session.paidBy) return false;
    const pTotal = totals?.[p.name] ?? 0;
    const hasUnpaidBalance = pTotal > (p.paidAmount ?? 0) + 0.01;
    return !p.hasPaid || hasUnpaidBalance;
  }).length;
  const itemsSubtotal = session.items.reduce((s, i) => s + (Number(i.price) || 0), 0);
  const grandTotal = itemsSubtotal + (session.serviceCharge || 0) + (session.sst || 0);
  const isLocked = session.status === "paying" || session.status === "done";

  return (
    <main className="min-h-screen pb-32 max-w-lg mx-auto">
      {/* Header */}
      <div className="px-4 pt-8 pb-4">
        <div className="mb-4 inline-flex items-center gap-2 bg-brand/10 border border-brand/20 px-3 py-1.5 rounded-full text-xs text-brand font-medium">
          👤 Playing as <span className="font-bold">{myName}</span>
        </div>
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-xl font-bold font-mono">{session.code}</h1>
          <div className="flex items-center gap-2">
            <span className="text-xs bg-muted text-zinc-400 px-3 py-1 rounded-full">
              {session.participants.length} people
            </span>
            <button
              onClick={handleShare}
              className="bg-muted text-zinc-300 px-3 py-1 rounded-full text-xs font-medium hover:bg-zinc-700 active:scale-95 transition-all flex items-center gap-1"
            >
              {linkCopied ? "✅ Copied" : "🔗 Share"}
            </button>
          </div>
        </div>
        <p className="text-zinc-400 text-sm flex items-center justify-between mt-1">
          <span>
            Paid by <span className="text-brand font-medium">{session.paidBy}</span>
            {isOwner && <span className="text-zinc-600 text-xs ml-2">· You're the host</span>}
          </span>
          {isOwner && session.status === "splitting" && (
            <button
              onClick={() => router.push(`/scan?session=${session.id}`)}
              className="text-zinc-500 hover:text-brand text-xs font-semibold flex items-center gap-1 transition-all"
            >
              🔄 Rescan / Edit items
            </button>
          )}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mx-4 mb-6 bg-surface rounded-xl p-1">
        {(["split", "pay"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              "flex-1 py-2 rounded-lg text-sm font-medium capitalize transition-all",
              tab === t ? "bg-brand text-black" : "text-zinc-400 hover:text-white"
            )}
          >
            {t === "split" ? "Split" : "Pay"}
          </button>
        ))}
      </div>

      {/* ── SPLIT TAB ── */}
      {tab === "split" && (
        <div className="px-4 space-y-6">
          {/* Participants */}
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-wide mb-2">Participants</p>
            <div className="flex flex-wrap gap-2">
              {session.participants.map((p) => (
                <div
                  key={p.name}
                  className={clsx(
                    "px-3 py-1.5 rounded-xl text-sm font-medium",
                    p.name === session.paidBy
                      ? "bg-brand/20 text-brand border border-brand/30"
                      : p.name === myName
                        ? "bg-muted text-white border border-zinc-600"
                        : "bg-muted text-zinc-300"
                  )}
                >
                  {p.name}
                  {p.name === session.paidBy && <span className="ml-1 text-xs">💳</span>}
                  {p.name === myName && p.name !== session.paidBy && <span className="ml-1 text-xs">(you)</span>}
                </div>
              ))}
            </div>
          </div>

          {/* Split mode — owner only */}
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-wide mb-2">Split method</p>
            {isOwner ? (
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setSplitMode("even")}
                  className={clsx(
                    "rounded-xl py-3 text-sm font-medium transition-all",
                    session.splitMode === "even"
                      ? "bg-brand text-black"
                      : "bg-muted text-zinc-300 hover:bg-zinc-700"
                  )}
                >
                  ⚖️ Split evenly
                </button>
                <button
                  onClick={() => setSplitMode("byItem")}
                  className={clsx(
                    "rounded-xl py-3 text-sm font-medium transition-all",
                    session.splitMode === "byItem"
                      ? "bg-brand text-black"
                      : "bg-muted text-zinc-300 hover:bg-zinc-700"
                  )}
                >
                  🎯 Choose items
                </button>
              </div>
            ) : (
              <div className="bg-surface rounded-xl px-4 py-3 text-sm text-zinc-300">
                {session.splitMode === "even" ? "⚖️ Split evenly" : "🎯 Choose items"}
                <span className="text-zinc-600 text-xs ml-2">· Set by host</span>
              </div>
            )}
          </div>

          {/* Items */}
          {(() => {
            const s = session!;
            const receiptItems = s.items.filter(i => !i.addedLater);
            const addedItems = s.items.filter(i => i.addedLater);

            function renderItemRow(item: LineItem) {
              const assignments = getAssignments(item);
              const isMine = (assignments[myName] || 0) > 0;
              const myClaimedQty = assignments[myName] || 0;
              const assignees = Object.keys(assignments).filter((n) => assignments[n] > 0);
              const totalQty = item.quantity || 1;
              const totalClaimed = assignees.reduce((sum, n) => sum + assignments[n], 0);
              const isFullyClaimed = totalClaimed >= totalQty;
              // Paid users can still interact with addedLater items, but not original items
              const canInteract = item.addedLater
                ? (isMine || !isFullyClaimed)
                : (!myParticipant?.hasPaid && (isMine || !isFullyClaimed));
              const myShare = getItemShare(item, myName, s.participants.length, isLocked, s.paidBy);

              return (
                <div
                  key={item.id}
                  onClick={() => {
                    if (s.splitMode === "byItem" && canInteract) {
                      toggleItemAssignment(item.id);
                    }
                  }}
                  className={clsx(
                    "flex items-center justify-between rounded-xl px-4 py-3 transition-all",
                    s.splitMode === "byItem" && canInteract ? "cursor-pointer" : "cursor-not-allowed",
                    !canInteract && "opacity-50 grayscale",
                    isMine && s.splitMode === "byItem"
                      ? "bg-brand/10 border border-brand/30"
                      : "bg-surface"
                  )}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {s.splitMode === "byItem" && (
                      <div
                        className={clsx(
                          "w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-all",
                          isMine ? "bg-brand border-brand" : "border-zinc-600"
                        )}
                      >
                        {isMine && <span className="text-black text-xs font-bold">✓</span>}
                      </div>
                    )}
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-white text-sm truncate">{item.name}</span>
                        {(item.quantity ?? 1) > 1 && (
                          <span className="text-zinc-500 text-xs flex-shrink-0">×{item.quantity}</span>
                        )}
                      </div>
                      {s.splitMode === "byItem" && assignees.length > 0 && (
                        <div className="text-zinc-500 text-xs mt-1 truncate">
                          {assignees.map((name) => {
                            const qty = assignments[name];
                            return `${name}${item.quantity > 1 ? ` (${qty})` : ""}`;
                          }).join(", ")}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Quantity Adjuster for Claimed Items */}
                  {s.splitMode === "byItem" && isMine && item.quantity > 1 && canInteract && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-2 bg-zinc-800 rounded-lg p-1 mx-2 flex-shrink-0"
                    >
                      <button
                        onClick={() => adjustClaimedQuantity(item.id, -1)}
                        className="w-6 h-6 flex items-center justify-center rounded bg-zinc-700 text-white hover:bg-zinc-600 active:scale-90 transition-all font-bold text-sm"
                      >
                        -
                      </button>
                      <span className="text-white text-sm font-mono px-1 min-w-[12px] text-center">
                        {myClaimedQty}
                      </span>
                      <button
                        onClick={() => adjustClaimedQuantity(item.id, 1)}
                        className="w-6 h-6 flex items-center justify-center rounded bg-zinc-700 text-white hover:bg-zinc-600 active:scale-90 transition-all font-bold text-sm"
                        disabled={myClaimedQty >= item.quantity}
                      >
                        +
                      </button>
                    </div>
                  )}

                  <div className="text-right flex-shrink-0 ml-2">
                    <span className="text-white font-mono text-sm">
                      RM {(Number(item.price) || 0).toFixed(2)}
                    </span>
                    {s.splitMode === "byItem" && isMine && (
                      <p className="text-brand text-xs font-mono">
                        your share: RM {myShare.toFixed(2)}
                      </p>
                    )}
                  </div>
                </div>
              );
            }

            return (
              <div className="space-y-4">
                {/* Receipt Items */}
                <div>
                  <p className="text-xs text-zinc-500 uppercase tracking-wide mb-2">
                    📋 Receipt Items
                    {s.splitMode === "byItem" && (
                      <span className="ml-2 text-brand normal-case">tap to claim yours</span>
                    )}
                  </p>
                  <div className="space-y-2">
                    {receiptItems.map(renderItemRow)}
                  </div>
                </div>

                {/* Added Later Items */}
                {addedItems.length > 0 && (
                  <div>
                    <p className="text-xs text-zinc-500 uppercase tracking-wide mb-2">
                      ➕ Added Later
                      {myParticipant?.hasPaid && (
                        <span className="ml-2 text-yellow-400 normal-case">unpaid add-ons</span>
                      )}
                    </p>
                    <div className="space-y-2">
                      {addedItems.map(renderItemRow)}
                    </div>
                  </div>
                )}

                {/* Inline Add Missing Item */}
                {s.splitMode === "byItem" && (
                  <div>
                    {isAddingItem ? (
                      <div className="bg-surface rounded-xl p-3 border border-brand/30 space-y-3">
                        <p className="text-xs text-brand font-medium">Add missing item</p>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="Item name"
                            value={newItemName}
                            onChange={(e) => setNewItemName(e.target.value)}
                            className="flex-1 bg-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-brand placeholder-zinc-500"
                            autoFocus
                          />
                          <div className="relative w-24">
                            <span className="absolute left-3 top-2 text-zinc-500 text-sm">RM</span>
                            <input
                              type="number"
                              placeholder="0.00"
                              step="0.10"
                              min="0"
                              value={newItemPrice}
                              onChange={(e) => setNewItemPrice(e.target.value)}
                              className="w-full bg-zinc-800 rounded-lg pl-8 pr-3 py-2 text-sm text-white font-mono focus:outline-none focus:ring-1 focus:ring-brand placeholder-zinc-500"
                            />
                          </div>
                        </div>
                        {/* Quantity selector */}
                        <div className="flex items-center gap-3">
                          <span className="text-zinc-400 text-xs">Qty:</span>
                          <div className="flex items-center gap-2 bg-zinc-800 rounded-lg p-1">
                            <button
                              onClick={() => setNewItemQty(Math.max(1, newItemQty - 1))}
                              className="w-7 h-7 flex items-center justify-center rounded bg-zinc-700 text-white hover:bg-zinc-600 active:scale-90 transition-all font-bold text-sm"
                            >
                              -
                            </button>
                            <span className="text-white text-sm font-mono px-2 min-w-[20px] text-center">
                              {newItemQty}
                            </span>
                            <button
                              onClick={() => setNewItemQty(newItemQty + 1)}
                              className="w-7 h-7 flex items-center justify-center rounded bg-zinc-700 text-white hover:bg-zinc-600 active:scale-90 transition-all font-bold text-sm"
                            >
                              +
                            </button>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={handleAddMissingItem}
                            disabled={!newItemName.trim() || !newItemPrice || saving}
                            className="flex-1 bg-brand text-black font-semibold text-sm py-2 rounded-lg hover:bg-opacity-90 disabled:opacity-50 transition-all"
                          >
                            Add & Claim
                          </button>
                          <button
                            onClick={() => { setIsAddingItem(false); setNewItemName(""); setNewItemPrice(""); setNewItemQty(1); }}
                            className="px-4 bg-zinc-800 text-zinc-300 font-semibold text-sm py-2 rounded-lg hover:bg-zinc-700 transition-all"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setIsAddingItem(true)}
                        className="w-full border border-dashed border-zinc-700 rounded-xl py-3 text-zinc-400 text-sm hover:border-brand hover:text-brand transition-colors flex items-center justify-center gap-2"
                      >
                        <span>+</span> Add missing item
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Summary */}
          <div className="bg-surface rounded-2xl p-4 space-y-2">
            <p className="text-xs text-zinc-500 uppercase tracking-wide mb-3">Summary</p>
            {session.participants.map((p) => (
              <div key={p.name} className="flex justify-between items-center">
                <span className={clsx("text-sm", p.name === myName && "text-brand font-medium")}>
                  {p.name === myName ? `${p.name} (you)` : p.name}
                </span>
                <span className="font-mono text-sm text-white">
                  RM {(totals?.[p.name] ?? 0).toFixed(2)}
                </span>
              </div>
            ))}
            {(session.serviceCharge > 0 || session.sst > 0) && (
              <div className="border-t border-muted pt-2 mt-2 space-y-1">
                <div className="flex justify-between text-zinc-400 text-xs">
                  <span>Subtotal</span>
                  <span className="font-mono">RM {itemsSubtotal.toFixed(2)}</span>
                </div>
                {session.serviceCharge > 0 && (
                  <div className="flex justify-between text-zinc-400 text-xs">
                    <span>Service Charge</span>
                    <span className="font-mono">RM {session.serviceCharge.toFixed(2)}</span>
                  </div>
                )}
                {session.sst > 0 && (
                  <div className="flex justify-between text-zinc-400 text-xs">
                    <span>SST</span>
                    <span className="font-mono">RM {session.sst.toFixed(2)}</span>
                  </div>
                )}
              </div>
            )}
            <div className="border-t border-muted pt-2 mt-2 flex justify-between">
              <span className="text-zinc-400 text-sm font-semibold">Total</span>
              <span className="font-mono font-bold text-brand">
                RM {grandTotal.toFixed(2)}
              </span>
            </div>
            {session.receiptTotal > 0 && Math.abs(grandTotal - session.receiptTotal) >= 0.05 && (
              <div className="flex justify-between items-center">
                <span className="text-yellow-400 text-xs">⚠ Receipt says</span>
                <span className="font-mono text-xs text-yellow-400">
                  RM {session.receiptTotal.toFixed(2)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── PAY TAB ── */}
      {tab === "pay" && (
        <div className="px-4 space-y-4">
          {amIPayer ? (
            // Payer view — see who's paid
            <div className="space-y-4">
              <div className="bg-surface rounded-2xl p-4">
                <p className="text-zinc-400 text-sm mb-3">
                  You paid the bill. Waiting for others to pay you back.
                </p>
                <div className="space-y-3">
                  {session.participants
                    .filter((p) => p.name !== session.paidBy)
                    .map((p) => {
                      return (
                        <div key={p.name} className="bg-muted/50 rounded-xl overflow-hidden">
                          <div className="flex items-center justify-between px-4 py-3">
                            <div className="flex items-center gap-2">
                              {(() => {
                                const pTotal = totals?.[p.name] ?? 0;
                                const hasUnpaidBalance = p.hasPaid && (pTotal > (p.paidAmount ?? 0) + 0.01);
                                const isFullyPaid = p.hasPaid && !hasUnpaidBalance;

                                return (
                                  <>
                                    <div
                                      className={clsx(
                                        "w-3 h-3 rounded-full",
                                        isFullyPaid ? "bg-brand" : hasUnpaidBalance ? "bg-yellow-400" : "bg-zinc-600"
                                      )}
                                    />
                                    <span className="text-sm text-white font-medium">{p.name}</span>
                                    {isFullyPaid && (
                                      <span className="text-brand text-xs flex items-center gap-1">
                                        ✓ {p.paymentMethod === "cash" ? "Cash" : p.paymentMethod === "tng" ? "TNG" : p.paymentMethod === "other" ? "Other" : "paid"}
                                      </span>
                                    )}
                                    {hasUnpaidBalance && (
                                      <span className="text-yellow-400 text-xs flex items-center gap-1">
                                        ⚡ Unpaid Add-ons
                                      </span>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                            <div className="flex items-center gap-2">
                              {p.hasPaid && p.proofUrl && (
                                <button
                                  onClick={() => setViewingProof(p.proofUrl!)}
                                  className="text-[10px] bg-brand/20 text-brand px-2 py-0.5 rounded-full hover:bg-brand/30 transition-colors"
                                >
                                  📎 Proof
                                </button>
                              )}
                              <span className="font-mono text-sm text-white font-semibold">
                                RM {(totals?.[p.name] ?? 0).toFixed(2)}
                              </span>
                            </div>
                          </div>
                          {/* Item breakdown */}
                          <div className="border-t border-zinc-700/50 px-4 py-2 space-y-1">
                            {(() => {
                              const personSubtotal = session.items.reduce((sum, item) => {
                                const share = session.splitMode === "byItem"
                                  ? getItemShare(item, p.name, session.participants.length, isLocked, session.paidBy)
                                  : (Number(item.price) || 0) / session.participants.length;
                                return sum + share;
                              }, 0);

                              const totalSubtotal = session.items.reduce((sum, item) => {
                                return sum + (Number(item.price) || 0);
                              }, 0);

                              const ratio = totalSubtotal > 0 ? personSubtotal / totalSubtotal : 1 / session.participants.length;
                              const personServiceCharge = (session.serviceCharge || 0) * ratio;
                              const personSst = (session.sst || 0) * ratio;

                              // Group items into claimed and unclaimed (if splitMode is byItem)
                              const claimedItems: { name: string; share: number; qtyClaimed: number; totalQty: number }[] = [];
                              let unclaimedShareSum = 0;

                              session.items.forEach((item) => {
                                const price = Number(item.price) || 0;
                                if (price <= 0) return;

                                if (session.splitMode === "byItem") {
                                  const assignments = getAssignments(item);
                                  const assignees = Object.keys(assignments).filter((n) => assignments[n] > 0);
                                  const isClaimedByMe = assignments[p.name] > 0;

                                  if (isClaimedByMe) {
                                    const share = getItemShare(item, p.name, session.participants.length, isLocked, session.paidBy);
                                    claimedItems.push({
                                      name: item.name,
                                      share,
                                      qtyClaimed: assignments[p.name],
                                      totalQty: item.quantity
                                    });
                                  } else if (assignees.length === 0) {
                                    const share = getItemShare(item, p.name, session.participants.length, isLocked, session.paidBy);
                                    unclaimedShareSum += share;
                                  }
                                } else {
                                  // Even split: show all items since everyone pays an equal share
                                  const share = price / session.participants.length;
                                  claimedItems.push({
                                    name: item.name,
                                    share,
                                    qtyClaimed: 0,
                                    totalQty: item.quantity
                                  });
                                }
                              });

                              return (
                                <>
                                  {claimedItems.map((item, idx) => (
                                    <div
                                      key={idx}
                                      className="flex items-center justify-between text-xs"
                                    >
                                      <span className="text-zinc-400 truncate mr-2">
                                        {item.name}
                                        {session.splitMode === "byItem" && item.totalQty > 1 && item.qtyClaimed > 0 && (
                                          <span className="text-zinc-500 ml-1">({item.qtyClaimed} of {item.totalQty})</span>
                                        )}
                                      </span>
                                      <span className="text-zinc-300 font-mono flex-shrink-0">
                                        RM {item.share.toFixed(2)}
                                      </span>
                                    </div>
                                  ))}

                                  {/* Shared / Unclaimed items sum */}
                                  {session.splitMode === "byItem" && unclaimedShareSum > 0 && (
                                    <div className="flex items-center justify-between text-xs text-zinc-500 italic">
                                      <span>Unclaimed Items (on host)</span>
                                      <span className="font-mono flex-shrink-0">
                                        RM {unclaimedShareSum.toFixed(2)}
                                      </span>
                                    </div>
                                  )}

                                  {/* Service charge and SST proportional breakdown */}
                                  {(session.serviceCharge > 0 || session.sst > 0) && (
                                    <div className="border-t border-zinc-700/30 pt-1 mt-1 space-y-0.5">
                                      <div className="flex justify-between text-[10px] text-zinc-500">
                                        <span>Subtotal</span>
                                        <span className="font-mono">RM {personSubtotal.toFixed(2)}</span>
                                      </div>
                                      {session.serviceCharge > 0 && (
                                        <div className="flex justify-between text-[10px] text-zinc-500">
                                          <span>Service Charge</span>
                                          <span className="font-mono">RM {personServiceCharge.toFixed(2)}</span>
                                        </div>
                                      )}
                                      {session.sst > 0 && (
                                        <div className="flex justify-between text-[10px] text-zinc-500">
                                          <span>SST</span>
                                          <span className="font-mono">RM {personSst.toFixed(2)}</span>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
              {pendingCount > 0 && (
                <p className="text-zinc-500 text-xs text-center">
                  {pendingCount} person{pendingCount > 1 ? "s" : ""} still pending
                </p>
              )}
              {pendingCount === 0 && session.participants.filter(p => p.name !== session.paidBy).length > 0 && (
                <div className="bg-brand/10 border border-brand/30 rounded-2xl p-4 text-center">
                  <p className="text-brand font-semibold">🎉 Everyone has paid!</p>
                </div>
              )}
              {pendingCount === 0 && session.participants.filter(p => p.name !== session.paidBy).length === 0 && (
                <div className="bg-surface rounded-2xl p-4 text-center">
                  <p className="text-zinc-500 text-sm">No one else in the room yet. Share the room link to invite others!</p>
                </div>
              )}
            </div>
          ) : (() => {
            // Non-payer view — compute receipt vs add-on breakdown
            const s = session!;
            const receiptItems = s.items.filter(i => !i.addedLater);
            const addedItems = s.items.filter(i => i.addedLater);

            // Calculate subtotals for receipt items vs add-on items
            const receiptSubtotal = receiptItems.reduce((sum, item) => {
              return sum + (s.splitMode === "byItem"
                ? getItemShare(item, myName, s.participants.length, isLocked, s.paidBy)
                : (Number(item.price) || 0) / s.participants.length);
            }, 0);

            const addOnSubtotal = addedItems.reduce((sum, item) => {
              return sum + (s.splitMode === "byItem"
                ? getItemShare(item, myName, s.participants.length, isLocked, s.paidBy)
                : (Number(item.price) || 0) / s.participants.length);
            }, 0);

            const hasUnpaidAddOns = myParticipant?.hasPaid && (myTotal > (myParticipant.paidAmount ?? 0) + 0.01);
            const amountToPay = hasUnpaidAddOns ? myTotal - (myParticipant.paidAmount ?? 0) : myTotal;

            // Helper to render item breakdown list
            function renderItemList(items: LineItem[]) {
              const claimedItems: { name: string; share: number; qtyClaimed: number; totalQty: number }[] = [];
              let unclaimedShareSum = 0;

              items.forEach((item) => {
                const price = Number(item.price) || 0;
                if (price <= 0) return;

                if (s.splitMode === "byItem") {
                  const assignments = getAssignments(item);
                  const assignees = Object.keys(assignments).filter((n) => assignments[n] > 0);
                  const isClaimedByMe = assignments[myName] > 0;

                  if (isClaimedByMe) {
                    const share = getItemShare(item, myName, s.participants.length, isLocked, s.paidBy);
                    claimedItems.push({ name: item.name, share, qtyClaimed: assignments[myName], totalQty: item.quantity });
                  } else if (assignees.length === 0) {
                    const share = getItemShare(item, myName, s.participants.length, isLocked, s.paidBy);
                    unclaimedShareSum += share;
                  }
                } else {
                  const share = price / s.participants.length;
                  claimedItems.push({ name: item.name, share, qtyClaimed: 0, totalQty: item.quantity });
                }
              });

              return (
                <>
                  {claimedItems.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between">
                      <span className="text-zinc-300 text-sm truncate mr-2">
                        {item.name}
                        {s.splitMode === "byItem" && item.totalQty > 1 && item.qtyClaimed > 0 && (
                          <span className="text-zinc-500 text-xs ml-1">({item.qtyClaimed} of {item.totalQty})</span>
                        )}
                      </span>
                      <span className="text-white font-mono text-sm flex-shrink-0">
                        RM {item.share.toFixed(2)}
                      </span>
                    </div>
                  ))}
                  {s.splitMode === "byItem" && unclaimedShareSum > 0 && (
                    <div className="flex items-center justify-between text-zinc-400 text-sm italic">
                      <span>Unclaimed Items (on host)</span>
                      <span className="font-mono text-white text-sm flex-shrink-0">
                        RM {unclaimedShareSum.toFixed(2)}
                      </span>
                    </div>
                  )}
                </>
              );
            }

            return (
            <div className="space-y-4">
              {/* Top amount display */}
              <div className="bg-surface rounded-2xl p-6 text-center">
                <p className="text-zinc-400 text-sm mb-1">
                  {hasUnpaidAddOns ? "Add-on balance" : "You owe"}
                </p>
                <p className="text-4xl font-bold font-mono text-white mb-1">
                  RM {amountToPay.toFixed(2)}
                </p>
                <p className="text-zinc-500 text-sm">to {s.paidBy}</p>
              </div>

              {/* Box 1: Paid items (shown when user has paid) */}
              {myParticipant?.hasPaid && (
                <div className="bg-brand/5 border border-brand/20 rounded-2xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-brand text-xs font-semibold uppercase tracking-wide">✅ Paid</span>
                    {myParticipant.paymentMethod && (
                      <span className="text-zinc-500 text-xs">
                        via {myParticipant.paymentMethod === "cash" ? "💵 Cash" : myParticipant.paymentMethod === "tng" ? "💚 TNG" : "💳 Other"}
                      </span>
                    )}
                    <span className="ml-auto text-brand font-mono text-sm font-bold">
                      RM {receiptSubtotal.toFixed(2)}
                    </span>
                  </div>
                  <div className="space-y-1 opacity-70">
                    {renderItemList(receiptItems)}
                  </div>
                </div>
              )}

              {/* Box 2: Unpaid add-ons (or full item list if not paid yet) */}
              {hasUnpaidAddOns ? (
                <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-2xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-yellow-400 text-xs font-semibold uppercase tracking-wide">⚡ Add-ons (unpaid)</span>
                    <span className="ml-auto text-yellow-400 font-mono text-sm font-bold">
                      RM {addOnSubtotal.toFixed(2)}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {renderItemList(addedItems)}
                  </div>
                </div>
              ) : !myParticipant?.hasPaid && (
                <div className="bg-surface rounded-2xl p-4">
                  <p className="text-xs text-zinc-500 uppercase tracking-wide mb-2">Your items</p>
                  <div className="space-y-1.5">
                    {renderItemList(s.items)}
                    {/* Service charge and SST */}
                    {(() => {
                      const mySubtotal = s.items.reduce((sum, item) => {
                        return sum + (s.splitMode === "byItem"
                          ? getItemShare(item, myName, s.participants.length, isLocked, s.paidBy)
                          : (Number(item.price) || 0) / s.participants.length);
                      }, 0);
                      const totalSubtotal = s.items.reduce((sum, item) => sum + (Number(item.price) || 0), 0);
                      const ratio = totalSubtotal > 0 ? mySubtotal / totalSubtotal : 1 / s.participants.length;
                      const myServiceCharge = (s.serviceCharge || 0) * ratio;
                      const mySst = (s.sst || 0) * ratio;
                      return (s.serviceCharge > 0 || s.sst > 0) ? (
                        <div className="border-t border-zinc-700/50 pt-2 mt-2 space-y-1">
                          <div className="flex justify-between text-xs text-zinc-400">
                            <span>Subtotal</span>
                            <span className="font-mono">RM {mySubtotal.toFixed(2)}</span>
                          </div>
                          {s.serviceCharge > 0 && (
                            <div className="flex justify-between text-xs text-zinc-400">
                              <span>Service Charge</span>
                              <span className="font-mono">RM {myServiceCharge.toFixed(2)}</span>
                            </div>
                          )}
                          {s.sst > 0 && (
                            <div className="flex justify-between text-xs text-zinc-400">
                              <span>SST</span>
                              <span className="font-mono">RM {mySst.toFixed(2)}</span>
                            </div>
                          )}
                        </div>
                      ) : null;
                    })()}
                    <div className="border-t border-muted pt-1.5 mt-1.5 flex justify-between">
                      <span className="text-zinc-400 text-sm font-medium">Total</span>
                      <span className="text-white font-mono text-sm font-semibold">
                        RM {myTotal.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Hidden file input for proof upload */}
              <input
                ref={proofInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleProofUpload}
                className="hidden"
              />

              {/* Payment flow */}
              {myParticipant?.hasPaid && !hasUnpaidAddOns ? (
                <div className="bg-brand/10 border border-brand/30 rounded-2xl p-4 text-center space-y-2">
                  <p className="text-brand font-semibold">✓ You're all paid up!</p>
                  {myParticipant.paymentMethod && (
                    <p className="text-zinc-400 text-xs">
                      via {myParticipant.paymentMethod === "cash" ? "💵 Cash" : myParticipant.paymentMethod === "tng" ? "💚 Touch 'n Go" : "💳 Other"}
                    </p>
                  )}
                </div>
              ) : !paymentMethod ? (
                /* Step 1: Choose payment method */
                <div className="space-y-3">
                  <p className="text-xs text-zinc-500 uppercase tracking-wide">
                    {hasUnpaidAddOns ? "Pay add-on balance" : "How are you paying?"}
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => setPaymentMethod("tng")}
                      className="bg-[#015ABF] hover:bg-[#0147a0] text-white font-semibold rounded-2xl py-4 text-sm flex flex-col items-center gap-2 active:scale-95 transition-all"
                    >
                      <span className="text-2xl">💚</span>
                      TNG
                    </button>
                    <button
                      onClick={() => setPaymentMethod("cash")}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-2xl py-4 text-sm flex flex-col items-center gap-2 active:scale-95 transition-all"
                    >
                      <span className="text-2xl">💵</span>
                      Cash
                    </button>
                    <button
                      onClick={() => setPaymentMethod("other")}
                      className="bg-muted hover:bg-zinc-700 text-zinc-300 font-semibold rounded-2xl py-4 text-sm flex flex-col items-center gap-2 active:scale-95 transition-all"
                    >
                      <span className="text-2xl">💳</span>
                      Other
                    </button>
                  </div>
                </div>
              ) : (
                /* Step 2: Payment confirmation with proof */
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-zinc-500 uppercase tracking-wide">
                      Paying via {paymentMethod === "tng" ? "💚 Touch 'n Go" : paymentMethod === "cash" ? "💵 Cash" : "💳 Other"}
                    </p>
                    <button
                      onClick={() => { setPaymentMethod(null); setProofImage(null); }}
                      className="text-zinc-500 text-xs hover:text-zinc-300 transition-colors"
                    >
                      ← Change
                    </button>
                  </div>

                  {/* TNG: Open TNG app button */}
                  {paymentMethod === "tng" && (
                    <div className="space-y-3">
                      {session.qrImage && (
                        <div className="bg-surface border border-zinc-700 rounded-2xl p-4 flex flex-col items-center text-center">
                          <img src={session.qrImage} alt="Payment QR" className="w-48 h-48 rounded-xl object-contain mb-3" />
                          <p className="text-zinc-400 text-sm mb-1">Host's Payment QR</p>
                        </div>
                      )}
                      <button
                        onClick={handleTNGPay}
                        className="w-full bg-[#015ABF] text-white font-bold rounded-2xl py-4 text-base flex flex-col items-center justify-center gap-1 hover:bg-[#0147a0] active:scale-95 transition-all"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xl">💚</span>
                          {session.qrImage ? "Save QR & Open TNG" : "Open TNG"}
                        </div>
                        <span className="text-sm font-normal opacity-90">Transfer RM {amountToPay.toFixed(2)}</span>
                      </button>

                      {session.paidByPhone && (
                        <button
                          onClick={(e) => {
                            navigator.clipboard.writeText(session.paidByPhone);
                            const btn = e.currentTarget;
                            const original = btn.innerText;
                            btn.innerText = "Copied!";
                            setTimeout(() => (btn.innerText = original), 2000);
                          }}
                          className="w-full bg-surface border border-zinc-700 hover:bg-zinc-800 text-zinc-300 font-medium rounded-xl py-3 text-sm active:scale-95 transition-all"
                        >
                          📋 Copy Phone Number ({session.paidByPhone})
                        </button>
                      )}
                    </div>
                  )}

                  {/* Proof upload */}
                  <div className="bg-surface rounded-2xl p-4 space-y-3">
                    <p className="text-zinc-400 text-sm">
                      {paymentMethod === "cash"
                        ? "Paid cash? Snap a photo as proof (optional)."
                        : "Attach a screenshot of your payment as proof (optional)."}
                    </p>

                    {proofImage ? (
                      <div className="relative">
                        <img
                          src={proofImage}
                          alt="Payment proof"
                          className="w-full max-h-48 object-contain rounded-xl border border-zinc-700"
                        />
                        <button
                          onClick={() => setProofImage(null)}
                          className="absolute top-2 right-2 bg-black/70 text-white w-7 h-7 rounded-full flex items-center justify-center text-sm hover:bg-black/90 transition-colors"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => proofInputRef.current?.click()}
                        className="w-full bg-muted hover:bg-zinc-700 text-zinc-300 font-medium rounded-xl py-3 text-sm flex items-center justify-center gap-2 active:scale-95 transition-all border border-dashed border-zinc-600"
                      >
                        📷 Attach proof photo
                      </button>
                    )}
                  </div>

                  {/* Confirm payment */}
                  <button
                    onClick={confirmPayment}
                    className="w-full bg-brand text-black font-bold rounded-2xl py-5 text-lg flex items-center justify-center gap-2 hover:bg-opacity-90 active:scale-95 transition-all"
                  >
                    ✓ Confirm Payment · RM {amountToPay.toFixed(2)}
                  </button>
                </div>
              )}
            </div>
            );
          })()}
        </div>
      )}

      {/* Floating CTA — Split tab only */}
      {tab === "split" && session.status !== "paying" && isOwner && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-dark to-transparent">
          <button
            onClick={lockAndPay}
            disabled={saving}
            className="w-full max-w-lg mx-auto block bg-brand text-black font-bold rounded-2xl py-4 text-lg hover:bg-opacity-90 active:scale-95 transition-all disabled:opacity-40"
          >
            Lock Split & Pay →
          </button>
        </div>
      )}

      {tab === "split" && session.status !== "paying" && !isOwner && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-dark to-transparent">
          <div className="w-full max-w-lg mx-auto text-center bg-surface rounded-2xl py-4 px-4">
            <p className="text-zinc-400 text-sm">Waiting for <span className="text-brand font-medium">{session.owner}</span> to lock the split…</p>
          </div>
        </div>
      )}

      {tab === "split" && session.status === "paying" && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-dark to-transparent">
          <button
            onClick={() => setTab("pay")}
            className="w-full max-w-lg mx-auto block bg-brand text-black font-bold rounded-2xl py-4 text-lg hover:bg-opacity-90 active:scale-95 transition-all"
          >
            Go to Payment →
          </button>
        </div>
      )}
      {/* Proof image viewer modal */}
      {viewingProof && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6"
          onClick={() => setViewingProof(null)}
        >
          <div
            className="relative max-w-lg w-full bg-surface rounded-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700">
              <p className="text-white font-semibold text-sm">Payment Proof</p>
              <button
                onClick={() => setViewingProof(null)}
                className="text-zinc-400 hover:text-white w-8 h-8 flex items-center justify-center rounded-full hover:bg-zinc-700 transition-all"
              >
                ✕
              </button>
            </div>
            <div className="p-4">
              <img
                src={viewingProof}
                alt="Payment proof"
                className="w-full rounded-xl"
              />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
