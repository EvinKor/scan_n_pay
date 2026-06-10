"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { getSessionByCode, joinSession } from "@/lib/session";
import { setLocalUser, setLocalUserForRoom } from "@/lib/identity";


export default function JoinPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const claimAs = searchParams.get("as"); // e.g. /join/MAKAN-7X2?as=CozyPanda

  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [roomExists, setRoomExists] = useState(false);
  const [participantNames, setParticipantNames] = useState<string[]>([]);
  const [claimMode, setClaimMode] = useState(false); // true when using ?as= link

  // Check if room exists & generate animal name
  useEffect(() => {
    async function check() {
      try {
        const session = await getSessionByCode(code.toUpperCase());
        if (!session) {
          setError("Room not found. Check the link and try again.");
          setChecking(false);
          return;
        }
        setRoomExists(true);
        const existingNames = session.participants.map((p) => p.name);
        setParticipantNames(existingNames);

        // If ?as=Name is provided and that name exists in the room, auto-claim
        if (claimAs && existingNames.includes(claimAs)) {
          setName(claimAs);
          setClaimMode(true);
        }
      } catch {
        setError("Failed to check room. Try again.");
      } finally {
        setChecking(false);
      }
    }
    check();
  }, [code, claimAs]);

  async function handleJoin() {
    if (!name.trim()) return setError("Enter a name first");
    setLoading(true);
    setError("");
    try {
      const session = await joinSession(code.toUpperCase(), name.trim());
      setLocalUser({ name: name.trim(), sessionId: session.id });
      setLocalUserForRoom(session.id, name.trim());
      router.push(`/room/${session.id}`);
    } catch (e: any) {
      setError(e.message || "Failed to join. Try again.");
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-6">
        <div className="w-10 h-10 rounded-full border-2 border-brand border-t-transparent animate-spin" />
        <p className="text-zinc-400 text-sm mt-4">Finding room…</p>
      </main>
    );
  }

  if (!roomExists) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-6">
        <div className="text-center space-y-4">
          <span className="text-5xl">😕</span>
          <h1 className="text-xl font-bold text-white">Room Not Found</h1>
          <p className="text-zinc-400 text-sm max-w-xs">
            The room <span className="text-brand font-mono">{code}</span> doesn't exist or has expired.
          </p>
          <button
            onClick={() => router.push("/")}
            className="mt-4 bg-brand text-black font-semibold rounded-xl px-6 py-3 hover:bg-opacity-90 active:scale-95 transition-all"
          >
            Go Home
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-12 relative">
      <button onClick={() => router.push("/")} className="absolute top-6 left-6 w-10 h-10 flex items-center justify-center rounded-full bg-surface/80 backdrop-blur-md border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors z-50">
        ←
      </button>
      
      {/* Logo */}
      <div className="mb-10 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand mb-4">
          <span className="text-3xl">🧾</span>
        </div>
        <h1 className="text-2xl font-bold font-mono text-white tracking-tight">
          {claimMode ? "Claim Your Spot" : "Join SplitLah"}
        </h1>
        <p className="text-zinc-400 mt-1 text-sm">
          Room: <span className="text-brand font-mono tracking-widest">{code}</span>
        </p>
      </div>

      {/* Join form */}
      <div className="w-full max-w-sm space-y-4">
        {/* Animal avatar */}
        <div className="bg-surface rounded-2xl p-5 text-center">
          <div className="text-4xl mb-2">
            {getAnimalEmoji(name)}
          </div>
          <p className="text-white font-semibold text-lg mb-1">{name}</p>
          <p className="text-zinc-500 text-xs">
            {claimMode
              ? "The host pre-created this spot for you"
              : "Your auto-generated name"}
          </p>
        </div>

        {/* Editable name — hide in claim mode since the name is fixed */}
        {!claimMode && (
          <div>
            <label className="text-zinc-500 text-xs uppercase tracking-wide mb-1 block">
              Change your name (optional)
            </label>
            <input
              type="text"
              placeholder="Your display name"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(""); }}
              className="w-full bg-surface border border-muted rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-brand transition-colors"
              maxLength={24}
            />
          </div>
        )}

        {claimMode && (
          <div className="bg-brand/10 border border-brand/20 rounded-xl p-3 text-center">
            <p className="text-brand text-sm">✨ The host already selected your items for you!</p>
            <p className="text-zinc-400 text-xs mt-1">Tap below to jump into the room</p>
          </div>
        )}

        <button
          onClick={handleJoin}
          disabled={loading}
          className="w-full bg-brand text-black font-bold rounded-2xl py-4 text-lg hover:bg-opacity-90 active:scale-95 transition-all disabled:opacity-50"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-5 h-5 rounded-full border-2 border-black border-t-transparent animate-spin" />
              Joining…
            </span>
          ) : claimMode ? (
            "Join as " + name + " →"
          ) : (
            "Join Room →"
          )}
        </button>

        {error && (
          <p className="text-red-400 text-sm text-center">{error}</p>
        )}
      </div>

      <p className="mt-12 text-zinc-600 text-xs text-center">
        Powered by SplitLah · No account needed
      </p>
    </main>
  );
}

/** Map the animal name to a fun emoji */
function getAnimalEmoji(name: string): string {
  const lower = name.toLowerCase();
  const map: Record<string, string> = {
    otter: "🦦", panda: "🐼", capybara: "🦫", raccoon: "🦝", fox: "🦊",
    penguin: "🐧", koala: "🐨", sloth: "🦥", quokka: "🐹", hedgehog: "🦔",
    hamster: "🐹", bunny: "🐰", duckling: "🐤", kitten: "🐱", puppy: "🐶",
    parrot: "🦜", toucan: "🐦", dolphin: "🐬", seal: "🦭", owl: "🦉",
    gecko: "🦎", chameleon: "🦎", axolotl: "🦎", flamingo: "🦩", alpaca: "🦙",
    llama: "🦙", corgi: "🐕", shiba: "🐕", moose: "🫎", beaver: "🦫",
    badger: "🦡", ferret: "🐿️", meerkat: "🐿️", pangolin: "🐾", walrus: "🦭",
    narwhal: "🐋", puffin: "🐧", robin: "🐦", sparrow: "🐦", chinchilla: "🐭",
    lemur: "🐒", tapir: "🐾", ocelot: "🐆", lynx: "🐈", mantis: "🦗",
    starfish: "⭐", jellyfish: "🪼", crab: "🦀", lobster: "🦞", turtle: "🐢",
  };

  for (const [animal, emoji] of Object.entries(map)) {
    if (lower.includes(animal)) return emoji;
  }
  return "🐾";
}
