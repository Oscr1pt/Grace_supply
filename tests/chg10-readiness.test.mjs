import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const config = readFileSync(resolve(root, "supabase/config.toml"), "utf8");
const migrationDir = resolve(root, "supabase/migrations");

test("local Supabase does not enable a missing or unreviewed seed", () => {
  const seedBlock = config.match(/\[db\.seed\]([\s\S]*?)(?=\n\[|$)/)?.[1];
  assert.ok(seedBlock, "[db.seed] section must be explicit");
  assert.match(seedBlock, /^enabled\s*=\s*false\s*$/m);
  assert.doesNotMatch(seedBlock, /seed\.sql/);
});

test("email auth provider remains available for invited-user login while public signup is disabled", () => {
  assert.match(config, /^enable_signup\s*=\s*false\s*$/m);
  const emailBlock = config.match(/\[auth\.email\]([\s\S]*?)(?=\n\[|$)/)?.[1];
  assert.ok(emailBlock);
  assert.match(emailBlock, /^enable_signup\s*=\s*true\s*$/m);
});

test("installable migrations match the reviewed 16-version sequence", () => {
  const versions = readdirSync(migrationDir)
    .filter((file) => /^\d{14}_.+\.sql$/.test(file))
    .map((file) => file.slice(0, 14))
    .sort();

  assert.deepEqual(versions, [
    "20261021041426",
    "20261021043648",
    "20261022000000",
    "20261022190000",
    "20261022191000",
    "20261022193000",
    "20261022200000",
    "20261022200500",
    "20261022201000",
    "20261022202000",
    "20261022210000",
    "20261022220000",
    "20261022221000",
    "20261022230000",
    "20261022231000",
    "20261024051641",
  ]);
});

test("legacy containment migration stays outside the installable sequence", () => {
  assert.equal(
    existsSync(resolve(root, "supabase/legacy-migrations/20261020120000_chg00_anonymous_containment.sql")),
    true,
  );
  assert.equal(
    existsSync(resolve(migrationDir, "20261020120000_chg00_anonymous_containment.sql")),
    false,
  );
});

test("database integration suites require an explicit local container target", () => {
  for (const filename of ["business.integration.test.mjs", "security.integration.test.mjs"]) {
    const source = readFileSync(resolve(root, "tests", filename), "utf8");
    assert.match(source, /LOCAL_SUPABASE_CONTAINER/);
    assert.doesNotMatch(source, /execFileSync\("docker", \["exec", "supabase_db_jewel-sales-hub"/);
  }
});

test("first-admin SQL is operator-only, single-use, inactive by default, and confirmation-gated", () => {
  const createSql = readFileSync(resolve(root, "supabase/bootstrap/first-admin-create.sql"), "utf8");
  const activateSql = readFileSync(resolve(root, "supabase/bootstrap/first-admin-activate.sql"), "utf8");

  assert.match(createSql, /pg_advisory_xact_lock/);
  assert.match(createSql, /FROM public\.user_profiles/);
  assert.match(createSql, /role\s*:?=\s*'admin'|VALUES[\s\S]*'admin'/);
  assert.match(createSql, /active\s*:?=\s*false|VALUES[\s\S]*false/);
  assert.doesNotMatch(createSql, /__ROLE__|__ACTIVE__/);
  assert.match(activateSql, /email_confirmed_at IS NOT NULL/);
  assert.match(activateSql, /pg_advisory_xact_lock/);
  assert.match(activateSql, /UPDATE public\.user_profiles[\s\S]*active\s*=\s*true/);
  assert.match(activateSql, /role\s*=\s*'admin'/);
});
