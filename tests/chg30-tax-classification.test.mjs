import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { calculateSaleTax } from "../src/lib/salesTaxPolicy.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const migration = readFileSync(
  resolve(
    root,
    "supabase/migrations/20261105174946_chg30_product_tax_classification_authorization.sql",
  ),
  "utf8",
);
const storageSource = readFileSync(resolve(root, "src/lib/storage.ts"), "utf8");

const policy = { status: "approved", enabled: true, rate: 18, pricesInclude: false };

test("CHG-30 migration exposes only an audited classification RPC", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.set_product_tax_classification/);
  assert.match(migration, /private\.require_business_permission\('inventory'\)/);
  assert.match(migration, /private\.is_active_admin\(\)/);
  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /inventory_tax_classification_audit/);
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.set_product_tax_classification\(jsonb\) FROM PUBLIC, anon/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.set_product_tax_classification\(jsonb\) TO authenticated/,
  );
  assert.doesNotMatch(migration, /GRANT (INSERT|UPDATE).*inventory.*tax_classification/i);
});

test("sales inventory lookup carries the confirmed product classification", () => {
  assert.match(migration, /SELECT id, sku, name, price, quantity, tax_classification/);
  assert.match(migration, /AND is_active/);
});

test("inventory edits exclude the server-managed creation timestamp", () => {
  assert.match(storageSource, /serverTimestampTables\.has\(table\)\) delete row\.created_at/);
});

test("preview taxes only gravado lines and preserves exento lines", () => {
  const result = calculateSaleTax(
    [
      { itemId: "a", unitPrice: 100, quantity: 1, taxClassification: "gravado" },
      { itemId: "b", unitPrice: 50, quantity: 1, taxClassification: "exento" },
    ],
    policy,
  );
  assert.equal(result.subtotal, 150);
  assert.equal(result.tax, 18);
  assert.equal(result.total, 168);
});

test("preview blocks pending classification only when ITBIS is enabled", () => {
  const blocked = calculateSaleTax(
    [{ itemId: "a", unitPrice: 100, quantity: 1, taxClassification: "pendiente" }],
    policy,
  );
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.reason, "tax_classification_pending");

  const disabled = calculateSaleTax(
    [{ itemId: "a", unitPrice: 100, quantity: 1, taxClassification: "pendiente" }],
    { ...policy, enabled: false },
  );
  assert.equal(disabled.status, "approved");
  assert.equal(disabled.tax, 0);
  assert.equal(disabled.total, 100);
});
