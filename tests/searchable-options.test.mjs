import test from "node:test";
import assert from "node:assert/strict";
import { matchesSearch, normalizeSearchText } from "../src/lib/searchableOptions.js";

test("normalizes case and accents for searchable entity fields", () => {
  assert.equal(normalizeSearchText("José Núñez"), "jose nunez");
  assert.equal(matchesSearch(["José Núñez", "809-555-0198"], "JOSE"), true);
  assert.equal(matchesSearch(["Café molido", "CAF-02"], "cafe"), true);
});

test("matches partial names, codes, phones, and identifiers", () => {
  assert.equal(matchesSearch(["Café molido", "CAF-02"], "mol"), true);
  assert.equal(matchesSearch(["María López", "809-555-0198", "c100"], "555-01"), true);
  assert.equal(matchesSearch(["María López", "809-555-0198", "c100"], "C100"), true);
});

test("empty searches match every option and unrelated searches do not", () => {
  assert.equal(matchesSearch(["Producto", "SKU-1"], "   "), true);
  assert.equal(matchesSearch(["Producto", "SKU-1"], "xyz"), false);
});
