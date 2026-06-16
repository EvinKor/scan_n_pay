"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { getSessionByCode, joinSession } from "@/lib/session";
import { setLocalUser, setLocalUserForRoom } from "@/lib/identity";
import clsx from "clsx";


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
  const [owner, setOwner] = useState("");
  const [claimMode, setClaimMode] = useState(false); // true when using ?as= link

  const RANDOM_NAMES = [
    "SleepyPanda", "HappyOtter", "CleverFox", "ChillCapybara", "SneakyRaccoon",
    "FuzzyKoala", "SmartOwl", "BraveLion", "TinyMouse", "JumpingFrog"
  ];

  // Auto-generate a random name on initial load
  useEffect(() => {
    if (!claimAs && !name) {
      setName(RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)] + Math.floor(Math.random() * 100));
    }
  }, []);

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
        setOwner(session.owner);
        
        // Exclude the owner from the selectable list so no one can join as them
        const existingNames = session.participants.map((p) => p.name).filter(n => n !== session.owner);
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
    if (name.trim() === owner) return setError("You cannot join as the room host.");
    
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
        <p className="text-subtle text-sm mt-4">Finding room…</p>
      </main>
    );
  }

  if (!roomExists) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-6">
        <div className="text-center space-y-4">
          <span className="text-5xl">😕</span>
          <h1 className="text-xl font-bold text-main">Room Not Found</h1>
          <p className="text-subtle text-sm max-w-xs">
            The room <span className="text-brand font-mono">{code}</span> doesn't exist or has expired.
          </p>
          <button
            onClick={() => router.push("/")}
            className="mt-4 bg-brand text-white font-semibold rounded-xl px-6 py-3 hover:bg-opacity-90 active:scale-95 transition-all"
          >
            Go Home
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-12 relative">
      <button onClick={() => router.push("/")} className="absolute top-6 left-6 w-10 h-10 flex items-center justify-center rounded-full bg-surface/80 backdrop-blur-md border border-divider text-main hover:bg-muted transition-colors z-50">
        ←
      </button>
      
      {/* Logo */}
      <div className="mb-10 text-center">
        <div className="w-full max-w-[240px] mx-auto mb-4">
          <img src="/app_icon.png" alt="Split Lah Logo" className="w-full h-auto drop-shadow-md rounded-xl" />
        </div>
        <p className="text-subtle mt-1 text-sm">
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
          <p className="text-main font-semibold text-lg mb-1">{name}</p>
          <p className="text-subtle text-xs">
            {claimMode
              ? "The host pre-created this spot for you"
              : "Your auto-generated name"}
          </p>
        </div>

        {/* Select existing member or enter new name */}
        {!claimMode && participantNames.length > 0 && (
          <div className="mb-6">
            <p className="text-subtle text-xs uppercase tracking-wide mb-3">Join as existing member</p>
            <div className="flex flex-wrap gap-2">
              {participantNames.map((p) => (
                <button
                  key={p}
                  onClick={() => { setName(p); setError(""); }}
                  className={clsx(
                    "px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2",
                    name === p
                      ? "bg-brand text-white shadow-md shadow-brand/20"
                      : "bg-surface/80 backdrop-blur-md border border-divider text-main hover:bg-muted"
                  )}
                >
                  <span className="text-xl">{getAnimalEmoji(p)}</span>
                  {p}
                </button>
              ))}
            </div>
            
            <div className="flex items-center gap-4 my-6">
              <div className="flex-1 h-px bg-muted"></div>
              <p className="text-subtle text-xs font-semibold uppercase">OR</p>
              <div className="flex-1 h-px bg-muted"></div>
            </div>
          </div>
        )}

        {!claimMode && (
          <div>
            <label className="text-subtle text-xs uppercase tracking-wide mb-1 block">
              {participantNames.length > 0 ? "Join as new member" : "Change your name (optional)"}
            </label>
            <input
              type="text"
              placeholder={participantNames.length > 0 ? "Enter a new name" : "Your display name"}
              value={participantNames.includes(name) ? "" : name}
              onChange={(e) => { setName(e.target.value); setError(""); }}
              className="w-full bg-surface/80 backdrop-blur-md border border-divider rounded-xl px-4 py-3 text-main placeholder-subtle focus:outline-none focus:border-brand transition-colors"
              maxLength={24}
            />
          </div>
        )}

        {claimMode && (
          <div className="bg-brand/10 border border-brand/20 rounded-xl p-3 text-center">
            <p className="text-brand text-sm">✨ The host already selected your items for you!</p>
            <p className="text-subtle text-xs mt-1">Tap below to jump into the room</p>
          </div>
        )}

        <button
          onClick={handleJoin}
          disabled={loading}
          className="w-full bg-brand text-white font-bold rounded-2xl py-4 text-lg hover:bg-opacity-90 active:scale-95 transition-all disabled:opacity-50"
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

      <p className="mt-12 text-subtle text-xs text-center">
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
