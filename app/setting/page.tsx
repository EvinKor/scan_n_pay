"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getLocalUser, setLocalUser } from "@/lib/identity";
import InstallPWA from "@/components/InstallPWA";

const EMOJIS = ["🦁", "🐯", "🐻", "🐸", "🐷", "🐵", "🦊", "🐶", "🐱", "🐰", "🐼", "🐨", "🐔", "🐧", "🦉", "🦄", "🐉", "🦖", "🐙", "🐬"];

export default function SettingPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setLoading(true);
    // Check auth
    supabase.auth.getSession().then(({ data: { session } }) => {
      const currentUser = session?.user || null;
      setUser(currentUser);
      if (currentUser) {
        // Fetch from Supabase
        supabase.from("profiles").select("display_name, icon").eq("id", currentUser.id).single()
          .then(({ data }) => {
            if (data) {
              setName(data.display_name || "");
              setIcon(data.icon || "");
            }
            setLoading(false);
          });
      } else {
        // Fetch from local storage
        const local = getLocalUser();
        if (local) {
          setName(local.name || "");
          setIcon(local.icon || "");
        }
        setLoading(false);
      }
    });
  }, []);

  async function handleSave() {
    if (!name.trim()) {
      setError("Name cannot be empty");
      return;
    }
    setSaving(true);
    setError("");
    setSuccess(false);

    try {
      if (user) {
        // Save to Supabase
        const { error: dbError } = await supabase
          .from("profiles")
          .update({ display_name: name.trim(), icon })
          .eq("id", user.id);
        if (dbError) throw dbError;
      }

      // Always save to local storage as well for fallback
      const local = getLocalUser();
      setLocalUser({ name: name.trim(), sessionId: local?.sessionId || "", icon });
      
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e: any) {
      setError(e.message || "Failed to save profile");
    } finally {
      setSaving(false);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/");
  }

  return (
    <main className="min-h-screen pb-32 max-w-lg mx-auto bg-[#0f0f0f] px-6 py-12">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <button 
          onClick={() => router.back()} 
          className="w-10 h-10 flex items-center justify-center rounded-full bg-surface border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors"
        >
          ←
        </button>
        <h1 className="text-xl font-bold text-white">Settings</h1>
        <div className="w-10" /> {/* spacer */}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 rounded-full border-2 border-brand border-t-transparent animate-spin" />
        </div>
      ) : (
        <div className="space-y-8">
          {/* Profile Section */}
          <section className="bg-surface border border-zinc-700 rounded-2xl p-6 shadow-2xl">
            <h2 className="text-white font-bold mb-4">Edit Profile</h2>
            
            <div className="space-y-4">
              <div>
                <label className="text-zinc-500 text-xs uppercase tracking-wide mb-1 block">Display Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-brand transition-colors"
                  maxLength={24}
                />
              </div>

              <div>
                <label className="text-zinc-500 text-xs uppercase tracking-wide mb-2 block">Choose Icon</label>
                <div className="grid grid-cols-5 gap-2">
                  <button
                    onClick={() => setIcon("")}
                    className={`h-12 flex items-center justify-center rounded-xl text-lg transition-all ${!icon ? "bg-brand text-black shadow-[0_0_10px_rgba(0,200,150,0.2)]" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"}`}
                  >
                    🎲
                  </button>
                  {EMOJIS.map(e => (
                    <button
                      key={e}
                      onClick={() => setIcon(e)}
                      className={`h-12 flex items-center justify-center rounded-xl text-lg transition-all ${icon === e ? "bg-brand text-black shadow-[0_0_10px_rgba(0,200,150,0.2)]" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"}`}
                    >
                      {e}
                    </button>
                  ))}
                </div>
                <p className="text-zinc-500 text-[10px] mt-2">
                  {!icon ? "🎲 Random animal icon (default)" : `Selected: ${icon}`}
                </p>
              </div>

              {error && <p className="text-red-400 text-sm">{error}</p>}
              {success && <p className="text-brand text-sm">Profile updated successfully!</p>}

              <button
                onClick={handleSave}
                disabled={saving || !name.trim()}
                className="w-full bg-brand text-black font-bold rounded-xl py-3 hover:bg-opacity-90 active:scale-95 transition-all disabled:opacity-50 mt-4"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </section>

          {/* Account & App Settings */}
          <section className="space-y-3">
            <h2 className="text-zinc-500 text-xs uppercase tracking-wide px-2">App Settings</h2>
            
            <div className="bg-surface border border-zinc-700 rounded-2xl p-2">
              <InstallPWA />
            </div>

            {user ? (
              <div className="bg-surface border border-zinc-700 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <p className="text-white font-semibold">Account</p>
                  <p className="text-zinc-500 text-xs">{user.email}</p>
                </div>
                <button
                  onClick={handleSignOut}
                  className="w-full sm:w-auto px-6 py-2 bg-red-500/10 text-red-500 font-semibold rounded-xl hover:bg-red-500/20 transition-all text-sm"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <button onClick={() => router.push("/login")} className="w-full bg-brand text-black font-semibold rounded-xl py-3 shadow-[0_0_15px_rgba(0,200,150,0.2)]">
                Sign In / Sign Up
              </button>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
