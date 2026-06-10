"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getSession, updateSession, subscribeToSession, deleteSession, Session } from "@/lib/session";
import { getLocalUser, getLocalUserForRoom } from "@/lib/identity";
import { getAnimalIcon } from "@/lib/animals";
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
        <button onClick={() => router.push(`/room/${id}`)} className="w-8 h-8 flex flex-shrink-0 items-center justify-center rounded-full bg-surface border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors">
          ←
        </button>
        <h1 className="text-xl font-bold text-white">Room Settings</h1>
      </div>

      <div className="px-4 space-y-6">
        {/* Group Name - Available to everyone */}
        <div className="bg-surface p-4 rounded-xl">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-zinc-500 uppercase tracking-wide">Group Name</p>
            <p className="text-xs text-zinc-600 font-mono">{localGroupName.length}/30</p>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={localGroupName}
              onChange={(e) => setLocalGroupName(e.target.value)}
              className="flex-1 w-full bg-muted border border-zinc-700/50 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-brand transition-colors text-sm font-medium"
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
              className="bg-brand text-black font-bold px-5 rounded-xl disabled:opacity-50 disabled:bg-zinc-700 disabled:text-zinc-500 hover:bg-opacity-90 transition-colors text-sm"
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
            <p className="text-xs text-zinc-500 uppercase tracking-wide">Split method</p>
            <button onClick={() => setShowSplitPopup(true)} className="bg-brand/10 text-brand px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-brand/20 transition-colors">
              Change
            </button>
          </div>
          <div className="bg-muted border border-zinc-700/50 rounded-xl px-4 py-3 flex items-center gap-3">
            <span className="text-2xl">{session.splitMode === "even" ? "⚖️" : "🎯"}</span>
            <span className="text-white font-medium text-sm">{session.splitMode === "even" ? "Split evenly" : "Choose items"}</span>
          </div>
        </div>

        {/* Manage Participants */}
        <div className="bg-surface p-4 rounded-xl">
          <p className="text-xs text-zinc-500 uppercase tracking-wide mb-3">Manage Participants</p>
          <div className="bg-muted border border-zinc-700/50 rounded-xl divide-y divide-zinc-700/50">
            {session.participants.map(p => (
              <div key={p.name} className="flex items-center justify-between p-3">
                <span className="text-white text-sm flex items-center gap-2">
                  <span className="text-xl">{p.icon || getAnimalIcon(p.name)}</span> {p.name} {p.name === myName && <span className="text-zinc-500 text-xs">(you)</span>}
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
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-6" onClick={() => setShowSplitPopup(false)}>
          <div className="w-full max-w-md bg-surface rounded-t-3xl sm:rounded-2xl p-6 shadow-2xl animate-in slide-in-from-bottom-8 duration-300" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-white font-bold text-lg">Change Split Method</h2>
              <button onClick={() => setShowSplitPopup(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-zinc-800 text-zinc-400 hover:text-white transition-colors">✕</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleSplitModeChange("even")}
                className={clsx(
                  "rounded-xl py-3 text-sm font-medium transition-all shadow-sm",
                  session.splitMode === "even" ? "bg-brand text-black shadow-[0_0_15px_rgba(0,200,150,0.2)]" : "bg-muted border border-zinc-700/50 text-zinc-300 hover:bg-zinc-800"
                )}
              >
                ⚖️ Split evenly
              </button>
              <button
                onClick={() => handleSplitModeChange("byItem")}
                className={clsx(
                  "rounded-xl py-3 text-sm font-medium transition-all shadow-sm",
                  session.splitMode === "byItem" ? "bg-brand text-black shadow-[0_0_15px_rgba(0,200,150,0.2)]" : "bg-muted border border-zinc-700/50 text-zinc-300 hover:bg-zinc-800"
                )}
              >
                🎯 Choose items
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
