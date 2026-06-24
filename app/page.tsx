"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSession, joinSession } from "@/lib/session";
import { setLocalUser, setLocalUserForRoom, getLocalUser, getLocalHistory } from "@/lib/identity";
import { supabase } from "@/lib/supabase";
import { AnimalAvatar } from "@/components/AnimalAvatar";
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
      if (session?.user) fetchProfile(session.user.id, session.user.email);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      if (session?.user) fetchProfile(session.user.id, session.user.email);
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
      // Only show install dialog when they click the logo now
      // setShowInstallDialog(true);
    };
    window.addEventListener('beforeinstallprompt', installHandler);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('beforeinstallprompt', installHandler);
    };
  }, []);

  async function fetchProfile(userId: string, email?: string) {
    const { data } = await supabase.from("profiles").select("display_name, icon").eq("id", userId).maybeSingle();
    if (data?.display_name) {
      setName(data.display_name);
      setIcon(data.icon || "");
      loadAllHistory(data.display_name);
    } else {
      const defaultName = email ? email.split('@')[0] : "User";
      await supabase.from("profiles").upsert({ id: userId, display_name: defaultName }, { onConflict: "id", ignoreDuplicates: true });
      setName(defaultName);
      loadAllHistory(defaultName);
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
            className="w-full h-auto drop-shadow-md rounded-xl cursor-pointer active:scale-95 transition-transform relative z-10" 
            onClick={handleLogoClick} 
          />
          
          {/* Click me Indicator */}
          {deferredPrompt && !showInstallDialog && (
            <div className="absolute -top-2 -right-2 bg-surface/90 backdrop-blur-sm border border-divider text-subtle text-[10px] font-medium px-2.5 py-1 rounded-full shadow-sm rotate-[8deg] animate-pulse pointer-events-none z-20 whitespace-nowrap">
              Click me
            </div>
          )}
          
          {/* Install Speech Bubble (Responsive Toast) */}
          {showInstallDialog && (
            <div 
              className="fixed bottom-6 left-1/2 -translate-x-1/2 md:absolute md:bottom-auto md:top-1/2 md:left-[110%] md:-translate-x-0 md:-translate-y-1/2 w-[90vw] md:w-[220px] bg-surface/90 backdrop-blur-xl border border-divider p-4 rounded-2xl shadow-[0_10px_40px_rgb(0,0,0,0.5)] z-[100] animate-in fade-in slide-in-from-bottom-4 md:slide-in-from-left-4 duration-300 text-left"
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
              {/* Pointer (Only on desktop) */}
              <div className="hidden md:block absolute top-1/2 -left-2 -translate-y-1/2 w-4 h-4 bg-surface/90 backdrop-blur-md border-b border-l border-divider rotate-45" />
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
          <div className="bg-surface/80 backdrop-blur-md border border-brand/30 rounded-xl p-4 flex items-center gap-4">
            <AnimalAvatar name={name || user.email} customIcon={icon} className="w-16 h-16 text-xl" />
            <div className="text-left">
              <p className="text-main font-semibold">Welcome back!</p>
              <p className="text-brand font-mono">{name || user.email}</p>
            </div>
          </div>
        ) : mode === "idle" ? (
          <div className="bg-surface/80 backdrop-blur-md border border-divider rounded-xl p-6 text-center space-y-4 shadow-[0_8px_30px_rgb(0,0,0,0.5)]">
            <div className="w-16 h-16 rounded-full bg-brand/20 flex items-center justify-center text-brand mx-auto mb-2">
              <svg xmlns="http://www.w3.org/0000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>
            </div>
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
                <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                  {history.map(h => {
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
      <div className="mt-16 space-y-4 text-center pb-8">
        <p className="text-subtle text-xs">
          No account needed · Works offline · Pay via TNG
        </p>
        <div className="flex justify-center gap-4">
          <button 
            onClick={() => router.push("/support")}
            className="text-subtle hover:text-brand transition-colors p-2"
          >
            <svg xmlns="http://www.w3.org/0000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
          </button>
          <a 
            href="https://www.instagram.com/us_b3ing_us?igsh=MWxhYXl2ZmF0Y3p6MA%3D%3D&utm_source=qr"
            target="_blank"
            rel="noopener noreferrer"
            className="text-subtle hover:text-[#E1306C] transition-colors p-2"
          >
            <svg xmlns="http://www.w3.org/0000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>
          </a>
        </div>
      </div>


    </main>
  );
}

