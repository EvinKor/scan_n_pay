"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleAuth() {
    setLoading(true);
    setError("");

    if (isSignUp) {
      if (password !== confirmPassword) {
        setError("Passwords do not match");
        setLoading(false);
        return;
      }
      const { error: signUpError } = await supabase.auth.signUp({ email, password });
      if (signUpError) {
        setError(signUpError.message);
      } else {
        setError("Check your email for the confirmation link!");
      }
      setLoading(false);
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError(signInError.message);
        setLoading(false);
      } else {
        setLoading(false);
        router.push("/");
      }
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
            {isSignUp && (
              <input
                type="password"
                placeholder="Confirm Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-zinc-800 border border-divider rounded-xl px-4 py-3 text-main text-sm focus:outline-none focus:border-brand transition-colors"
              />
            )}
            
            {error && (
              <p className={`text-sm text-center ${error.includes("Check your email") ? "text-brand" : "text-red-400"}`}>
                {error}
              </p>
            )}

            <button
              onClick={handleAuth}
              disabled={loading || !email || !password || (isSignUp && !confirmPassword)}
              className="w-full bg-brand text-white font-bold rounded-xl py-3 hover:bg-opacity-90 transition-all disabled:opacity-50 mt-2"
            >
              {loading ? "Please wait..." : (isSignUp ? "Sign Up" : "Sign In")}
            </button>
          </div>
          
          <div className="text-center pt-2">
            <button
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError("");
              }}
              className="text-subtle hover:text-main text-sm transition-colors"
            >
              {isSignUp ? "Already have an account? Sign In" : "Don't have an account? Sign Up"}
            </button>
          </div>
        </div>
        
        <button onClick={() => router.push("/")} className="w-full text-subtle hover:text-main text-sm py-4 transition-colors">
          ← Back to Home
        </button>
      </div>
    </main>
  );
}
