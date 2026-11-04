import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20261103133000_chg26_client_identity_required.sql",
    import.meta.url,
  ),
  "utf8",
);

test("CHG-26 requires documents for authenticated new clients without weakening history", () => {
  assert.match(migration, /BEFORE INSERT ON public\.clients/);
  assert.match(migration, /current_setting\('request\.jwt\.claim\.role', true\) = 'authenticated'/);
  assert.match(migration, /NEW\.rnc IS NULL/);
  assert.match(migration, /ERRCODE = '23514'/);
  assert.doesNotMatch(migration, /ALTER TABLE public\.clients[\s\S]*SET NOT NULL/);
  assert.match(migration, /REVOKE ALL ON FUNCTION/);
});
