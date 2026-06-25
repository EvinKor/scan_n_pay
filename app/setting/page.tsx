"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Smartphone, ReceiptText, MessageSquare, CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getLocalUser, setLocalUser } from "@/lib/identity";
import InstallPWA from "@/components/InstallPWA";
import { AnimalAvatar } from "@/components/AnimalAvatar";

const ANIMAL_INDICES = Array.from({ length: 20 }, (_, i) => i.toString());

export default function SettingPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [phone, setPhone] = useState("");
  const [tngQr, setTngQr] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  
  const [feedback, setFeedback] = useState("");
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [feedbackSuccess, setFeedbackSuccess] = useState(false);

  useEffect(() => {
    setLoading(true);
    // Check auth
    supabase.auth.getSession().then(({ data: { session } }) => {
      const currentUser = session?.user || null;
      setUser(currentUser);
      if (currentUser) {
        // Fetch from Supabase
        supabase.from("profiles").select("display_name, icon, phone, tng_qr, is_admin").eq("id", currentUser.id).maybeSingle()
          .then(({ data }) => {
            if (data) {
              setName(data.display_name || "");
              setIcon(data.icon || "");
              setPhone(data.phone || "");
              setTngQr(data.tng_qr || "");
              setIsAdmin(!!data.is_admin);
            }
            setLoading(false);
          });
      } else {
        router.push("/login");
      }
    });
  }, []);

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
        setTngQr(canvas.toDataURL("image/jpeg", 0.7));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

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
          .upsert({ id: user.id, display_name: name.trim(), icon, phone: phone.trim(), tng_qr: tngQr });
        if (dbError) throw dbError;
      }

      // Always save to local storage as well for fallback
      const local = getLocalUser();
      setLocalUser({ name: name.trim(), sessionId: local?.sessionId || "", icon, phone: phone.trim(), tng_qr: tngQr });
      
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e: any) {
      setError(e.message || "Failed to save profile");
    } finally {
      setSaving(false);
    }
  }

  async function handleFeedbackSubmit() {
    if (!feedback.trim()) return;
    setSubmittingFeedback(true);
    try {
      // In a real app, this goes to the feedbacks table
      const { error: dbError } = await supabase.from('feedbacks').insert({
        message: feedback.trim(),
        user_id: user?.id || null
      });
      if (dbError) throw dbError;
      
      setFeedbackSuccess(true);
      setFeedback("");
      setTimeout(() => setFeedbackSuccess(false), 3000);
    } catch (e: any) {
      setError(e.message || "Failed to submit feedback");
    } finally {
      setSubmittingFeedback(false);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/");
  }

  return (
    <main suppressHydrationWarning className="min-h-screen pb-32 max-w-lg mx-auto bg-background px-6 py-12">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <button 
          onClick={() => router.back()} 
          className="w-10 h-10 flex items-center justify-center rounded-full bg-surface border border-divider text-main hover:bg-muted transition-colors"
        >
          ←
        </button>
        <h1 className="text-xl font-bold text-main">Settings</h1>
        <div className="w-10" /> {/* spacer */}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 rounded-full border-2 border-brand border-t-transparent animate-spin" />
        </div>
      ) : (
        <div className="space-y-8">
          {/* Profile Section */}
          <section className="bg-surface border border-divider rounded-2xl p-6 shadow-sm">
            <h2 className="text-main font-bold mb-4">Edit Profile</h2>
            
            <div className="space-y-4">
              <div>
                <label className="text-subtle text-xs uppercase tracking-wide mb-1 block">Display Name <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-muted border border-divider rounded-xl px-4 py-3 text-main text-sm focus:outline-none focus:border-brand transition-colors"
                  maxLength={24}
                />
              </div>

              <div>
                <label className="text-subtle text-xs uppercase tracking-wide mb-1 block">Phone Number (TNG/DuitNow)</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. 0123456789"
                  className="w-full bg-muted border border-divider rounded-xl px-4 py-3 text-main text-sm focus:outline-none focus:border-brand transition-colors"
                />
              </div>

              <div>
                <label className="text-subtle text-xs uppercase tracking-wide mb-2 block">Choose Icon</label>
                <div className="grid grid-cols-5 gap-2">
                  <button
                    onClick={() => setIcon("")}
                    className={`col-span-5 h-16 flex items-center justify-center rounded-xl text-xs font-bold transition-all ${!icon ? "bg-brand text-white shadow-md shadow-brand/20" : "bg-muted text-subtle hover:bg-divider"}`}
                  >
                    Auto Assigned Avatar
                  </button>
                  {ANIMAL_INDICES.map(i => (
                    <button
                      key={i}
                      onClick={() => setIcon(i)}
                      className={`h-16 flex items-center justify-center rounded-xl transition-all overflow-hidden ${icon === i ? "ring-2 ring-brand ring-offset-2 ring-offset-background" : "bg-surface border border-divider hover:bg-muted"}`}
                    >
                      <AnimalAvatar name="" customIcon={i} className="w-12 h-12 drop-shadow-sm scale-125" />
                    </button>
                  ))}
                </div>
                <p className="text-subtle text-[10px] mt-2">
                  {!icon ? "Auto-assigned based on your name" : "Custom animal selected"}
                </p>
              </div>

              <div>
                <label className="text-subtle text-xs uppercase tracking-wide mb-1 block">
                  Default TNG/DuitNow QR
                </label>
                <div className="relative group cursor-pointer border-2 border-dashed border-divider rounded-xl p-4 text-center hover:border-brand hover:bg-brand/5 transition-all">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleQRUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                  {tngQr ? (
                    <div className="flex flex-col items-center gap-2">
                      <img src={tngQr} alt="QR Code" className="w-16 h-16 rounded-lg object-cover" />
                      <span className="text-brand text-xs font-semibold">QR Saved! (Tap to change)</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-subtle"><Smartphone size={24} /></span>
                      <span className="text-subtle text-sm">Upload QR Code</span>
                      <span className="text-subtle text-xs">Used as default for new bills</span>
                    </div>
                  )}
                </div>
              </div>

              {error && <p className="text-red-400 text-sm">{error}</p>}
              {success && <p className="text-brand text-sm">Profile updated successfully!</p>}

              <button
                onClick={handleSave}
                disabled={saving || !name.trim()}
                className="w-full bg-brand text-white font-bold rounded-xl py-3 hover:bg-opacity-90 active:scale-95 transition-all disabled:opacity-50 mt-4"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </section>

          {/* Admin Panel */}
          {isAdmin && (
            <section className="space-y-3">
              <h2 className="text-subtle text-xs uppercase tracking-wide px-2 text-brand">Admin Area</h2>
              <div className="bg-surface border border-brand/30 rounded-2xl p-2 relative overflow-hidden group">
                <div className="absolute inset-0 bg-brand/5 group-hover:bg-brand/10 transition-colors"></div>
                <button
                  onClick={() => router.push("/admin")}
                  className="w-full bg-transparent text-brand font-bold rounded-xl py-3 px-4 flex items-center justify-between transition-all relative z-10"
                >
                  <div className="flex items-center gap-3">
                    <svg xmlns="http://www.w3.org/0000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/></svg>
                    <span>Admin Dashboard</span>
                  </div>
                  <span>→</span>
                </button>
              </div>
            </section>
          )}

          {/* History */}
          <section className="space-y-3">
            <h2 className="text-subtle text-xs uppercase tracking-wide px-2">History</h2>
            <div className="bg-surface border border-divider rounded-2xl p-2">
               <button
                onClick={() => router.push("/history")}
                className="w-full bg-transparent hover:bg-muted text-main font-medium rounded-xl py-3 px-4 flex items-center justify-between transition-all"
              >
                <div className="flex items-center gap-3">
                  <span className="text-subtle"><ReceiptText size={20} /></span>
                  <span>View Past Receipts</span>
                </div>
                <span className="text-subtle">→</span>
              </button>
            </div>
          </section>

          {/* Feedback Form */}
          <section className="bg-surface border border-divider rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <MessageSquare className="text-brand" size={20} />
              <h2 className="text-main font-bold">Feedback & Suggestions</h2>
            </div>
            <p className="text-subtle text-sm mb-4">Have an idea to improve We Split or found a bug? Let us know!</p>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Tell us what you think..."
              className="w-full bg-muted border border-divider rounded-xl px-4 py-3 text-main text-sm focus:outline-none focus:border-brand transition-colors min-h-[100px] resize-none mb-4"
            />
            <button
              onClick={handleFeedbackSubmit}
              disabled={submittingFeedback || !feedback.trim()}
              className="w-full bg-surface border border-divider text-main font-bold rounded-xl py-3 hover:bg-brand/10 hover:text-brand hover:border-brand/30 active:scale-95 transition-all disabled:opacity-50"
            >
              {submittingFeedback ? "Submitting..." : "Send Feedback"}
            </button>
          </section>

          {/* Account & App Settings */}
          <section className="space-y-3">
            <h2 className="text-subtle text-xs uppercase tracking-wide px-2">App Settings</h2>
            
            <div className="bg-surface border border-divider rounded-2xl p-2">
              <InstallPWA />
            </div>

            {user ? (
              <div className="bg-surface border border-divider rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <p className="text-main font-semibold">Account</p>
                  <p className="text-subtle text-xs">{user.email}</p>
                </div>
                <button
                  onClick={handleSignOut}
                  className="w-full sm:w-auto px-6 py-2 bg-red-500/10 text-red-500 font-semibold rounded-xl hover:bg-red-500/20 transition-all text-sm"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <button onClick={() => router.push("/login")} className="w-full bg-brand text-white font-semibold rounded-xl py-3 shadow-md shadow-brand/20">
                Sign In / Sign Up
              </button>
            )}
          </section>
        </div>
      )}

      {/* Global Notification Alert */}
      {feedbackSuccess && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-surface/90 backdrop-blur-xl border border-brand/30 px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 z-50 animate-in slide-in-from-bottom-8 fade-in duration-300">
          <CheckCircle2 className="text-brand" size={20} />
          <p className="text-main font-bold text-sm">Thanks for your feedback!</p>
        </div>
      )}
    </main>
  );
}

