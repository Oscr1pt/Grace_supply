import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import test from "node:test";

const historicalMigration = readFileSync(
  new URL(
    "../supabase/migrations/20261103133000_chg26_client_identity_required.sql",
    import.meta.url,
  ),
  "utf8",
);
const migrationNames = readdirSync(new URL("../supabase/migrations/", import.meta.url));
const optionalDocumentMigrationName = migrationNames.find((name) =>
  name.endsWith("_client_document_optional.sql"),
);

test("CHG-26 document trigger is retired without changing validation, uniqueness, or RLS", () => {
  assert.match(
    historicalMigration,
    /CREATE TRIGGER clients_require_document_for_authenticated_insert/,
  );
  assert.ok(
    optionalDocumentMigrationName,
    "forward migration must be generated through Supabase CLI",
  );
  const migration = readFileSync(
    new URL(`../supabase/migrations/${optionalDocumentMigrationName}`, import.meta.url),
    "utf8",
  );
  const statements = migration
    .replace(/^--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .trim();
  assert.match(
    statements,
    /^BEGIN; DROP TRIGGER IF EXISTS clients_require_document_for_authenticated_insert ON public\.clients; COMMIT;$/i,
  );
  assert.doesNotMatch(
    migration,
    /DROP CONSTRAINT|DROP INDEX|DISABLE ROW LEVEL SECURITY|DROP POLICY|ALTER POLICY/i,
  );
});
