const LEGACY_KEY = "splitlah_user";
const ROOM_KEY_PREFIX = "splitlah_room_";

export interface LocalUser {
  name: string;
  sessionId: string;
}

// ── Per-Room Identity ──

/** Save identity for a specific room */
export function setLocalUserForRoom(sessionId: string, name: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(`${ROOM_KEY_PREFIX}${sessionId}`, name);
  // Also update legacy key for backward compat
  setLocalUser({ name, sessionId });
}

/** Get identity for a specific room */
export function getLocalUserForRoom(sessionId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    // Try per-room key first
    const roomName = localStorage.getItem(`${ROOM_KEY_PREFIX}${sessionId}`);
    if (roomName) return roomName;

    // Fallback: check legacy global key and migrate if it matches this room
    const legacy = getLocalUser();
    if (legacy && legacy.sessionId === sessionId) {
      // Migrate to per-room storage
      localStorage.setItem(`${ROOM_KEY_PREFIX}${sessionId}`, legacy.name);
      return legacy.name;
    }

    return null;
  } catch {
    return null;
  }
}

/** Clear identity for a specific room */
export function clearLocalUserForRoom(sessionId: string) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(`${ROOM_KEY_PREFIX}${sessionId}`);
}

// ── Legacy Global Identity (kept for backward compat) ──

export function setLocalUser(user: LocalUser) {
  localStorage.setItem(LEGACY_KEY, JSON.stringify(user));
}

export function getLocalUser(): LocalUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearLocalUser() {
  localStorage.removeItem(LEGACY_KEY);
}
