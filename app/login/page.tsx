"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleGoogleSignIn() {
    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
  }

  async function handleEmailSignIn() {
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      // If sign in fails, try sign up
      const { error: signUpError } = await supabase.auth.signUp({ email, password });
      if (signUpError) {
        setError(signUpError.message);
      } else {
        setError("Check your email for the confirmation link!");
      }
      setLoading(false);
    } else {
      // Success, route to home
      setLoading(false);
      router.push("/");
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm space-y-4">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="w-full max-w-[240px] mx-auto mb-4">
          <img src="/app_icon.png" alt="Split Lah Logo" className="w-full h-auto drop-shadow-md rounded-xl" />
        </div>
          <p className="text-subtle mt-2 text-sm">Save your split history securely.</p>
        </div>

        <div className="bg-surface/80 backdrop-blur-md border border-divider rounded-xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.5)] space-y-4">
          <button
            onClick={handleGoogleSignIn}
            className="w-full bg-surface/80 backdrop-blur-md border border-divider text-main font-semibold rounded-xl py-3 hover:bg-muted transition-all flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" /><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" /><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
            Continue with Google
          </button>
          
          <div className="relative flex items-center py-2">
            <div className="flex-grow border-t border-divider"></div>
            <span className="flex-shrink-0 mx-4 text-subtle text-xs uppercase">or</span>
            <div className="flex-grow border-t border-divider"></div>
          </div>
          
          <div className="space-y-3">
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-zinc-800 border border-divider rounded-xl px-4 py-3 text-main text-sm focus:outline-none focus:border-brand transition-colors"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-zinc-800 border border-divider rounded-xl px-4 py-3 text-main text-sm focus:outline-none focus:border-brand transition-colors"
            />
            {error && (
              <p className="text-red-400 text-sm text-center">{error}</p>
            )}
            <button
              onClick={handleEmailSignIn}
              disabled={loading || !email || !password}
              className="w-full bg-brand text-white font-bold rounded-xl py-3 hover:bg-opacity-90 transition-all disabled:opacity-50 mt-2"
            >
              {loading ? "Please wait..." : "Sign In / Sign Up"}
            </button>
          </div>
        </div>
        
        <button onClick={() => router.push("/")} className="w-full text-subtle hover:text-subtle text-sm py-4 transition-colors">
          ← Back to Home
        </button>
      </div>
    </main>
  );
}
