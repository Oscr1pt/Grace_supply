export const IDLE_WARNING_AFTER_MS = 115 * 60 * 1000;
export const IDLE_EXPIRE_AFTER_MS = 120 * 60 * 1000;
export const IDLE_WARNING_TICK_MS = 1000;
const MAX_FUTURE_CLOCK_SKEW_MS = 60 * 1000;

export function idleActivityStorageKey(authUserId) {
  if (typeof authUserId !== "string" || !authUserId.trim()) {
    throw new Error("Idle activity requires a verified identity.");
  }
  return `grace.idle.last-activity.v1:${authUserId}`;
}

export function idleExpiryStorageKey(authUserId) {
  if (typeof authUserId !== "string" || !authUserId.trim()) {
    throw new Error("Idle expiry requires a verified identity.");
  }
  return `grace.idle.expired.v1:${authUserId}`;
}

export function isIdleExpiryPersisted(storage, key) {
  try {
    return storage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function persistIdleExpiry(storage, key) {
  try {
    storage.setItem(key, "1");
    return true;
  } catch {
    return false;
  }
}

export function clearIdleExpiry(storage, key) {
  try {
    storage.removeItem(key);
  } catch {
    // The in-memory Auth lock remains authoritative for the current page.
  }
}

export function restoreIdleActivity(storage, key, now = Date.now()) {
  let stored;
  try {
    stored = storage.getItem(key);
  } catch {
    return { lastActivityAt: 0, invalid: true };
  }
  if (stored === null) return { lastActivityAt: now, invalid: false };
  const value = Number(stored);
  if (!Number.isSafeInteger(value) || value <= 0 || value > now + MAX_FUTURE_CLOCK_SKEW_MS) {
    return { lastActivityAt: 0, invalid: true };
  }
  if (value > now) return { lastActivityAt: now, invalid: false };
  return { lastActivityAt: value, invalid: false };
}

export function persistIdleActivity(storage, key, timestamp) {
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0) return false;
  try {
    storage.setItem(key, String(timestamp));
    return true;
  } catch {
    return false;
  }
}

export function clearIdleActivity(storage, key) {
  try {
    storage.removeItem(key);
  } catch {
    // A blocked storage API cannot grant access; the in-memory timer remains authoritative.
  }
}

export function evaluateIdleTime(elapsedMs) {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return "expired";
  if (elapsedMs >= IDLE_EXPIRE_AFTER_MS) return "expired";
  if (elapsedMs >= IDLE_WARNING_AFTER_MS) return "warning";
  return "active";
}

export function formatIdleRemaining(remainingMs) {
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * Tracks elapsed time across timer throttling and wall-clock corrections.
 * While the page is alive, the larger wall/monotonic delta wins so a backward
 * clock change cannot extend the deadline. On reload the persisted wall time
 * is authoritative; malformed or materially future values fail closed.
 */
export class IdleSessionClock {
  constructor({ lastActivityAt, wallNow = Date.now, monotonicNow = () => performance.now() }) {
    this.wallNow = wallNow;
    this.monotonicNow = monotonicNow;
    this.lastActivityAt = lastActivityAt;
    this.baseElapsed = Math.max(0, this.wallNow() - lastActivityAt);
    this.anchorWall = this.wallNow();
    this.anchorMono = this.monotonicNow();
  }

  elapsed() {
    const wallDelta = this.wallNow() - this.anchorWall;
    const monotonicDelta = this.monotonicNow() - this.anchorMono;
    if (wallDelta < -MAX_FUTURE_CLOCK_SKEW_MS || monotonicDelta < 0) {
      return IDLE_EXPIRE_AFTER_MS;
    }
    return this.baseElapsed + Math.max(0, wallDelta, monotonicDelta);
  }

  state() {
    const elapsedMs = this.elapsed();
    return {
      phase: evaluateIdleTime(elapsedMs),
      elapsedMs,
      remainingMs: Math.max(0, IDLE_EXPIRE_AFTER_MS - elapsedMs),
    };
  }

  markActivity() {
    const now = this.wallNow();
    this.lastActivityAt = now;
    this.baseElapsed = 0;
    this.anchorWall = now;
    this.anchorMono = this.monotonicNow();
    return now;
  }
}

export function isTrustedIdleActivity(event) {
  return Boolean(
    event?.isTrusted &&
    ["pointerdown", "keydown", "touchstart", "touchmove", "wheel", "click"].includes(event.type),
  );
}
