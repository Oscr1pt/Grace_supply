import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("CHG-28 source copy is valid UTF-8 Spanish without mojibake markers", () => {
  const files = [
    "src/routes/_app/settings.tsx",
    "src/lib/settings.ts",
    "src/lib/employeeManagement.js",
    "supabase/functions/complete-initial-password/index.ts",
    "supabase/functions/manage-profile/index.ts",
    "supabase/functions/username-recovery/index.ts",
  ];
  for (const file of files) {
    assert.doesNotMatch(read(file), /[\u00c3\u00c2\ufffd]/u, file);
  }
});

test("CHG-28 settings UI exposes one V1 ITBIS switch and no second approval action", () => {
  const source = read("src/routes/_app/settings.tsx");
  assert.match(source, /Aplicar ITBIS/u);
  assert.doesNotMatch(source, /Confirmar pol[íi]tica en el servidor/u);
  assert.doesNotMatch(source, /approveTaxPolicy/u);
});

test("CHG-28 V1 persistence is server-authoritative and limited to 18 percent", () => {
  const migration = read("supabase/migrations/20261104160000_chg28_itbis_v1_settings.sql");
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.save_sales_tax_v1/u);
  assert.match(migration, /private\.require_business_permission\('settings'\)/u);
  assert.match(migration, /v_rate <> 18/u);
  assert.match(migration, /guard_sales_tax_v1_update/u);
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.save_sales_tax_v1\(jsonb\) TO authenticated/u,
  );
});
