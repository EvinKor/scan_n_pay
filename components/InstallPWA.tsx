"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

export default function InstallPWA() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone) {
      setIsStandalone(true);
    }

    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  function handleInstall() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then((choiceResult: any) => {
        if (choiceResult.outcome === "accepted") {
          setDeferredPrompt(null);
        }
      });
    } else {
      // Fallback for iOS or unsupported browsers
      setShowIOSInstructions(true);
    }
  }

  async function handleCheckUpdate() {
    setIsUpdating(true);
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.ready;
        reg.update().catch(console.error);
        
        let reloaded = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (!reloaded) {
            reloaded = true;
            window.location.reload();
          }
        });

        // Fallback reload if no update was found but user wants to refresh
        setTimeout(() => {
          if (!reloaded) {
            window.location.reload();
          }
        }, 600);
      } catch (e) {
        console.error("Failed to check for updates", e);
        setIsUpdating(false);
      }
    } else {
      window.location.reload();
    }
  }

  if (isStandalone) {
    return (
      <button
        onClick={handleCheckUpdate}
        disabled={isUpdating}
        className="w-full bg-brand/10 text-brand font-semibold rounded-xl py-3 border border-brand/20 hover:bg-brand/20 transition-all flex items-center justify-center gap-2"
      >
        <svg xmlns="http://www.w3.org/0000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={isUpdating ? "animate-spin" : ""}><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
        {isUpdating ? "Updating..." : "Check for Updates"}
      </button>
    );
  }

  return (
    <>
      <button
        onClick={handleInstall}
        className="w-full bg-brand/10 text-brand font-semibold rounded-xl py-3 border border-brand/20 hover:bg-brand/20 transition-all flex items-center justify-center gap-2"
      >
        <svg xmlns="http://www.w3.org/0000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/></svg>
        Add to Home Screen
      </button>

      {/* iOS Instructions Overlay */}
      {showIOSInstructions && (
        <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-300" onClick={() => setShowIOSInstructions(false)}>
          <div className="bg-surface border border-divider w-full max-w-sm rounded-3xl p-6 shadow-2xl relative animate-in slide-in-from-bottom-10 duration-300 mb-4" onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowIOSInstructions(false)} className="absolute top-4 right-4 text-subtle hover:text-main bg-muted/50 rounded-full w-8 h-8 flex items-center justify-center transition-colors"><X size={16} /></button>
            <h3 className="text-xl font-bold text-main mb-2">Install App</h3>
            <p className="text-subtle text-sm mb-6">Install We Split on your home screen for quick access.</p>
            
            <div className="space-y-4">
              <div className="flex items-center gap-4 bg-muted/30 p-4 rounded-2xl border border-divider/50">
                <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center bg-surface rounded-xl shadow-sm text-brand border border-divider">
                  <svg xmlns="http://www.w3.org/0000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" x2="12" y1="2" y2="15"/></svg>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-main">1. Tap Share</p>
                  <p className="text-xs text-subtle mt-0.5">Tap the share button at the bottom of your screen.</p>
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
            </div>
            
            <button onClick={() => setShowIOSInstructions(false)} className="w-full mt-6 bg-brand text-white font-bold rounded-xl py-3 hover:bg-opacity-90 active:scale-95 transition-all shadow-md shadow-brand/20">
              Got it!
            </button>
          </div>
        </div>
      )}
    </>
  );
}
