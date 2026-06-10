const LEGACY_KEY = "splitlah_user";
const ROOM_KEY_PREFIX = "splitlah_room_";

export interface LocalUser {
  name: string;
  sessionId: string;
  icon?: string;
}

// ── Per-Room Identity ──

/** Save identity for a specific room */
export function setLocalUserForRoom(sessionId: string, name: string, icon?: string) {
  if (typeof window === "undefined") return;
  const data = JSON.stringify({ name, icon });
  localStorage.setItem(`${ROOM_KEY_PREFIX}${sessionId}`, data);
  // Also update legacy key for backward compat
  setLocalUser({ name, sessionId, icon });
}

/** Get identity for a specific room */
export function getLocalUserForRoom(sessionId: string): { name: string; icon?: string } | null {
  if (typeof window === "undefined") return null;
  try {
    // Try per-room key first
    const roomData = localStorage.getItem(`${ROOM_KEY_PREFIX}${sessionId}`);
    if (roomData) {
      try {
        const parsed = JSON.parse(roomData);
        if (parsed.name) return parsed;
      } catch {
        // Fallback for old simple string format
        return { name: roomData };
      }
    }

    // Fallback: check legacy global key and migrate if it matches this room
    const legacy = getLocalUser();
    if (legacy && legacy.sessionId === sessionId) {
      // Migrate to per-room storage
      setLocalUserForRoom(sessionId, legacy.name, legacy.icon);
      return { name: legacy.name, icon: legacy.icon };
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
