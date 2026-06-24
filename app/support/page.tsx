"use client";

import { useRouter } from "next/navigation";

export default function SupportPage() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-background px-6 py-12 flex flex-col max-w-lg mx-auto relative overflow-hidden">
      {/* Background blobs for premium feel */}
      <div className="absolute top-0 left-0 w-64 h-64 bg-brand/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-0 right-0 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />

      {/* Header */}
      <div className="flex items-center justify-between mb-12 relative z-10">
        <button 
          onClick={() => router.back()} 
          className="w-10 h-10 flex items-center justify-center rounded-full bg-surface/80 backdrop-blur-md border border-divider text-main hover:bg-muted transition-colors"
        >
          ←
        </button>
        <h1 className="text-xl font-bold text-main">Support Me</h1>
        <div className="w-10" />
      </div>

      <div className="flex-1 flex flex-col justify-center items-center relative z-10 space-y-8 pb-20">
        <div className="w-20 h-20 bg-brand/20 rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(170,59,255,0.3)]">
          <svg xmlns="http://www.w3.org/0000/svg" width="36" height="36" viewBox="0 0 24 24" fill="currentColor" className="text-brand">
            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
          </svg>
        </div>
        
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-main">Pls support</h2>
          <p className="text-subtle text-base flex items-center justify-center gap-1.5">
            I&apos;m broke
            <svg xmlns="http://www.w3.org/0000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" x2="6" y1="2" y2="4"/><line x1="10" x2="10" y1="2" y2="4"/><line x1="14" x2="14" y1="2" y2="4"/></svg>
          </p>
        </div>

        <div className="w-full bg-surface/80 backdrop-blur-xl border border-divider rounded-3xl p-8 shadow-[0_20px_60px_rgb(0,0,0,0.4)] space-y-6 transform transition-all hover:scale-[1.02]">
          <div className="text-center space-y-2">
            <p className="text-subtle text-xs uppercase tracking-widest font-bold">Touch &apos;n Go eWallet</p>
            <p className="text-main font-semibold text-lg">Evin</p>
            <div className="bg-muted border border-divider rounded-xl py-3 px-6 inline-block mt-2">
              <p className="text-brand font-mono text-xl font-bold tracking-wider">0164196226</p>
            </div>
          </div>
          
          <div className="h-px w-full bg-divider" />
          
          <a 
            href="https://www.instagram.com/us_b3ing_us?igsh=MWxhYXl2ZmF0Y3p6MA%3D%3D&utm_source=qr" 
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-3 w-full bg-gradient-to-r from-[#833ab4] via-[#fd1d1d] to-[#fcb045] text-white font-bold rounded-xl py-4 shadow-lg hover:opacity-90 transition-opacity active:scale-95"
          >
            <svg xmlns="http://www.w3.org/0000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>
            Follow us on Instagram
          </a>
        </div>
      </div>
    </main>
  );
}
