"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSession, joinSession } from "@/lib/session";
import { setLocalUser, setLocalUserForRoom, getLocalUser, getLocalHistory } from "@/lib/identity";
import { supabase } from "@/lib/supabase";
import { getAnimalIcon } from "@/lib/animals";
import clsx from "clsx";

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"idle" | "guest">("idle");
  const [user, setUser] = useState<any>(null);
  const [icon, setIcon] = useState<string>("");
  const [recentRoom, setRecentRoom] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallDialog, setShowInstallDialog] = useState(false);

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
    if (local && local.name) {
      setName(local.name);
    }

    // Initial history load (using local name if available)
    loadAllHistory(local?.name || "");

    const installHandler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallDialog(true);
    };
    window.addEventListener('beforeinstallprompt', installHandler);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('beforeinstallprompt', installHandler);
    };
  }, []);

  async function fetchProfile(userId: string) {
    const { data } = await supabase.from("profiles").select("display_name, icon").eq("id", userId).single();
    if (data?.display_name) {
      setName(data.display_name);
      setIcon(data.icon || "");
      loadAllHistory(data.display_name);
    }
  }

  async function loadAllHistory(displayName: string) {
    const localRoomIds = getLocalHistory();
    let dbData: any[] = [];
    let localData: any[] = [];

    if (displayName) {
      const { data } = await supabase
        .from("sessions")
        .select("id, code, created_at, data")
        .contains("data->participants", `[{"name": "${displayName}"}]`)
        .neq("deleted", true)
        .order("created_at", { ascending: false })
        .limit(10);
      if (data) dbData = data;
    }

    if (localRoomIds.length > 0) {
      const { data } = await supabase
        .from("sessions")
        .select("id, code, created_at, data")
        .in("id", localRoomIds)
        .neq("deleted", true);
      if (data) localData = data;
    }

    // Merge by unique ID
    const merged = [...dbData];
    localData.forEach(ld => {
      if (!merged.find(m => m.id === ld.id)) merged.push(ld);
    });

    // Sort descending by created_at
    merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setHistory(merged);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setName("");
  }

  function handleLogoClick() {
    if (deferredPrompt) {
      setShowInstallDialog(!showInstallDialog);
    }
  }

  function handleInstall() {
    setShowInstallDialog(false);
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then((choiceResult: any) => {
        setDeferredPrompt(null);
      });
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
      {/* Logo */}
      <div className="mb-12 text-center relative z-10 flex flex-col items-center">
        <div className="w-48 relative">
          <img 
            src="/app_icon.png" 
            alt="Split Lah Logo" 
            className="w-full h-auto drop-shadow-md rounded-xl cursor-pointer active:scale-95 transition-transform" 
            onClick={handleLogoClick} 
          />
          
          {/* Install Speech Bubble (Side) */}
          {showInstallDialog && (
            <div 
              className="absolute top-1/2 left-[110%] -translate-y-1/2 w-[220px] bg-surface/80 backdrop-blur-xl border border-divider p-4 rounded-2xl shadow-[0_10px_40px_rgb(0,0,0,0.5)] z-50 animate-in fade-in slide-in-from-left-4 duration-300 text-left"
              onClick={e => e.stopPropagation()}
            >
              <button 
                onClick={(e) => { e.stopPropagation(); setShowInstallDialog(false); }}
                className="absolute top-3 right-3 text-subtle hover:text-main w-6 h-6 flex items-center justify-center rounded-full hover:bg-muted/50 transition-colors"
              >
                ✕
              </button>
              <h3 className="text-sm font-bold text-main mb-1 pr-6">Add to Home?</h3>
              <p className="text-subtle text-[11px] mb-3 leading-tight">Install SplitLah for quick access.</p>
              <button 
                onClick={handleInstall}
                className="w-full bg-brand text-white font-bold rounded-xl py-2.5 text-xs hover:bg-opacity-90 active:scale-95 transition-all shadow-md shadow-brand/20"
              >
                Install App
              </button>
              {/* Triangle pointer to the left */}
              <div className="absolute top-1/2 -left-2 -translate-y-1/2 w-4 h-4 bg-surface/80 backdrop-blur-md border-b border-l border-divider rotate-45" />
            </div>
          )}
        </div>
        <p className="text-subtle mt-2 text-sm">Scan. Split. Pay via TNG.</p>
      </div>

      {/* User profile or Name input */}
      <div className="w-full max-w-sm space-y-3 relative">
        {user && (
          <button
            onClick={() => router.push("/setting")}
            className="absolute -top-20 right-0 w-10 h-10 flex items-center justify-center rounded-full bg-surface/80 backdrop-blur-md border border-divider text-main hover:bg-muted transition-colors z-50"
          >
            ⚙️
          </button>
        )}

        {user ? (
          <div className="bg-surface/80 backdrop-blur-md border border-brand/30 rounded-xl p-4 flex flex-col items-center gap-2">
            <div className="w-12 h-12 rounded-full bg-brand/20 flex items-center justify-center text-xl">
              {icon || getAnimalIcon(name || user.email)}
            </div>
            <div className="text-center">
              <p className="text-main font-semibold">Welcome back!</p>
              <p className="text-brand font-mono">{name || user.email}</p>
            </div>
          </div>
        ) : mode === "idle" ? (
          <div className="bg-surface/80 backdrop-blur-md border border-divider rounded-xl p-6 text-center space-y-4 shadow-[0_8px_30px_rgb(0,0,0,0.5)]">
            <div className="w-16 h-16 rounded-full bg-brand/20 flex items-center justify-center text-3xl mx-auto mb-2">👋</div>
            <h2 className="text-main font-bold text-lg">Welcome to SplitLah</h2>
            <p className="text-subtle text-sm">Log in to save your split history, or continue as a guest.</p>

            <div className="space-y-3 pt-2">
              <button onClick={() => router.push("/login")} className="w-full bg-brand text-white font-bold rounded-xl py-3 hover:bg-opacity-90 transition-all shadow-md shadow-brand/20">
                Sign In / Sign Up
              </button>
              <button onClick={() => setMode("guest")} className="w-full bg-muted text-main font-semibold rounded-xl py-3 hover:bg-divider transition-all">
                Continue as Guest
              </button>
            </div>
          </div>
        ) : mode === "guest" ? (
          <div>
            <label className="text-subtle text-xs uppercase tracking-wide mb-1 flex justify-between">
              <span>Your name</span>
              <button onClick={() => router.push("/login")} className="text-brand hover:underline">Log in to save profile</button>
            </label>
            <input
              type="text"
              placeholder="Your display name"
              value={name}
              onChange={(e) => { setName(e.target.value); }}
              className="w-full bg-surface/80 backdrop-blur-md border border-divider rounded-xl px-4 py-3 text-main placeholder-subtle focus:outline-none focus:border-brand transition-colors"
              maxLength={24}
            />
            <p className="text-subtle text-xs mt-1">Random name generated · change it if you want</p>
          </div>
        ) : null}

        {/* Action buttons */}
        {((mode === "idle" && user) || mode === "guest") && (
          <>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                onClick={() => {
                  if (!user && !name.trim()) return;
                  // If not logged in and not named, the guest block is open and they must provide a name.
                  // Actually, create and join pages will handle local user setup, but we could setLocalUser here.
                  if (!user && name.trim()) setLocalUser({ name: name.trim(), sessionId: "" });
                  router.push("/create");
                }}
                className="bg-brand text-white font-semibold rounded-xl py-3 hover:bg-opacity-90 active:scale-95 transition-all shadow-md shadow-brand/20"
              >
                New Bill
              </button>
              <button
                onClick={() => {
                  if (!user && !name.trim()) return;
                  if (!user && name.trim()) setLocalUser({ name: name.trim(), sessionId: "" });
                  router.push("/join");
                }}
                className="bg-surface text-main font-semibold rounded-xl py-3 border border-divider hover:bg-muted active:scale-95 transition-all"
              >
                Join Room
              </button>
            </div>

            {/* Session History */}
            {history.length > 0 && (
              <div className="mt-6 pt-4 border-t border-divider">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-subtle text-xs uppercase tracking-widest font-bold">Recent Bills</h3>
                  {history.length > 3 && (
                    <button
                      onClick={() => router.push("/history")}
                      className="text-brand text-xs font-bold hover:underline"
                    >
                      View Full History →
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {history.slice(0, 3).map(h => {
                    const myTotal = h.data?.totals?.[name] ?? 0;
                    const grandTotal = (h.data?.items?.reduce((s: number, i: any) => s + (Number(i.price) || 0), 0) || 0) + (h.data?.serviceCharge || 0) + (h.data?.sst || 0);
                    const participantsList = Array.isArray(h.data?.participants)
                      ? h.data.participants.map((p: any) => p.name).join(", ")
                      : "";

                    return (
                      <button
                        key={h.id}
                        onClick={() => router.push(`/room/${h.id}`)}
                        className={clsx(
                          "relative overflow-hidden w-full rounded-xl p-3 flex flex-col transition-colors text-left border",
                          h.data?.status === "done"
                            ? "bg-[#015ABF]/10 border-[#015ABF]/30 hover:bg-[#015ABF]/20"
                            : "bg-surface/80 backdrop-blur-md border-divider hover:bg-muted"
                        )}
                      >
                        {h.data?.status === "done" && (
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                            <div className="border-2 border-red-500/80 text-red-500/80 text-xl uppercase tracking-widest font-black px-4 py-1 rotate-[-12deg] rounded-md shadow-sm opacity-90">
                              SETTLED
                            </div>
                          </div>
                        )}
                        <div className="flex items-start justify-between w-full mb-2">
                          <div className="relative z-20">
                            <p className="text-main font-mono font-bold text-sm">{h.data?.name || h.code}</p>
                            <p className="text-subtle text-xs">{new Date(h.created_at).toLocaleDateString()}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-main font-mono font-bold text-sm leading-none mt-1 whitespace-nowrap">RM {grandTotal.toFixed(2)}</p>
                            <p className="text-subtle text-[9px] uppercase mt-0.5 whitespace-nowrap">Total Bill</p>
                          </div>
                        </div>
                        <div className="bg-background rounded-lg p-2 border border-divider/50 w-full mt-2">
                          <p className="text-subtle text-[10px] uppercase tracking-widest font-bold mb-0.5">Owner: {h.data?.owner || "Unknown"}</p>
                          <p className="text-main text-xs line-clamp-1">
                            {participantsList || "Unknown"}
                          </p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <p className="mt-16 text-subtle text-xs text-center">
        No account needed · Works offline · Pay via TNG
      </p>


    </main>
  );
}
