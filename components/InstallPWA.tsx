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
        await reg.update();
        
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
        {isUpdating ? "🔄 Updating..." : "🔄 Check for Updates"}
      </button>
    );
  }

  return (
    <button
      onClick={handleInstall}
      className="w-full bg-brand/10 text-brand font-semibold rounded-xl py-3 border border-brand/20 hover:bg-brand/20 transition-all flex items-center justify-center gap-2"
    >
      📱 Add to Home Screen
    </button>
  );
}
