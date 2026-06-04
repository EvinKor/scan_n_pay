"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSession, joinSession } from "@/lib/session";
import { setLocalUser } from "@/lib/identity";
import { generateAnimalName } from "@/lib/animals";

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [mode, setMode] = useState<"idle" | "create" | "join">("idle");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [qrImage, setQrImage] = useState<string>("");

  // Auto-generate a random animal name on mount
  useEffect(() => {
    setName(generateAnimalName());
  }, []);

  async function handleCreate() {
    if (!name.trim()) return setError("Enter your name first");
    setLoading(true);
    try {
      const session = await createSession(name.trim(), qrImage || undefined);
      setLocalUser({ name: name.trim(), sessionId: session.id });
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

      {/* Name input (always shown) */}
      <div className="w-full max-w-sm space-y-3">
        <div>
          <label className="text-zinc-500 text-xs uppercase tracking-wide mb-1 block">
            Your name
          </label>
          <input
            type="text"
            placeholder="Auto-generated — feel free to change!"
            value={name}
            onChange={(e) => { setName(e.target.value); setError(""); }}
            className="w-full bg-surface border border-muted rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-brand transition-colors"
            maxLength={24}
          />
          <p className="text-zinc-600 text-xs mt-1">Random name generated · change it if you want</p>
        </div>

        {/* Action buttons */}
        {mode === "idle" && (
          <div className="grid grid-cols-2 gap-3 pt-1">
            <button
              onClick={() => setMode("create")}
              className="bg-brand text-black font-semibold rounded-xl py-3 hover:bg-opacity-90 active:scale-95 transition-all"
            >
              New Bill
            </button>
            <button
              onClick={() => setMode("join")}
              className="bg-muted text-white font-semibold rounded-xl py-3 hover:bg-zinc-700 active:scale-95 transition-all"
            >
              Join Room
            </button>
          </div>
        )}

        {mode === "create" && (
          <div className="space-y-4">
            <div>
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
