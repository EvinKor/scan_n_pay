"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSession, joinSession } from "@/lib/session";
import { setLocalUser, setLocalUserForRoom, getLocalUser } from "@/lib/identity";
import { supabase } from "@/lib/supabase";

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [mode, setMode] = useState<"idle" | "create" | "join" | "auth" | "guest">("idle");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [qrImage, setQrImage] = useState<string>("");
  const [splitMode, setSplitMode] = useState<"even" | "byItem">("even");
  const [user, setUser] = useState<any>(null);
  const [recentRoom, setRecentRoom] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    // Check current auth session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null);
      if (session?.user) fetchProfile(session.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      if (session?.user) fetchProfile(session.user.id);
    });

    // Check recent room from legacy identity
    const local = getLocalUser();
    if (local && local.sessionId) {
      setRecentRoom(local.sessionId);
    }

    return () => subscription.unsubscribe();
  }, []);

  async function fetchProfile(userId: string) {
    const { data } = await supabase.from("profiles").select("display_name").eq("id", userId).single();
    if (data?.display_name) {
      setName(data.display_name);
      fetchHistory(data.display_name);
    }
  }

  async function fetchHistory(displayName: string) {
    const { data } = await supabase
      .from("sessions")
      .select("id, code, created_at, participants, items, totals")
      .contains("participants", `[{"name": "${displayName}"}]`)
      .order("created_at", { ascending: false })
      .limit(5);
    
    if (data) setHistory(data);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setName("");
  }



  async function handleCreate() {
    if (!name.trim()) return setError("Enter your name first");
    setLoading(true);
    try {
      const local = getLocalUser();
      const session = await createSession(name.trim(), splitMode, qrImage || undefined, local?.icon);
      setLocalUser({ name: name.trim(), sessionId: session.id, icon: local?.icon });
      setLocalUserForRoom(session.id, name.trim(), local?.icon);
      router.push(`/scan?session=${session.id}`);
    } catch (e) {
      setError("Failed to create session. Try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleQRUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX = 800; // compress
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
          else { w = Math.round(w * MAX / h); h = MAX; }
        }
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
        setQrImage(canvas.toDataURL("image/jpeg", 0.7));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
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
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
      {/* Logo */}
      <div className="mb-12 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand mb-4">
          <span className="text-3xl">🧾</span>
        </div>
        <h1 className="text-3xl font-bold font-mono text-white tracking-tight">
          SplitLah
        </h1>
        <p className="text-zinc-400 mt-1 text-sm">Scan. Split. Pay via TNG.</p>
      </div>

      {/* User profile or Name input */}
      <div className="w-full max-w-sm space-y-3 relative">
        {/* Settings Gear */}
        <button 
          onClick={() => router.push("/setting")}
          className="absolute -top-20 right-0 w-10 h-10 flex items-center justify-center rounded-full bg-surface border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors z-50"
        >
          ⚙️
        </button>

        {user ? (
          <div className="bg-surface border border-brand/30 rounded-xl p-4 flex flex-col items-center gap-2">
            <div className="w-12 h-12 rounded-full bg-brand/20 flex items-center justify-center text-xl">
              👤
            </div>
            <div className="text-center">
              <p className="text-white font-semibold">Welcome back!</p>
              <p className="text-brand font-mono">{name || user.email}</p>
            </div>
          </div>
        ) : mode === "idle" ? (
          <div className="bg-surface border border-zinc-700 rounded-xl p-6 text-center space-y-4 shadow-2xl">
            <div className="w-16 h-16 rounded-full bg-brand/20 flex items-center justify-center text-3xl mx-auto mb-2">👋</div>
            <h2 className="text-white font-bold text-lg">Welcome to SplitLah</h2>
            <p className="text-zinc-400 text-sm">Log in to save your split history, or continue as a guest.</p>
            
            <div className="space-y-3 pt-2">
              <button onClick={() => router.push("/login")} className="w-full bg-brand text-black font-bold rounded-xl py-3 hover:bg-opacity-90 transition-all shadow-[0_0_15px_rgba(0,200,150,0.2)]">
                Sign In / Sign Up
              </button>
              <button onClick={() => setMode("guest")} className="w-full bg-zinc-800 text-zinc-300 font-semibold rounded-xl py-3 hover:bg-zinc-700 transition-all">
                Continue as Guest
              </button>
            </div>
          </div>
        ) : mode === "guest" || mode === "create" || mode === "join" ? (
          <div>
            <label className="text-zinc-500 text-xs uppercase tracking-wide mb-1 flex justify-between">
              <span>Your name</span>
              <button onClick={() => router.push("/login")} className="text-brand hover:underline">Log in to save profile</button>
            </label>
            <input
              type="text"
              placeholder="Your display name"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(""); }}
              className="w-full bg-surface border border-muted rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-brand transition-colors"
              maxLength={24}
            />
            <p className="text-zinc-600 text-xs mt-1">Random name generated · change it if you want</p>
          </div>
        ) : null}

        {/* Action buttons */}
        {((mode === "idle" && user) || mode === "guest") && (
          <>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                onClick={() => setMode("create")}
                className="bg-brand text-black font-semibold rounded-xl py-3 hover:bg-opacity-90 active:scale-95 transition-all shadow-[0_0_15px_rgba(0,200,150,0.2)]"
              >
                New Bill
              </button>
              <button
                onClick={() => setMode("join")}
                className="bg-surface text-white font-semibold rounded-xl py-3 border border-zinc-700 hover:bg-zinc-800 active:scale-95 transition-all"
              >
                Join Room
              </button>
            </div>
            
            {/* Session History */}
            {history.length > 0 && user && (
              <div className="mt-6 pt-4 border-t border-zinc-800">
                <h3 className="text-zinc-400 text-xs uppercase tracking-widest font-bold mb-3">Recent Bills</h3>
                <div className="space-y-2">
                  {history.map(h => {
                    const myTotal = h.totals?.[name] ?? 0;
                    return (
                      <button
                        key={h.id}
                        onClick={() => router.push(`/room/${h.id}`)}
                        className="w-full bg-surface border border-zinc-700 rounded-xl p-3 flex items-center justify-between hover:bg-zinc-800 transition-colors text-left"
                      >
                        <div>
                          <p className="text-white font-mono font-bold text-sm">{h.code}</p>
                          <p className="text-zinc-500 text-xs">{new Date(h.created_at).toLocaleDateString()}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-brand font-mono font-bold text-sm">RM {myTotal.toFixed(2)}</p>
                          <p className="text-zinc-500 text-[10px] uppercase">Your share</p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
            
            {recentRoom && history.length === 0 && (
              <button
                onClick={() => router.push(`/room/${recentRoom}`)}
                className="w-full mt-4 bg-brand/10 text-brand text-sm font-semibold rounded-xl py-3 hover:bg-brand/20 transition-all border border-brand/20"
              >
                ↩ Resume Recent Room
              </button>
            )}
          </>
        )}





        {mode === "create" && (
          <div className="space-y-4">
            <div>
              <label className="text-zinc-500 text-xs uppercase tracking-wide mb-2 block">
                Split Method
              </label>
              <div className="grid grid-cols-2 gap-2 mb-4">
                <button
                  onClick={() => setSplitMode("even")}
                  className={`rounded-xl py-3 text-sm font-medium transition-all ${splitMode === "even" ? "bg-brand text-black shadow-[0_0_10px_rgba(0,200,150,0.2)]" : "bg-surface border border-zinc-700 text-zinc-400 hover:text-white"}`}
                >
                  ⚖️ Split evenly
                </button>
                <button
                  onClick={() => setSplitMode("byItem")}
                  className={`rounded-xl py-3 text-sm font-medium transition-all ${splitMode === "byItem" ? "bg-brand text-black shadow-[0_0_10px_rgba(0,200,150,0.2)]" : "bg-surface border border-zinc-700 text-zinc-400 hover:text-white"}`}
                >
                  🎯 Pick individually
                </button>
              </div>

              <label className="text-zinc-500 text-xs uppercase tracking-wide mb-1 block">
                Payment QR Code (Optional)
              </label>
              <div className="relative group cursor-pointer border-2 border-dashed border-zinc-700 rounded-xl p-4 text-center hover:border-brand hover:bg-brand/5 transition-all">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleQRUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                {qrImage ? (
                  <div className="flex flex-col items-center gap-2">
                    <img src={qrImage} alt="QR Code" className="w-16 h-16 rounded-lg object-cover" />
                    <span className="text-brand text-xs font-semibold">QR Uploaded! (Tap to change)</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-2xl">📱</span>
                    <span className="text-zinc-400 text-sm">Upload your TNG/DuitNow QR</span>
                    <span className="text-zinc-600 text-xs">Guests can save & scan it to pay</span>
                  </div>
                )}
              </div>
            </div>
            
            <div className="space-y-3 pt-2">
              <button
                onClick={handleCreate}
                disabled={loading}
                className="w-full bg-brand text-black font-semibold rounded-xl py-3 hover:bg-opacity-90 active:scale-95 transition-all disabled:opacity-50"
              >
                {loading ? "Creating..." : "Create & Scan Receipt →"}
              </button>
              <button onClick={() => setMode("idle")} className="w-full text-zinc-500 text-sm py-2">
                ← Back
              </button>
            </div>
          </div>
        )}

        {mode === "join" && (
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Room code (e.g. MAKAN-7X2)"
              value={code}
              onChange={(e) => { setCode(e.target.value); setError(""); }}
              className="w-full bg-surface border border-muted rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-brand transition-colors uppercase font-mono tracking-widest"
              maxLength={10}
            />
            <button
              onClick={handleJoin}
              disabled={loading}
              className="w-full bg-brand text-black font-semibold rounded-xl py-3 hover:bg-opacity-90 active:scale-95 transition-all disabled:opacity-50"
            >
              {loading ? "Joining..." : "Join Room →"}
            </button>
            <button onClick={() => setMode("idle")} className="w-full text-zinc-500 text-sm py-2">
              ← Back
            </button>
          </div>
        )}

        {error && (
          <p className="text-red-400 text-sm text-center">{error}</p>
        )}
      </div>

      {/* Footer */}
      <p className="mt-16 text-zinc-600 text-xs text-center">
        No account needed · Works offline · Pay via TNG
      </p>
    </main>
  );
}
