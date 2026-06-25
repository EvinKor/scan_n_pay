"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getSession, updateSession, subscribeToSession, deleteSession, Session } from "@/lib/session";
import { getLocalUser, getLocalUserForRoom } from "@/lib/identity";
import { Scale, Target } from "lucide-react";
import { AnimalAvatar } from "@/components/AnimalAvatar";
import clsx from "clsx";

export default function RoomSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [session, setSession] = useState<Session | null>(null);
  const [showSplitPopup, setShowSplitPopup] = useState(false);
  const [localGroupName, setLocalGroupName] = useState("");

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

        {/* Danger Zone */}
        <div className="bg-surface p-4 rounded-xl border border-red-500/20 mt-8">
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
