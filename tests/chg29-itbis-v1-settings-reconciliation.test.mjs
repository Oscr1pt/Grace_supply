import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { persistenceFailure } from "../src/lib/persistence.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("V1 settings expose only the fixed ITBIS switch and one save action", () => {
  const source = read("src/routes/_app/settings.tsx");
  assert.match(source, /Aplicar ITBIS/u);
  assert.match(source, /taxRate:\s*18/u);
  assert.doesNotMatch(source, /Tasa de impuesto \(%\)/u);
  assert.doesNotMatch(source, /approve_sales_tax_policy/u);
});

test("settings writes force the supported 18 percent rate", () => {
  const source = read("src/lib/settings.ts");
  assert.match(source, /tax_rate:\s*18/u);
  assert.doesNotMatch(source, /tax_rate:\s*Number\(next\.taxRate\)/u);
});

test("missing backend objects are reported separately from permission failures", () => {
  const outdated = persistenceFailure({ code: "PGRST202", status: 404 });
  const denied = persistenceFailure({ code: "42501", status: 403 });
  assert.equal(outdated.kind, "outdated");
  assert.equal(denied.kind, "denied");
  assert.notEqual(outdated.kind, denied.kind);
});
