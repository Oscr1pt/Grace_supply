import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const authSource = readFileSync(new URL("../src/lib/auth.tsx", import.meta.url), "utf8");
const supabaseSource = readFileSync(new URL("../src/lib/supabase.ts", import.meta.url), "utf8");

test("application auth never reads passwords or profiles from the legacy users table", () => {
  assert.doesNotMatch(authSource, /\.from\(["']users["']\)|\.eq\(["']password["']/);
});

test("application auth never restores an authority-bearing session from localStorage", () => {
  assert.doesNotMatch(authSource, /localStorage|SESSION_KEY/);
});

test("Supabase Auth session persistence is scoped to the browser tab", () => {
  assert.match(supabaseSource, /sessionStorage/);
  assert.match(supabaseSource, /storage:\s*tabSessionStorage/);
  assert.doesNotMatch(supabaseSource, /storage:\s*(?:window\.)?localStorage|localStorage\.(?:getItem|setItem)\([^)]*(?:auth|session)/i);
  assert.match(supabaseSource, /key\.startsWith\(["']lustre_["']\)/);
});

test("public admin registration is absent from the auth context", () => {
  assert.doesNotMatch(authSource, /register\s*:/);
  assert.doesNotMatch(authSource, /role:\s*["']admin["']/);
});
