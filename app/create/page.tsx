"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSession } from "@/lib/session";
import { setLocalUser, setLocalUserForRoom, getLocalUser } from "@/lib/identity";
import { supabase } from "@/lib/supabase";

export default function CreatePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [qrImage, setQrImage] = useState<string>("");
  const [phone, setPhone] = useState("");
  const [splitMode, setSplitMode] = useState<"even" | "byItem">("even");
  const [user, setUser] = useState<any>(null);
  const [step, setStep] = useState<1 | 2>(1);

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
    if (local) {
      if (local.name) setName(local.name);
      if (local.tng_qr) setQrImage(local.tng_qr);
      if (local.phone) setPhone(local.phone);
    }
  }

  async function fetchProfile(userId: string) {
    const { data } = await supabase.from("profiles").select("display_name, tng_qr, phone").eq("id", userId).single();
    if (data) {
      if (data.display_name) setName(data.display_name);
      if (data.tng_qr) setQrImage(data.tng_qr);
      if (data.phone) setPhone(data.phone);
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

  async function handleCreate(selectedMode: "even" | "byItem") {
    if (!name.trim()) return setError("Enter your name first");
    setLoading(true);
    setSplitMode(selectedMode);
    try {
      const local = getLocalUser();
      const session = await createSession(name.trim(), selectedMode, qrImage || undefined, local?.icon, phone.trim());
      setLocalUser({ name: name.trim(), sessionId: session.id, icon: local?.icon, phone: phone.trim() });
      setLocalUserForRoom(session.id, name.trim(), local?.icon);
      router.push(`/scan?session=${session.id}`);
    } catch (e) {
      setError("Failed to create session. Try again.");
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-12 max-w-sm mx-auto">
      <div className="w-full space-y-6">
        {step === 1 && (
          <>
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand mb-4">
                <span className="text-3xl">🧾</span>
              </div>
              <h1 className="text-3xl font-bold font-mono text-white tracking-tight">New Bill</h1>
              <p className="text-zinc-400 mt-1 text-sm">Create a room to scan and split</p>
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
              <label className="text-zinc-500 text-xs uppercase tracking-wide mb-1 block">Phone Number / DuitNow ID</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 0123456789"
                className="w-full bg-surface border border-muted rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-brand transition-colors mb-4"
              />

              <label className="text-zinc-500 text-xs uppercase tracking-wide mb-1 block">
                Payment QR Code (Optional)
              </label>
              <div className="relative group cursor-pointer border-2 border-dashed border-zinc-700 rounded-xl p-4 text-center hover:border-brand hover:bg-brand/5 transition-all">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleQRUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
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
              {error && <p className="text-red-400 text-sm text-center">{error}</p>}
              <button
                onClick={() => {
                  if (!name.trim()) return setError("Enter your name first");
                  setError("");
                  setStep(2);
                }}
                className="w-full bg-brand text-black font-semibold rounded-xl py-3 hover:bg-opacity-90 active:scale-95 transition-all"
              >
                Choose Split Method →
              </button>
              <button onClick={() => router.push("/")} className="w-full text-zinc-500 text-sm py-2 hover:text-white transition-colors">
                ← Back to Home
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <div className="flex flex-col items-center w-full min-h-[60vh] relative pt-8">
            <button 
              onClick={() => setStep(1)} 
              disabled={loading}
              className="absolute top-0 left-0 flex items-center gap-1 text-zinc-400 hover:text-white font-medium transition-colors disabled:opacity-50 bg-surface border border-zinc-700 px-3 py-1.5 rounded-lg"
            >
              ← Back
            </button>
            
            <div className="mt-8 text-center w-full">
              <h2 className="text-2xl font-bold text-white mb-2">How do you want to split?</h2>
              <p className="text-zinc-400 mb-8 text-sm">Select a method for this bill</p>
            </div>
            
            <div className="grid grid-cols-2 gap-4 w-full mb-8">
              <button
                onClick={() => handleCreate("even")}
                disabled={loading}
                className={`flex flex-col items-center justify-center p-6 rounded-2xl transition-all ${loading && splitMode === "even" ? "bg-brand/20 border-2 border-brand text-brand scale-95 shadow-[0_0_20px_rgba(0,200,150,0.3)]" : "bg-surface border-2 border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:-translate-y-1"} ${loading && splitMode !== "even" ? "opacity-50 grayscale cursor-not-allowed" : ""}`}
              >
                <span className="text-4xl mb-3">⚖️</span>
                <span className="font-bold text-lg text-white">Evenly</span>
                <span className="text-xs text-center mt-2 opacity-80">Split the total equally among everyone</span>
              </button>
              
              <button
                onClick={() => handleCreate("byItem")}
                disabled={loading}
                className={`flex flex-col items-center justify-center p-6 rounded-2xl transition-all ${loading && splitMode === "byItem" ? "bg-brand/20 border-2 border-brand text-brand scale-95 shadow-[0_0_20px_rgba(0,200,150,0.3)]" : "bg-surface border-2 border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:-translate-y-1"} ${loading && splitMode !== "byItem" ? "opacity-50 grayscale cursor-not-allowed" : ""}`}
              >
                <span className="text-4xl mb-3">🎯</span>
                <span className="font-bold text-lg text-white">By Item</span>
                <span className="text-xs text-center mt-2 opacity-80">Each person claims their own items</span>
              </button>
            </div>
            
            <div className="w-full space-y-4 mt-auto text-center">
              {error && <p className="text-red-400 text-sm">{error}</p>}
              {loading && <p className="text-brand font-semibold animate-pulse">Creating room...</p>}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
