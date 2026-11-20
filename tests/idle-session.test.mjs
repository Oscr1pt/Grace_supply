import test from "node:test";
import assert from "node:assert/strict";
import {
  IDLE_WARNING_AFTER_MS,
  IDLE_EXPIRE_AFTER_MS,
  IdleSessionClock,
  evaluateIdleTime,
  formatIdleRemaining,
  idleActivityStorageKey,
  idleExpiryStorageKey,
  isTrustedIdleActivity,
  isIdleExpiryPersisted,
  persistIdleExpiry,
  clearIdleExpiry,
  persistIdleActivity,
  restoreIdleActivity,
} from "../src/lib/idleSession.js";

function fakeStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

test("warns at 115 minutes and expires at 120 without early warning", () => {
  assert.equal(evaluateIdleTime(114 * 60_000), "active");
  assert.equal(evaluateIdleTime(IDLE_WARNING_AFTER_MS), "warning");
  assert.equal(evaluateIdleTime(IDLE_EXPIRE_AFTER_MS), "expired");
  assert.equal(formatIdleRemaining(5 * 60_000), "5:00");
});

test("activity resets the injected wall and monotonic clock", () => {
  let wall = 1_800_000_000_000;
  let mono = 500;
  const clock = new IdleSessionClock({
    lastActivityAt: wall,
    wallNow: () => wall,
    monotonicNow: () => mono,
  });
  wall += 60 * 60_000;
  mono += 60 * 60_000;
  assert.equal(clock.state().phase, "active");
  clock.markActivity();
  wall += IDLE_WARNING_AFTER_MS - 1;
  mono += IDLE_WARNING_AFTER_MS - 1;
  assert.equal(clock.state().phase, "active");
  wall += 1;
  mono += 1;
  assert.equal(clock.state().phase, "warning");
});

test("monotonic time prevents a wall-clock rollback from extending a live session", () => {
  let wall = 1_800_000_000_000;
  let mono = 0;
  const clock = new IdleSessionClock({
    lastActivityAt: wall,
    wallNow: () => wall,
    monotonicNow: () => mono,
  });
  wall -= 5 * 60_000;
  mono += IDLE_EXPIRE_AFTER_MS;
  assert.equal(clock.state().phase, "expired");
});

test("invalid and materially future persisted timestamps fail closed", () => {
  const now = 1_800_000_000_000;
  assert.deepEqual(restoreIdleActivity(fakeStorage({ key: "broken" }), "key", now), {
    lastActivityAt: 0,
    invalid: true,
  });
  assert.equal(
    restoreIdleActivity(fakeStorage({ key: String(now + 61_000) }), "key", now).invalid,
    true,
  );
});

test("the per-identity key is scoped within the tab storage and activity is explicit", () => {
  const storage = fakeStorage();
  const a = idleActivityStorageKey("actor-a");
  const b = idleActivityStorageKey("actor-b");
  assert.notEqual(a, b);
  persistIdleActivity(storage, a, 1_800_000_000_000);
  assert.equal(storage.getItem(b), null);
  assert.equal(
    restoreIdleActivity(storage, a, 1_800_000_000_000).lastActivityAt,
    1_800_000_000_000,
  );
  assert.equal(isTrustedIdleActivity({ type: "keydown", isTrusted: true }), true);
  assert.equal(isTrustedIdleActivity({ type: "TOKEN_REFRESHED", isTrusted: true }), false);
  assert.equal(isTrustedIdleActivity({ type: "pointerdown", isTrusted: false }), false);
});

test("an expiry marker is identity-scoped, persists across reloads, and clears on a fresh login", () => {
  const storage = fakeStorage();
  const actorA = idleExpiryStorageKey("actor-a");
  const actorB = idleExpiryStorageKey("actor-b");
  assert.notEqual(actorA, actorB);
  assert.equal(persistIdleExpiry(storage, actorA), true);
  assert.equal(isIdleExpiryPersisted(storage, actorA), true);
  assert.equal(isIdleExpiryPersisted(storage, actorB), false);
  clearIdleExpiry(storage, actorA);
  assert.equal(isIdleExpiryPersisted(storage, actorA), false);
});
