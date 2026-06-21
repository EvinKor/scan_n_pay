"use client";

import { useEffect, useState } from "react";

export default function InstallPWA() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

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
      alert("To install the app:\n\nOn iOS: Tap the Share button (square with arrow pointing up) at the bottom, then scroll down and tap 'Add to Home Screen'.\n\nOn Android/Chrome: Tap the browser menu (3 dots) and select 'Install app' or 'Add to Home screen'.");
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
        }, 1500);
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
    <button
      onClick={handleInstall}
      className="w-full bg-brand/10 text-brand font-semibold rounded-xl py-3 border border-brand/20 hover:bg-brand/20 transition-all flex items-center justify-center gap-2"
    >
      <svg xmlns="http://www.w3.org/0000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/></svg>
      Add to Home Screen
    </button>
  );
}
