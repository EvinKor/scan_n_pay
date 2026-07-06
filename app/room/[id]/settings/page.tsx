"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getSession, updateSession, subscribeToSession, deleteSession, Session } from "@/lib/session";
import { getLocalUser, getLocalUserForRoom } from "@/lib/identity";
import { Scale, Target, Smartphone, QrCode, Phone, Save } from "lucide-react";
import { AnimalAvatar } from "@/components/AnimalAvatar";
import clsx from "clsx";
import { useRef } from "react";

export default function RoomSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [session, setSession] = useState<Session | null>(null);
  const [showSplitPopup, setShowSplitPopup] = useState(false);
  const [localGroupName, setLocalGroupName] = useState("");
  const [payerPhone, setPayerPhone] = useState("");
  const [payerQR, setPayerQR] = useState("");
  const [savingPayment, setSavingPayment] = useState(false);
  const qrInputRef = useRef<HTMLInputElement>(null);

  // Per-room identity
  const roomUser = getLocalUserForRoom(id);
  const legacyUser = getLocalUser();
  const myName = roomUser?.name || legacyUser?.name || "";

  useEffect(() => {
    if (!myName) {
      router.push("/");
      return;
    }

    getSession(id).then((s) => {
      if (!s) { router.push("/"); return; }
      setSession(s);
      setLocalGroupName(s.name || s.code);
      setPayerPhone(s.paidByPhone || "");
      setPayerQR(s.qrImage || "");
    });

    const channel = subscribeToSession(id, (updated) => {
      setSession(updated);
      setLocalGroupName((prev) => {
        // Only update from server if we are not actively editing and it changed
        if (updated.name && prev !== updated.name) return updated.name;
        return prev;
      });
    });

    return () => {
      channel.unsubscribe();
    };
  }, [id, myName, router]);

  async function handleSplitModeChange(mode: "even" | "byItem") {
    if (!session || session.splitMode === mode) {
      setShowSplitPopup(false);
      return;
    }
    await updateSession(id, { splitMode: mode });
    setSession({ ...session, splitMode: mode });
    setShowSplitPopup(false);
  }

  async function handleRemoveParticipant(nameToRemove: string) {
    if (!session) return;
    if (!confirm(`Are you sure you want to remove ${nameToRemove}?`)) return;
    const items = session.items.map(item => {
      const assignments = { ...item.assignedTo };
      if (Array.isArray(assignments)) return item; // old format fallback
      delete assignments[nameToRemove];
      return { ...item, assignedTo: assignments };
    });
    const participants = session.participants.filter(p => p.name !== nameToRemove);
    await updateSession(id, { participants, items });
    setSession({ ...session, participants, items });
  }

  function handleQRUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
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
        setPayerQR(canvas.toDataURL("image/jpeg", 0.7));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  async function handleSavePaymentDetails() {
    if (!session) return;
    setSavingPayment(true);
    await updateSession(id, { paidByPhone: payerPhone.trim(), qrImage: payerQR || undefined });
    setSession({ ...session, paidByPhone: payerPhone.trim(), qrImage: payerQR || undefined });
    setSavingPayment(false);
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-brand border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <main className="min-h-screen pb-32 max-w-lg mx-auto">
      {/* Header */}
      <div className="px-4 pt-8 pb-6 flex items-center gap-3">
        <button onClick={() => router.push(`/room/${id}`)} className="w-8 h-8 flex flex-shrink-0 items-center justify-center rounded-full bg-surface border border-divider text-main hover:bg-muted transition-colors">
          ←
        </button>
        <h1 className="text-xl font-bold text-main">Room Settings</h1>
      </div>

      <div className="px-4 space-y-6">
        {/* Group Name - Available to everyone */}
        <div className="bg-surface p-4 rounded-xl">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-subtle uppercase tracking-wide">Group Name</p>
            <p className="text-xs text-subtle font-mono">{localGroupName.length}/30</p>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={localGroupName}
              onChange={(e) => setLocalGroupName(e.target.value)}
              className="flex-1 w-full bg-muted border border-divider rounded-xl px-4 py-3 text-main placeholder-subtle focus:outline-none focus:border-brand transition-colors text-sm font-medium"
              placeholder="Enter group name"
              maxLength={30}
            />
            <button
              onClick={() => {
                const finalName = localGroupName.trim() || session.code;
                setLocalGroupName(finalName);
                if (finalName !== session.name) {
                  updateSession(id, { name: finalName });
                  setSession({ ...session, name: finalName });
                }
              }}
              disabled={localGroupName.trim() === session.name || (localGroupName.trim() === "" && session.code === session.name)}
              className="bg-brand text-white font-bold px-5 rounded-xl disabled:opacity-50 disabled:bg-divider disabled:text-subtle hover:bg-opacity-90 transition-colors text-sm"
            >
              Save
            </button>
          </div>
        </div>

        {/* Owner-only settings */}
        {(session.owner === myName) && (
          <>
            {/* Split method section */}
        <div className="bg-surface p-4 rounded-xl">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-subtle uppercase tracking-wide">Split method</p>
            <button onClick={() => setShowSplitPopup(true)} className="bg-brand/10 text-brand px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-brand/20 transition-colors">
              Change
            </button>
          </div>
          <div className="bg-muted border border-divider rounded-xl px-4 py-3 flex items-center gap-3">
            <span className="text-subtle flex items-center justify-center">{session.splitMode === "even" ? <Scale size={24} /> : <Target size={24} />}</span>
            <span className="text-main font-medium text-sm">{session.splitMode === "even" ? "Split evenly" : "Choose items"}</span>
          </div>
        </div>

        {/* Paid By section */}
        <div className="bg-surface p-4 rounded-xl">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-subtle uppercase tracking-wide">Paid By</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {session.participants.map(p => (
              <button
                key={p.name}
                onClick={() => {
                  if (session.paidBy !== p.name) {
                    updateSession(id, { paidBy: p.name });
                    setSession({ ...session, paidBy: p.name });
                  }
                }}
                className={clsx(
                  "rounded-xl py-2 px-2 text-sm font-medium transition-all flex items-center gap-2",
                  session.paidBy === p.name ? "bg-brand text-white shadow-md shadow-brand/20" : "bg-muted border border-divider text-main hover:bg-muted"
                )}
              >
                <AnimalAvatar name={p.name} customIcon={p.icon} className="w-6 h-6 flex-shrink-0" />
                <span className="truncate">{p.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Manage Participants */}
        <div className="bg-surface p-4 rounded-xl">
          <p className="text-xs text-subtle uppercase tracking-wide mb-3">Manage Participants</p>
          <div className="bg-muted border border-divider rounded-xl divide-y divide-divider/50">
            {session.participants.map(p => (
              <div key={p.name} className="flex items-center justify-between p-3">
                <span className="text-main text-sm flex items-center gap-2">
                  <AnimalAvatar name={p.name} customIcon={p.icon} className="w-8 h-8" /> {p.name} {p.name === myName && <span className="text-subtle text-xs">(you)</span>}
                </span>
                {p.name !== myName && (
                  <button
                    onClick={() => handleRemoveParticipant(p.name)}
                    className="px-3 py-1.5 rounded-lg bg-red-500/10 text-red-500 text-xs font-semibold hover:bg-red-500/20 transition-colors"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Payment Details — payer or owner can set this up */}
        {(myName === session.paidBy || myName === session.owner) && (
          <div className="bg-surface p-4 rounded-xl">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-subtle uppercase tracking-wide">Payment Details</p>
              {!session.paidByPhone && !session.qrImage && myName === session.paidBy && (
                <span className="text-[10px] text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded-full font-bold uppercase tracking-wide animate-pulse">Setup needed</span>
              )}
            </div>
            <p className="text-subtle text-xs mb-4">Set your phone / TNG QR so others know how to pay you back.</p>

            <div className="space-y-3">
              <div>
                <label className="text-subtle text-[10px] uppercase tracking-wide mb-1 block">Phone / DuitNow ID</label>
                <div className="flex items-center gap-2 bg-muted border border-divider rounded-xl px-3 py-2.5">
                  <Phone size={14} className="text-subtle flex-shrink-0" />
                  <input
                    type="text"
                    value={payerPhone}
                    onChange={(e) => setPayerPhone(e.target.value)}
                    placeholder="e.g. 0123456789"
                    className="flex-1 bg-transparent text-main text-sm placeholder-subtle focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-subtle text-[10px] uppercase tracking-wide mb-1 block">TNG / DuitNow QR Code</label>
                <input ref={qrInputRef} type="file" accept="image/*" onChange={handleQRUpload} className="hidden" />
                <button
                  onClick={() => qrInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-divider rounded-xl p-3 text-center hover:border-brand hover:bg-brand/5 transition-all"
                >
                  {payerQR ? (
                    <div className="flex items-center gap-3">
                      <img src={payerQR} alt="QR" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                      <span className="text-brand text-sm font-semibold">QR uploaded · tap to change</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 justify-center text-subtle">
                      <QrCode size={20} />
                      <span className="text-sm">Upload TNG / DuitNow QR</span>
                    </div>
                  )}
                </button>
              </div>

              <button
                onClick={handleSavePaymentDetails}
                disabled={savingPayment || (payerPhone.trim() === (session.paidByPhone || "") && payerQR === (session.qrImage || ""))}
                className="w-full bg-brand text-white font-bold rounded-xl py-3 text-sm flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-opacity-90 active:scale-95 transition-all"
              >
                <Save size={14} /> {savingPayment ? "Saving..." : "Save Payment Details"}
              </button>
            </div>
          </div>
        )}

        {/* Reset Claims */}
        {(session.owner === myName) && (
          <div className="bg-surface p-4 rounded-xl border border-yellow-500/20 mt-8">
            <p className="text-xs text-yellow-500 uppercase tracking-wide mb-3 font-semibold">Reset Claims</p>
            <p className="text-subtle text-xs mb-3">Clear who selected what. Items and participants remain.</p>
            <button
              onClick={async () => {
                if (confirm("Are you sure you want to reset all item claims?")) {
                  const resetItems = session.items.map(item => ({ ...item, assignedTo: {} }));
                  await updateSession(id, { items: resetItems });
                  setSession({ ...session, items: resetItems });
                }
              }}
              className="w-full bg-yellow-500/10 text-yellow-600 font-bold rounded-xl py-3 hover:bg-yellow-500/20 transition-colors"
            >
              Reset All Claims
            </button>
          </div>
        )}

        {/* Danger Zone */}
        <div className="bg-surface p-4 rounded-xl border border-red-500/20 mt-4">
          <p className="text-xs text-red-400 uppercase tracking-wide mb-3 font-semibold">Danger Zone</p>
          <button
            onClick={async () => {
              if (confirm("Are you sure you want to delete this room? This cannot be undone.")) {
                await deleteSession(id);
                router.push("/");
              }
            }}
            className="w-full bg-red-500/10 text-red-500 font-bold rounded-xl py-3 hover:bg-red-500/20 transition-colors"
          >
            Delete Room
          </button>
        </div>
          </>
        )}
      </div>

      {/* Split Method Popup */}
      {showSplitPopup && (
        <div className="fixed inset-0 z-50 bg-black/80  flex items-end sm:items-center justify-center sm:p-6" onClick={() => setShowSplitPopup(false)}>
          <div className="w-full max-w-md bg-surface rounded-t-3xl sm:rounded-2xl p-6 shadow-sm animate-in slide-in-from-bottom-8 duration-300" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-main font-bold text-lg">Change Split Method</h2>
              <button onClick={() => setShowSplitPopup(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-muted text-subtle hover:text-main transition-colors">✕</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleSplitModeChange("even")}
                className={clsx(
                  "rounded-xl py-3 text-sm font-medium transition-all shadow-sm",
                  session.splitMode === "even" ? "bg-brand text-white shadow-md shadow-brand/20" : "bg-muted border border-divider text-main hover:bg-muted"
                )}
              >
                <span className="flex items-center gap-2"><Scale size={18} className="text-subtle" /> Split evenly</span>
              </button>
              <button
                onClick={() => handleSplitModeChange("byItem")}
                className={clsx(
                  "rounded-xl py-3 text-sm font-medium transition-all shadow-sm",
                  session.splitMode === "byItem" ? "bg-brand text-white shadow-md shadow-brand/20" : "bg-muted border border-divider text-main hover:bg-muted"
                )}
              >
                <span className="flex items-center gap-2"><Target size={18} className="text-subtle" /> Choose items</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
