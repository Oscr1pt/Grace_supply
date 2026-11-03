import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const authSource = readFileSync(new URL("../src/lib/auth.tsx", import.meta.url), "utf8");

test("profile read failures use the service-unavailable path", () => {
  assert.match(authSource, /class ProfileLoadError extends Error/);
  assert.match(authSource, /if \(error\) throw new ProfileLoadError\(\)/);
  assert.match(authSource, /throw new Error\(AUTH_UNAVAILABLE\)/);
});

test("session events cannot invalidate an in-flight login attempt", () => {
  assert.match(authSource, /const loginAttempt = useRef\(0\)/);
  assert.match(authSource, /const attempt = \+\+loginAttempt\.current/);
  assert.match(authSource, /if \(attempt !== loginAttempt\.current\)/);
});
