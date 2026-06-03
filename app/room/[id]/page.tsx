"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  getSession,
  updateSession,
  subscribeToSession,
  calculateTotals,
  Session,
} from "@/lib/session";
import { getLocalUser } from "@/lib/identity";
import { openTNGPayment } from "@/lib/tng";
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

  const myName = user?.name || "";

  // Load + subscribe
  useEffect(() => {
    if (!user) { router.push("/"); return; }

    getSession(id).then((s) => {
      if (!s) { router.push("/"); return; }
      if (s.status === "scanning") router.push(`/scan?session=${id}`);
      setSession(s);
    });

    const channel = subscribeToSession(id, (updated) => {
      setSession(updated);
    });

    return () => { channel.unsubscribe(); };
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

  async function toggleItemAssignment(itemId: string) {
    if (!session || session.splitMode !== "byItem") return;
    const items = session.items.map((item) => {
      if (item.id !== itemId) return item;
      const already = item.assignedTo.includes(myName);
      return {
        ...item,
        assignedTo: already
          ? item.assignedTo.filter((n) => n !== myName)
          : [...item.assignedTo, myName],
      };
    });
    const updated = { ...session, items };
    setSession(updated);
    await updateSession(id, { items });
  }

  async function lockAndPay() {
    if (!session || !isOwner) return; // only owner can lock
    const totals = calculateTotals(session);
    await updateSession(id, { totals, status: "paying" });
    setSession((s) => s ? { ...s, totals, status: "paying" } : s);
    setTab("pay");
  }

  async function markPaid() {
    if (!session) return;
    const participants = session.participants.map((p) =>
      p.name === myName ? { ...p, hasPaid: true } : p
    );
    await updateSession(id, { participants });
    setSession((s) => s ? { ...s, participants } : s);
  }

  function handleTNGPay() {
    if (!session) return;
    const amount = session.totals?.[myName] ?? 0;
    if (amount <= 0) return;
    openTNGPayment(session.paidByPhone, amount, `SplitLah ${session.code}`);
    setTimeout(markPaid, 2000);
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

  const totals = session.status === "paying" || session.status === "done"
    ? session.totals
    : calculateTotals(session);

  const myTotal = totals?.[myName] ?? 0;
  const amIPayer = session.paidBy === myName;
  const myParticipant = session.participants.find((p) => p.name === myName);
  const pendingCount = session.participants.filter((p) => !p.hasPaid && p.name !== session.paidBy).length;
  const grandTotal = session.items.reduce((s, i) => s + (Number(i.price) || 0), 0);

  return (
    <main className="min-h-screen pb-32 max-w-lg mx-auto">
      {/* Header */}
      <div className="px-4 pt-8 pb-4">
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
        <p className="text-zinc-400 text-sm">
          Paid by <span className="text-brand font-medium">{session.paidBy}</span>
          {isOwner && <span className="text-zinc-600 text-xs ml-2">· You're the host</span>}
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
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-wide mb-2">
              Items
              {session.splitMode === "byItem" && (
                <span className="ml-2 text-brand normal-case">tap to claim yours</span>
              )}
            </p>
            <div className="space-y-2">
              {session.items.map((item) => {
                const isMine = item.assignedTo.includes(myName);
                const share =
                  item.assignedTo.length > 0
                    ? item.price / item.assignedTo.length
                    : item.price;

                return (
                  <div
                    key={item.id}
                    onClick={() => toggleItemAssignment(item.id)}
                    className={clsx(
                      "flex items-center justify-between rounded-xl px-4 py-3 transition-all",
                      session.splitMode === "byItem" && "cursor-pointer",
                      isMine && session.splitMode === "byItem"
                        ? "bg-brand/10 border border-brand/30"
                        : "bg-surface"
                    )}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {session.splitMode === "byItem" && (
                        <div
                          className={clsx(
                            "w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-all",
                            isMine ? "bg-brand border-brand" : "border-zinc-600"
                          )}
                        >
                          {isMine && <span className="text-black text-xs font-bold">✓</span>}
                        </div>
                      )}
                      <span className="text-white text-sm truncate">{item.name}</span>
                      {(item.quantity ?? 1) > 1 && (
                        <span className="text-zinc-500 text-xs flex-shrink-0">×{item.quantity}</span>
                      )}
                      {item.assignedTo.length > 1 && (
                        <span className="text-zinc-500 text-xs flex-shrink-0">
                          ÷{item.assignedTo.length}
                        </span>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0 ml-2">
                      <span className="text-white font-mono text-sm">
                        RM {(Number(item.price) || 0).toFixed(2)}
                      </span>
                      {session.splitMode === "byItem" && isMine && item.assignedTo.length > 1 && (
                        <p className="text-brand text-xs font-mono">
                          your share: RM {share.toFixed(2)}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

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
            <div className="border-t border-muted pt-2 mt-2 flex justify-between">
              <span className="text-zinc-400 text-sm">Total</span>
              <span className="font-mono font-semibold text-white">
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
                      // Get items relevant to this participant
                      const personItems = session.splitMode === "byItem"
                        ? session.items.filter(
                            (item) =>
                              item.assignedTo.includes(p.name) ||
                              item.assignedTo.length === 0
                          )
                        : session.items;

                      return (
                        <div key={p.name} className="bg-muted/50 rounded-xl overflow-hidden">
                          <div className="flex items-center justify-between px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div
                                className={clsx(
                                  "w-3 h-3 rounded-full",
                                  p.hasPaid ? "bg-brand" : "bg-zinc-600"
                                )}
                              />
                              <span className="text-sm text-white font-medium">{p.name}</span>
                              {p.hasPaid && <span className="text-brand text-xs">✓ paid</span>}
                            </div>
                            <span className="font-mono text-sm text-white font-semibold">
                              RM {(totals?.[p.name] ?? 0).toFixed(2)}
                            </span>
                          </div>
                          {/* Item breakdown */}
                          <div className="border-t border-zinc-700/50 px-4 py-2 space-y-1">
                            {personItems.map((item) => {
                              const price = Number(item.price) || 0;
                              if (price <= 0) return null;
                              const shareCount =
                                session.splitMode === "byItem"
                                  ? item.assignedTo.length > 0
                                    ? item.assignedTo.length
                                    : session.participants.length
                                  : session.participants.length;
                              const share = price / shareCount;
                              return (
                                <div
                                  key={item.id}
                                  className="flex items-center justify-between text-xs"
                                >
                                  <span className="text-zinc-400 truncate mr-2">
                                    {item.name}
                                    {shareCount > 1 && (
                                      <span className="text-zinc-600 ml-1">÷{shareCount}</span>
                                    )}
                                  </span>
                                  <span className="text-zinc-300 font-mono flex-shrink-0">
                                    RM {share.toFixed(2)}
                                  </span>
                                </div>
                              );
                            })}
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
              {pendingCount === 0 && (
                <div className="bg-brand/10 border border-brand/30 rounded-2xl p-4 text-center">
                  <p className="text-brand font-semibold">🎉 Everyone has paid!</p>
                </div>
              )}
            </div>
          ) : (
            // Non-payer view — pay button
            <div className="space-y-4">
              <div className="bg-surface rounded-2xl p-6 text-center">
                <p className="text-zinc-400 text-sm mb-1">You owe</p>
                <p className="text-4xl font-bold font-mono text-white mb-1">
                  RM {myTotal.toFixed(2)}
                </p>
                <p className="text-zinc-500 text-sm">to {session.paidBy}</p>
              </div>

              {/* Item breakdown for non-payer */}
              <div className="bg-surface rounded-2xl p-4">
                <p className="text-xs text-zinc-500 uppercase tracking-wide mb-2">Your items</p>
                <div className="space-y-1.5">
                  {(() => {
                    const myItems = session.splitMode === "byItem"
                      ? session.items.filter(
                          (item) =>
                            item.assignedTo.includes(myName) ||
                            item.assignedTo.length === 0
                        )
                      : session.items;

                    return myItems.map((item) => {
                      const price = Number(item.price) || 0;
                      if (price <= 0) return null;
                      const shareCount =
                        session.splitMode === "byItem"
                          ? item.assignedTo.length > 0
                            ? item.assignedTo.length
                            : session.participants.length
                          : session.participants.length;
                      const share = price / shareCount;
                      return (
                        <div
                          key={item.id}
                          className="flex items-center justify-between"
                        >
                          <span className="text-zinc-300 text-sm truncate mr-2">
                            {item.name}
                            {shareCount > 1 && (
                              <span className="text-zinc-600 text-xs ml-1">÷{shareCount}</span>
                            )}
                          </span>
                          <span className="text-white font-mono text-sm flex-shrink-0">
                            RM {share.toFixed(2)}
                          </span>
                        </div>
                      );
                    });
                  })()}
                  <div className="border-t border-muted pt-1.5 mt-1.5 flex justify-between">
                    <span className="text-zinc-400 text-sm font-medium">Total</span>
                    <span className="text-white font-mono text-sm font-semibold">
                      RM {myTotal.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {myParticipant?.hasPaid ? (
                <div className="bg-brand/10 border border-brand/30 rounded-2xl p-4 text-center">
                  <p className="text-brand font-semibold">✓ You've paid!</p>
                </div>
              ) : (
                <button
                  onClick={handleTNGPay}
                  className="w-full bg-brand text-black font-bold rounded-2xl py-5 text-lg flex items-center justify-center gap-3 hover:bg-opacity-90 active:scale-95 transition-all"
                >
                  <span className="text-2xl">💚</span>
                  Pay via TNG · RM {myTotal.toFixed(2)}
                </button>
              )}

              {!myParticipant?.hasPaid && (
                <button
                  onClick={markPaid}
                  className="w-full bg-muted text-zinc-300 font-medium rounded-2xl py-3 text-sm hover:bg-zinc-700 active:scale-95 transition-all"
                >
                  Mark as paid manually
                </button>
              )}
            </div>
          )}
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
    </main>
  );
}
