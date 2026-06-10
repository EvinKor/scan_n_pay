"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { joinSession } from "@/lib/session";
import { setLocalUser, setLocalUserForRoom, getLocalUser } from "@/lib/identity";
import { supabase } from "@/lib/supabase";

export default function JoinPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null);
      if (session?.user) fetchProfile(session.user.id);
      else loadLocalName();
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      if (session?.user) fetchProfile(session.user.id);
      else loadLocalName();
    });

    return () => subscription.unsubscribe();
  }, []);

  function loadLocalName() {
    const local = getLocalUser();
    if (local && local.name) {
      setName(local.name);
    }
  }

  async function fetchProfile(userId: string) {
    const { data } = await supabase.from("profiles").select("display_name").eq("id", userId).single();
    if (data?.display_name) {
      setName(data.display_name);
    }
  }

  async function handleJoin() {
    if (!name.trim()) return setError("Enter your name first");
    if (!code.trim()) return setError("Enter a room code");
    setLoading(true);
    try {
      const local = getLocalUser();
      const session = await joinSession(code.trim().toUpperCase(), name.trim(), local?.icon);
      setLocalUser({ name: name.trim(), sessionId: session.id, icon: local?.icon });
      setLocalUserForRoom(session.id, name.trim(), local?.icon);
      router.push(`/room/${session.id}`);
    } catch (e: any) {
      setError(e.message || "Room not found. Check the code.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-12 max-w-sm mx-auto">
      <div className="w-full space-y-6">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-surface border border-zinc-700 mb-4">
            <span className="text-3xl">🤝</span>
          </div>
          <h1 className="text-3xl font-bold font-mono text-white tracking-tight">Join Room</h1>
          <p className="text-zinc-400 mt-1 text-sm">Enter a code to join your friends</p>
        </div>

        <div>
          <label className="text-zinc-500 text-xs uppercase tracking-wide mb-1 flex justify-between">
            <span>Your name</span>
            {!user && <button onClick={() => router.push("/login")} className="text-brand hover:underline">Log in to save profile</button>}
          </label>
          <input
            type="text"
            placeholder="Your display name"
            value={name}
            onChange={(e) => { setName(e.target.value); setError(""); }}
            className="w-full bg-surface border border-muted rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-brand transition-colors"
            maxLength={24}
          />
          <p className="text-zinc-600 text-xs mt-1">
            {user ? "You can change your display name for this room" : "Random name generated · change it if you want"}
          </p>
        </div>

        <div>
          <label className="text-zinc-500 text-xs uppercase tracking-wide mb-2 block">
            Room Code
          </label>
          <input
            type="text"
            placeholder="e.g. MAKAN-7X2"
            value={code}
            onChange={(e) => { setCode(e.target.value); setError(""); }}
            className="w-full bg-surface border border-muted rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-brand transition-colors uppercase font-mono tracking-widest"
            maxLength={10}
          />
        </div>
        
        <div className="space-y-3 pt-2">
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          <button
            onClick={handleJoin}
            disabled={loading}
            className="w-full bg-brand text-black font-semibold rounded-xl py-3 hover:bg-opacity-90 active:scale-95 transition-all disabled:opacity-50"
          >
            {loading ? "Joining..." : "Join Room →"}
          </button>
          <button onClick={() => router.push("/")} className="w-full text-zinc-500 text-sm py-2 hover:text-white transition-colors">
            ← Back to Home
          </button>
        </div>
      </div>
    </main>
  );
}
