const KEY = "splitlah_user";

export interface LocalUser {
  name: string;
  sessionId: string;
}

export function setLocalUser(user: LocalUser) {
  localStorage.setItem(KEY, JSON.stringify(user));
}

export function getLocalUser(): LocalUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearLocalUser() {
  localStorage.removeItem(KEY);
}
