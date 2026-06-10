"use client";

import { useEffect, useState } from "react";

export default function InstallPWA() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia("(display-mode: standalone)").matches) {
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

  async function handleInstall() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDeferredPrompt(null);
    }
  }

  if (isStandalone || !deferredPrompt) return null;

  if (isStandalone || !deferredPrompt) return null;

  return (
    <button
      onClick={handleInstall}
      className="w-full bg-brand/10 text-brand font-semibold rounded-xl py-3 border border-brand/20 hover:bg-brand/20 transition-all flex items-center justify-center gap-2 mt-4"
    >
      📱 Add to Home Screen
    </button>
  );
}
