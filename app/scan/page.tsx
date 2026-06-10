"use client";

export const dynamic = "force-dynamic";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { extractReceiptItems, ReceiptResult } from "@/lib/ocr";
import { getSession, updateSession, LineItem, Session } from "@/lib/session";
import { getLocalUser, getLocalUserForRoom } from "@/lib/identity";
import { customAlphabet } from "nanoid";
import clsx from "clsx";

const nanoid = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 6);

export default function ScanPage() {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [items, setItems] = useState<LineItem[]>([]);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const [paidBy, setPaidBy] = useState("");
  const [paidByPhone, setPaidByPhone] = useState("");
  const [error, setError] = useState("");
  const [receiptTotal, setReceiptTotal] = useState(0);
  const [serviceCharge, setServiceCharge] = useState(0);
  const [sst, setSst] = useState(0);
  const [linkCopied, setLinkCopied] = useState(false);

  const user = getLocalUser();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("session");
    if (!id) {
      router.push("/");
      return;
    }
    setSessionId(id);
    if (!user) { router.push("/"); return; }
    getSession(id).then((s) => {
      if (!s) { router.push("/"); return; }
      setSession(s);
      setItems(s.items || []);
      setPaidBy(s.paidBy || user.name);
      setServiceCharge(s.serviceCharge || 0);
      setSst(s.sst || 0);
      setReceiptTotal(s.receiptTotal || 0);
    });
  }, [sessionId]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    setScanning(true);
    setProgress(0);
    setError("");
    try {
      const result: ReceiptResult = await extractReceiptItems(file, setProgress);
      if (result.items.length === 0) {
        setError("Couldn't read items. Try a clearer photo or add manually.");
      }
      setItems(result.items);
      setServiceCharge(result.serviceCharge);
      setSst(result.sst);
      setReceiptTotal(result.receiptTotal);
    } catch (error: any) {
      setError(error?.message || "OCR failed. Please try again.");
    } finally {
      setScanning(false);
    }
  }

  function addItem() {
    setItems((prev) => [...prev, { id: nanoid(), name: "", quantity: 1, price: 0, assignedTo: [] }]);
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  function updateItem(id: string, patch: Partial<LineItem>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  async function handleNext() {
    if (!sessionId) return setError("Unable to continue without a session.");
    if (!paidBy) return setError("Select who paid");
    if (items.length === 0) return setError("Add at least one item");

    const computedTotal = items.reduce((s, i) => s + (Number(i.price) || 0), 0) + (serviceCharge || 0) + (sst || 0);
    if (receiptTotal > 0 && Math.abs(computedTotal - receiptTotal) > 0.05) {
      const proceed = confirm(`The items total (RM ${computedTotal.toFixed(2)}) doesn't match the receipt total (RM ${receiptTotal.toFixed(2)}). Do you want to continue anyway?`);
      if (!proceed) return;
    }

    await updateSession(sessionId, {
      items,
      paidBy,
      serviceCharge,
      sst,
      receiptTotal,
      status: "splitting",
    });
    router.push(`/room/${sessionId}`);
  }

  async function handleShare() {
    if (!session) return;
    const joinUrl = `${window.location.origin}/join/${session.code}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: "Join SplitLah",
          text: `Join my bill split room: ${session.code}`,
          url: joinUrl,
        });
        return;
      } catch {
        // User cancelled or share failed, fall through to clipboard
      }
    }

    // Fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(joinUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // Clipboard failed too
    }
  }

  const total = items.reduce((s, i) => s + (Number(i.price) || 0), 0) + (serviceCharge || 0) + (sst || 0);

  return (
    <main className="min-h-screen pb-32 px-4 pt-8 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <h1 className="text-2xl font-bold font-mono">Scan Receipt</h1>
      </div>
      <p className="text-zinc-400 text-sm mb-6">
        Room: <span className="text-brand font-mono">{session?.code}</span>
      </p>

      {/* Camera / Upload */}
      <div
        onClick={() => fileRef.current?.click()}
        className={clsx(
          "relative rounded-2xl border-2 border-dashed border-muted flex flex-col items-center justify-center p-6 mb-6 cursor-pointer transition-colors hover:border-brand",
          preview && "border-brand"
        )}
        style={{ minHeight: 160 }}
      >
        <div className="absolute top-3 left-3 text-xs text-zinc-400">
          Tip: place receipt flat, fill the frame, avoid hands or busy backgrounds.
        </div>
        {preview ? (
          <div className="flex flex-col items-center w-full relative overflow-hidden rounded-xl">
            <img src={preview} alt="Receipt" className="max-h-64 rounded-xl object-contain mb-3 relative z-0" />
            {scanning && (
              <>
                <div className="absolute inset-0 z-10 bg-black/20" />
                <div className="absolute left-0 w-full h-[2px] bg-brand animate-scan-beam z-20 shadow-[0_0_15px_rgba(0,200,150,0.8)]" />
                <div className="absolute inset-0 flex flex-col items-center justify-center z-30">
                  <div className="bg-black/80 backdrop-blur-md px-4 py-3 rounded-2xl border border-brand/30 flex flex-col items-center animate-pulse-glow">
                    <span className="text-brand font-mono font-bold text-sm mb-1">
                      {progress < 30 ? "Analyzing layout..." : progress < 70 ? "Extracting text..." : "Parsing items..."}
                    </span>
                    <span className="text-white text-xs">{progress}%</span>
                  </div>
                </div>
              </>
            )}
            {!scanning && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  fileRef.current?.click();
                }}
                className="bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 active:scale-95 transition-all text-brand px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 mt-2"
              >
                🔄 Rescan / Upload New
              </button>
            )}
          </div>
        ) : (
          <>
            <span className="text-4xl mb-2">📷</span>
            <p className="text-zinc-400 text-sm text-center">
              Tap to take photo or upload receipt
            </p>
          </>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFile}
          className="hidden"
        />
      </div>

      {/* Items List */}
      {items.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-sm text-zinc-400 uppercase tracking-wide">
              Items ({items.length})
            </h2>
            <button onClick={addItem} className="text-brand text-sm font-medium">
              + Add item
            </button>
          </div>

          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.id} className="flex gap-2 items-center bg-surface rounded-xl px-3 py-2">
                <input
                  type="text"
                  value={item.name}
                  onChange={(e) => updateItem(item.id, { name: e.target.value })}
                  placeholder="Item name"
                  className="flex-1 bg-transparent text-white text-sm focus:outline-none placeholder-zinc-600 min-w-0"
                />
                <span className="text-zinc-500 text-xs">×</span>
                <input
                  type="number"
                  value={item.quantity || 1}
                  onChange={(e) => updateItem(item.id, { quantity: parseInt(e.target.value) || 1 })}
                  min="1"
                  className="w-8 bg-transparent text-center text-zinc-300 text-sm font-mono focus:outline-none"
                />
                <span className="text-zinc-500 text-sm">RM</span>
                <input
                  type="number"
                  value={item.price || ""}
                  onChange={(e) => updateItem(item.id, { price: parseFloat(e.target.value) || 0 })}
                  placeholder="0.00"
                  step="0.10"
                  min="0"
                  className="w-16 bg-transparent text-right text-white text-sm font-mono focus:outline-none placeholder-zinc-600"
                />
                <button onClick={() => removeItem(item.id)} className="text-zinc-600 hover:text-red-400 pl-1 text-lg leading-none">
                  ×
                </button>
              </div>
            ))}
          </div>

          {/* Add item button (bottom) */}
          <button
            onClick={addItem}
            className="mt-2 w-full border border-dashed border-muted rounded-xl py-2 text-zinc-500 text-sm hover:border-brand hover:text-brand transition-colors"
          >
            + Add item
          </button>

          {/* Service Charge & SST Inputs */}
          <div className="bg-surface rounded-xl p-4 mt-4 space-y-3">
            <div className="flex items-center justify-between gap-4">
              <span className="text-zinc-400 text-sm font-medium">Service Charge</span>
              <div className="flex items-center gap-1">
                <span className="text-zinc-500 text-sm font-mono">RM</span>
                <input
                  type="number"
                  value={serviceCharge || ""}
                  onChange={(e) => setServiceCharge(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  step="0.10"
                  min="0"
                  className="w-20 bg-zinc-800 rounded-lg px-2 py-1 text-right text-white text-sm font-mono focus:outline-none focus:ring-1 focus:ring-brand placeholder-zinc-600"
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-zinc-400 text-sm font-medium">SST</span>
              <div className="flex items-center gap-1">
                <span className="text-zinc-500 text-sm font-mono">RM</span>
                <input
                  type="number"
                  value={sst || ""}
                  onChange={(e) => setSst(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  step="0.10"
                  min="0"
                  className="w-20 bg-zinc-800 rounded-lg px-2 py-1 text-right text-white text-sm font-mono focus:outline-none focus:ring-1 focus:ring-brand placeholder-zinc-600"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {items.length === 0 && !scanning && (
        <button
          onClick={addItem}
          className="w-full border border-dashed border-muted rounded-xl py-4 text-zinc-500 text-sm hover:border-brand hover:text-brand transition-colors mb-6"
        >
          + Add items manually
        </button>
      )}

      {/* Total + Receipt total comparison */}
      {items.length > 0 && (
        <div className="bg-surface rounded-xl px-4 py-3 mb-6 space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-zinc-400 text-sm">Items Total</span>
            <span className="text-white font-mono font-semibold text-lg">
              RM {total.toFixed(2)}
            </span>
          </div>
          {receiptTotal > 0 && (
            <div className="flex justify-between items-center border-t border-muted pt-2">
              <span className="text-zinc-500 text-xs">Receipt Total</span>
              <span className={clsx(
                "font-mono text-xs",
                Math.abs(total - receiptTotal) < 0.05 ? "text-brand" : "text-yellow-400"
              )}>
                RM {receiptTotal.toFixed(2)}
                {Math.abs(total - receiptTotal) < 0.05 ? " ✓" : " ⚠ mismatch"}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Who Paid */}
      {session && (
        <div className="mb-6 space-y-3">
          <h2 className="font-semibold text-sm text-zinc-400 uppercase tracking-wide">
            Who paid the bill?
          </h2>
          <div className="flex flex-wrap gap-2">
            {session.participants.map((p) => (
              <button
                key={p.name}
                onClick={() => setPaidBy(p.name)}
                className={clsx(
                  "px-4 py-2 rounded-xl text-sm font-medium transition-all",
                  paidBy === p.name
                    ? "bg-brand text-black"
                    : "bg-muted text-zinc-300 hover:bg-zinc-700"
                )}
              >
                {p.name}
              </button>
            ))}
          </div>


        </div>
      )}

      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

      {/* Share room link */}
      {session && (
        <div
          className="bg-surface rounded-xl px-4 py-3 flex items-center justify-between mb-6 cursor-pointer active:scale-[0.98] transition-transform"
          onClick={handleShare}
        >
          <div>
            <p className="text-zinc-400 text-xs">Share invite link — tap to share</p>
            <p className="text-brand font-mono font-semibold tracking-widest">{session.code}</p>
          </div>
          <span className="text-xl">
            {linkCopied ? "✅" : "🔗"}
          </span>
        </div>
      )}

      {/* Next CTA */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-dark to-transparent">
        <button
          onClick={handleNext}
          disabled={scanning}
          className="w-full max-w-lg mx-auto block bg-brand text-black font-bold rounded-2xl py-4 text-lg hover:bg-opacity-90 active:scale-95 transition-all disabled:opacity-40"
        >
          Continue to Split →
        </button>
      </div>
    </main>
  );
}
