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
  const [isStandalone, setIsStandalone] = useState(false);
  const [installGuideOS, setInstallGuideOS] = useState<'none' | 'ios' | 'android'>('none');

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

    if (window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone) {
      setIsStandalone(true);
    }

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
    if (!isStandalone) {
      setShowInstallDialog(true);
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
        <div className="w-48 relative group">
          <img 
            src="/Logo.png" 
            alt="We Split Logo" 
            className="w-full h-auto drop-shadow-[0_15px_35px_rgba(0,0,0,0.5)] rounded-2xl cursor-pointer group-hover:scale-105 group-hover:rotate-[-2deg] active:scale-95 transition-all duration-500 relative z-10" 
            onClick={handleLogoClick} 
          />
          
          {/* Atmospheric glow behind logo */}
          <div className="absolute inset-0 bg-brand/30 blur-2xl rounded-full scale-125 -z-0 group-hover:bg-brand/50 transition-colors duration-500 animate-pulse"></div>
          <div className="absolute inset-0 bg-blue-500/20 blur-3xl rounded-full scale-150 -z-0 mix-blend-screen translate-x-4 translate-y-4 group-hover:translate-x-6 transition-transform duration-700"></div>
          
          {/* Click me Indicator */}
          {!isStandalone && !showInstallDialog && (
            <div className="absolute -top-2 -right-2 bg-surface/90 backdrop-blur-sm border border-divider text-subtle text-[10px] font-medium px-2.5 py-1 rounded-full shadow-sm rotate-[8deg] animate-pulse pointer-events-none z-20 whitespace-nowrap">
              Click me
            </div>
          )}
          
          {/* Install Modal */}
          {showInstallDialog && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-300" onClick={() => { setShowInstallDialog(false); setInstallGuideOS('none'); }}>
              <div className="bg-surface border border-divider w-full max-w-sm rounded-3xl p-6 shadow-2xl relative animate-in zoom-in-95 duration-300 text-left" onClick={e => e.stopPropagation()}>
                <button onClick={() => { setShowInstallDialog(false); setInstallGuideOS('none'); }} className="absolute top-4 right-4 text-subtle hover:text-main bg-muted/50 rounded-full w-8 h-8 flex items-center justify-center transition-colors"><svg xmlns="http://www.w3.org/0000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
                <img src="/app_icon.png" alt="We Split App Icon" className="w-16 h-16 rounded-2xl drop-shadow-md mb-4" />
                <h3 className="text-xl font-bold text-main mb-2">Add to Home Screen</h3>
                <p className="text-subtle text-sm mb-6">Install We Split for quick access and offline use.</p>
                
                {installGuideOS === 'none' ? (
                  <div>
                    <p className="text-sm text-main font-semibold mb-3">Which device are you using?</p>
                    <div className="grid grid-cols-2 gap-3">
                      <button onClick={() => setInstallGuideOS('ios')} className="bg-surface border border-divider text-main font-semibold rounded-xl py-4 hover:bg-muted active:scale-95 transition-all flex flex-col items-center gap-2">
                        <svg xmlns="http://www.w3.org/0000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20.94c1.5 0 2.75 1.06 4 1.06 3 0 6-8 6-12.22A4.91 4.91 0 0 0 17 5c-2.22 0-4 1.44-5 2-1-.56-2.78-2-5-2a4.9 4.9 0 0 0-5 4.78C2 14 5 22 8 22c1.25 0 2.5-1.06 4-1.06Z"/><path d="M10 2c1 .5 2 2 2 5"/></svg>
                        iOS / iPhone
                      </button>
                      <button 
                        onClick={() => {
                          if (deferredPrompt) {
                            handleInstall();
                          } else {
                            setInstallGuideOS('android');
                          }
                        }} 
                        className="bg-surface border border-divider text-main font-semibold rounded-xl py-4 hover:bg-muted active:scale-95 transition-all flex flex-col items-center gap-2"
                      >
                        <svg xmlns="http://www.w3.org/0000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/></svg>
                        Android
                      </button>
                    </div>
                  </div>
                ) : installGuideOS === 'ios' ? (
                  <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                    <button onClick={() => setInstallGuideOS('none')} className="text-brand text-xs font-bold hover:underline mb-2 flex items-center gap-1"><svg xmlns="http://www.w3.org/0000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg> Back</button>
                    <div className="flex items-center gap-4 bg-muted/30 p-4 rounded-2xl border border-divider/50">
                      <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center bg-surface rounded-xl shadow-sm text-brand border border-divider">
                        <svg xmlns="http://www.w3.org/0000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" x2="12" y1="2" y2="15"/></svg>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-main">1. Tap Share</p>
                        <p className="text-xs text-subtle mt-0.5">Tap the share button at the bottom of Safari.</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 bg-muted/30 p-4 rounded-2xl border border-divider/50">
                      <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center bg-surface rounded-xl shadow-sm text-brand border border-divider">
                        <svg xmlns="http://www.w3.org/0000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/><path d="M12 12h.01"/></svg>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-main">2. Add to Home Screen</p>
                        <p className="text-xs text-subtle mt-0.5">Scroll down and tap "Add to Home Screen".</p>
                      </div>
                    </div>
                    <button onClick={() => { setShowInstallDialog(false); setInstallGuideOS('none'); }} className="w-full mt-2 bg-brand text-white font-bold rounded-xl py-3 hover:bg-opacity-90 active:scale-95 transition-all shadow-md shadow-brand/20">
                      Got it!
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                    <button onClick={() => setInstallGuideOS('none')} className="text-brand text-xs font-bold hover:underline mb-2 flex items-center gap-1"><svg xmlns="http://www.w3.org/0000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg> Back</button>
                    <div className="flex items-center gap-4 bg-muted/30 p-4 rounded-2xl border border-divider/50">
                      <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center bg-surface rounded-xl shadow-sm text-brand border border-divider">
                        <svg xmlns="http://www.w3.org/0000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-main">1. Open Menu</p>
                        <p className="text-xs text-subtle mt-0.5">Tap the 3-dots menu at the top right of your browser.</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 bg-muted/30 p-4 rounded-2xl border border-divider/50">
                      <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center bg-surface rounded-xl shadow-sm text-brand border border-divider">
                        <svg xmlns="http://www.w3.org/0000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/><path d="M12 12h.01"/></svg>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-main">2. Install App</p>
                        <p className="text-xs text-subtle mt-0.5">Tap "Install app" or "Add to Home screen".</p>
                      </div>
                    </div>
                    <button onClick={() => { setShowInstallDialog(false); setInstallGuideOS('none'); }} className="w-full mt-2 bg-brand text-white font-bold rounded-xl py-3 hover:bg-opacity-90 active:scale-95 transition-all shadow-md shadow-brand/20">
                      Got it!
                    </button>
                  </div>
                )}
              </div>
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
            <svg xmlns="http://www.w3.org/0000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
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
            <h2 className="text-main font-bold text-lg">Welcome to We Split</h2>
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
                className="bg-brand text-white font-semibold rounded-xl py-3 hover:bg-opacity-90 active:scale-95 transition-all shadow-md shadow-brand/20 flex items-center justify-center gap-2"
              >
                <svg xmlns="http://www.w3.org/0000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                New Bill
              </button>
              <button
                onClick={() => {
                  if (!user && !name.trim()) return;
                  if (!user && name.trim()) setLocalUser({ name: name.trim(), sessionId: "" });
                  router.push("/join");
                }}
                className="bg-surface text-main font-semibold rounded-xl py-3 border border-divider hover:bg-muted active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <svg xmlns="http://www.w3.org/0000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" x2="3" y1="12" y2="12"/></svg>
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

