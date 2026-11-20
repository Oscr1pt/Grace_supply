export const IDLE_WARNING_AFTER_MS: number;
export const IDLE_EXPIRE_AFTER_MS: number;
export const IDLE_WARNING_TICK_MS: number;
export function idleActivityStorageKey(authUserId: string): string;
export function idleExpiryStorageKey(authUserId: string): string;
export function isIdleExpiryPersisted(storage: Pick<Storage, "getItem">, key: string): boolean;
export function persistIdleExpiry(storage: Pick<Storage, "setItem">, key: string): boolean;
export function clearIdleExpiry(storage: Pick<Storage, "removeItem">, key: string): void;
export function restoreIdleActivity(
  storage: Pick<Storage, "getItem">,
  key: string,
  now?: number,
): { lastActivityAt: number; invalid: boolean };
export function persistIdleActivity(
  storage: Pick<Storage, "setItem">,
  key: string,
  timestamp: number,
): boolean;
export function clearIdleActivity(storage: Pick<Storage, "removeItem">, key: string): void;
export function evaluateIdleTime(elapsedMs: number): "active" | "warning" | "expired";
export function formatIdleRemaining(remainingMs: number): string;
export class IdleSessionClock {
  constructor(options: {
    lastActivityAt: number;
    wallNow?: () => number;
    monotonicNow?: () => number;
  });
  elapsed(): number;
  state(): { phase: "active" | "warning" | "expired"; elapsedMs: number; remainingMs: number };
  markActivity(): number;
}
export function isTrustedIdleActivity(event: Event): boolean;
