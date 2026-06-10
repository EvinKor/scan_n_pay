"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getLocalHistory, getLocalUser } from "@/lib/identity";
import clsx from "clsx";

export default function HistoryPage() {
  const router = useRouter();
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [myName, setMyName] = useState("");

  useEffect(() => {
    // 1. Get identity
    const local = getLocalUser();
    let currentName = local?.name || "";
    setMyName(currentName);

    // 2. Fetch profile if logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        supabase.from("profiles").select("display_name").eq("id", session.user.id).single()
          .then(({ data }) => {
            if (data?.display_name) {
              setMyName(data.display_name);
              currentName = data.display_name;
            }
            loadAllHistory(currentName);
          });
      } else {
        loadAllHistory(currentName);
      }
    });
  }, []);

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
        .limit(20);
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
    setLoading(false);
  }

  return (
    <main className="min-h-screen bg-[#0f0f0f] text-zinc-300 pb-20">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-[#0f0f0f]/90 backdrop-blur-md border-b border-zinc-800">
        <div className="max-w-md mx-auto px-4 h-16 flex items-center justify-between">
          <button 
            onClick={() => router.back()}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-zinc-800 transition-colors"
          >
            <span className="text-xl">←</span>
          </button>
          <h1 className="text-white font-bold text-lg font-mono tracking-tight">Past Receipts</h1>
          <div className="w-10" />
        </div>
      </div>

      <div className="max-w-md mx-auto p-4 space-y-4 mt-2">
        {loading ? (
          <div className="text-center py-10">
            <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-zinc-500 text-sm">Loading history...</p>
          </div>
        ) : history.length === 0 ? (
          <div className="text-center py-12 bg-surface border border-zinc-800 rounded-2xl">
            <span className="text-4xl mb-4 block">👻</span>
            <p className="text-zinc-400">No past receipts found.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {history.map(h => {
              const myTotal = h.data?.totals?.[myName] ?? 0;
              const grandTotal = (h.data?.items?.reduce((s: number, i: any) => s + (Number(i.price) || 0), 0) || 0) + (h.data?.serviceCharge || 0) + (h.data?.sst || 0);
              const participantsList = Array.isArray(h.data?.participants) 
                ? h.data.participants.map((p: any) => p.name).join(", ") 
                : "";

              return (
                <button
                  key={h.id}
                  onClick={() => router.push(`/room/${h.id}`)}
                  className={clsx(
                    "relative overflow-hidden w-full border rounded-xl p-4 text-left transition-all block group",
                    h.data?.status === "done"
                      ? "bg-[#015ABF]/10 border-[#015ABF]/30 hover:bg-[#015ABF]/20"
                      : "bg-surface border-zinc-700 hover:border-brand/50 hover:bg-brand/5"
                  )}
                >
                  {h.data?.status === "done" && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                      <div className="border-[3px] border-red-500/80 text-red-500/80 text-2xl uppercase tracking-[0.2em] font-black px-6 py-2 rotate-[-12deg] rounded-lg shadow-sm opacity-90">
                        SETTLED
                      </div>
                    </div>
                  )}
                  <div className="flex justify-between items-start mb-3">
                    <div className="relative z-20">
                      <p className="text-white font-mono font-bold text-lg flex items-center gap-2">
                        <span>🧾</span>
                        {h.data?.name || h.code}
                      </p>
                      <p className="text-zinc-500 text-xs mt-0.5">
                        {new Date(h.created_at).toLocaleDateString(undefined, {
                          year: 'numeric', month: 'short', day: 'numeric',
                          hour: '2-digit', minute: '2-digit'
                        })}
                      </p>
                    </div>
                    <div className="text-right mt-1">
                      <p className="text-white font-mono font-bold text-xl leading-none mt-2 whitespace-nowrap">
                        RM {grandTotal.toFixed(2)}
                      </p>
                      <p className="text-zinc-500 text-[10px] uppercase tracking-wider mt-1.5 whitespace-nowrap">Total Bill</p>
                    </div>
                  </div>
                  
                  {/* Participants section */}
                  <div className="bg-[#121214] rounded-lg p-2.5 border border-zinc-800/50">
                    <p className="text-zinc-500 text-[10px] uppercase tracking-widest font-bold mb-1">Owner: {h.data?.owner || "Unknown"}</p>
                    <p className="text-zinc-300 text-xs line-clamp-2 leading-relaxed">
                      👥 {participantsList || "Unknown"}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </main>
  );
}
