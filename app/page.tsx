"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSession, joinSession } from "@/lib/session";
import { setLocalUser, setLocalUserForRoom, getLocalUser } from "@/lib/identity";
import { supabase } from "@/lib/supabase";
import InstallPWA from "@/components/InstallPWA";

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [mode, setMode] = useState<"idle" | "create" | "join" | "auth" | "settings" | "guest">("idle");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [qrImage, setQrImage] = useState<string>("");
  const [splitMode, setSplitMode] = useState<"even" | "byItem">("even");
  const [user, setUser] = useState<any>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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

  async function handleGoogleSignIn() {
    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
  }

  async function handleEmailSignIn() {
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      // If sign in fails, try sign up
      const { error: signUpError } = await supabase.auth.signUp({ email, password });
      if (signUpError) setError(signUpError.message);
      else setError("Check your email for the confirmation link!");
    }
    setLoading(false);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setName("");
  }



  async function handleCreate() {
    if (!name.trim()) return setError("Enter your name first");
    setLoading(true);
    try {
      const session = await createSession(name.trim(), splitMode, qrImage || undefined);
      setLocalUser({ name: name.trim(), sessionId: session.id });
      setLocalUserForRoom(session.id, name.trim());
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
      const session = await joinSession(code.trim().toUpperCase(), name.trim());
      setLocalUser({ name: name.trim(), sessionId: session.id });
      setLocalUserForRoom(session.id, name.trim());
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
          onClick={() => setMode("settings")}
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
              <button onClick={() => setMode("auth")} className="w-full bg-brand text-black font-bold rounded-xl py-3 hover:bg-opacity-90 transition-all shadow-[0_0_15px_rgba(0,200,150,0.2)]">
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
              <button onClick={() => setMode("auth")} className="text-brand hover:underline">Log in to save profile</button>
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

        {mode === "settings" && (
          <div className="bg-surface border border-zinc-700 rounded-xl p-4 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-white font-semibold">Settings</h3>
              <button onClick={() => setMode("idle")} className="text-zinc-500 hover:text-white text-sm bg-zinc-800 w-8 h-8 rounded-full flex items-center justify-center">✕</button>
            </div>
            
            <div className="space-y-3">
              {user ? (
                <div className="bg-zinc-800/50 rounded-xl p-4 flex flex-col items-center gap-2 border border-zinc-700/50">
                  <div className="w-12 h-12 rounded-full bg-brand/20 flex items-center justify-center text-xl">👤</div>
                  <div className="text-center">
                    <p className="text-white font-bold">{name}</p>
                    <p className="text-zinc-500 text-xs">{user.email}</p>
                  </div>
                  <button onClick={() => { handleSignOut(); setMode("idle"); }} className="mt-2 w-full bg-red-500/10 text-red-500 font-semibold rounded-lg py-2 hover:bg-red-500/20 transition-all text-sm">
                    Sign out
                  </button>
                </div>
              ) : (
                <button onClick={() => setMode("auth")} className="w-full bg-brand text-black font-semibold rounded-lg py-3 shadow-[0_0_15px_rgba(0,200,150,0.2)]">
                  Sign In / Sign Up
                </button>
              )}
              
              <InstallPWA />
            </div>
          </div>
        )}

        {mode === "auth" && (
          <div className="bg-surface border border-zinc-700 rounded-xl p-4 space-y-4">
            <h3 className="text-white font-semibold text-center mb-2">Sign In / Sign Up</h3>
            <button
              onClick={handleGoogleSignIn}
              className="w-full bg-white text-black font-semibold rounded-xl py-3 hover:bg-gray-100 transition-all flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" /><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" /><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
              Continue with Google
            </button>
            <div className="relative flex items-center py-2">
              <div className="flex-grow border-t border-zinc-700"></div>
              <span className="flex-shrink-0 mx-4 text-zinc-500 text-xs uppercase">or</span>
              <div className="flex-grow border-t border-zinc-700"></div>
            </div>
            <div className="space-y-3">
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-zinc-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand"
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-zinc-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand"
              />
              <button
                onClick={handleEmailSignIn}
                disabled={loading}
                className="w-full bg-brand text-black font-semibold rounded-lg py-2 hover:bg-opacity-90 transition-all disabled:opacity-50"
              >
                {loading ? "Please wait..." : "Sign In / Sign Up"}
              </button>
            </div>
            <button onClick={() => setMode("idle")} className="w-full text-zinc-500 text-sm py-2 mt-2">
              ← Back
            </button>
          </div>
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
