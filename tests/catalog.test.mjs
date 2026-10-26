import test from "node:test";
import assert from "node:assert/strict";
import {
  clampSaleQuantity,
  getBarcodeProductDetails,
  getCatalogSearchText,
  getCatalogCategories,
  normalizeCatalogValue,
  resolveCatalogCategory,
  parseCatalogMoney,
  parseCatalogAttributes,
} from "../src/lib/catalog.js";

test("barcode details use generic catalog fields and ignore inherited jewelry columns", () => {
  const details = getBarcodeProductDetails({
    brand: "Wahl",
    presentation: "250 ml",
    unit: "botella",
    metal: "Oro",
    karat: "18k",
    stone: "Rubí",
    stone_carats: 2,
  });

  assert.equal(details, "Wahl · 250 ml · botella");
  assert.doesNotMatch(details, /oro|18k|rubí|ct|quilate|gema|metal/i);
});

test("sale quantity cannot exceed the currently available product stock", () => {
  assert.equal(clampSaleQuantity(8, 3), 3);
  assert.equal(clampSaleQuantity(0, 3), 1);
  assert.equal(clampSaleQuantity(2, 0), 0);
});

test("catalog search covers commercial fields without relying on legacy attributes", () => {
  const searchText = getCatalogSearchText({
    name: "Cera mate",
    sku: "GS-100",
    description: "Fijación fuerte",
    category: "Peinado",
    brand: "Grace Supply",
    presentation: "100 g",
    unit: "tarro",
  });

  assert.match(searchText, /cera mate/);
  assert.match(searchText, /gs-100/);
  assert.match(searchText, /fijacion fuerte/);
  assert.match(searchText, /peinado/);
  assert.match(searchText, /grace supply/);
  assert.match(searchText, /100 g/);
  assert.match(searchText, /tarro/);
});

test("catalog search ignores case, accents, and repeated whitespace", () => {
  const searchText = getCatalogSearchText({
    name: "Cera   Mate",
    sku: "GS-100",
    category: "Peinado",
    brand: "Grace Supply",
    presentation: "100 g",
    unit: "tarro",
  });

  assert.match(searchText, /cera mate/);
  assert.match(searchText, /peinado/);
});

test("category matching reuses existing spelling without blocking new categories", () => {
  const categories = ["Cuidado capilar", "Accesorios"];

  assert.equal(resolveCatalogCategory("  CUIDADO   CAPILAR ", categories), "Cuidado capilar");
  assert.equal(resolveCatalogCategory("Cuidado capilár", categories), "Cuidado capilar");
  assert.equal(resolveCatalogCategory("  Nueva categoría  ", categories), "Nueva categoría");
  assert.equal(normalizeCatalogValue("  Peinado   PROFESIONAL "), "peinado profesional");
});

test("category suggestions deduplicate trivial writing differences", () => {
  assert.deepEqual(
    getCatalogCategories([
      { category: "Cuidado capilar" },
      { category: " cuidado   CAPILAR " },
      { category: "Accesorios" },
      { category: " " },
    ]),
    ["Accesorios", "Cuidado capilar"],
  );
});

test("catalog money accepts nonnegative values up to two decimal places", () => {
  assert.equal(parseCatalogMoney("0"), 0);
  assert.equal(parseCatalogMoney(".50"), 0.5);
  assert.equal(parseCatalogMoney("123.45"), 123.45);
  for (const invalid of ["", "-1", "1.234", "1e3", "Infinity", ".", "1.", "1000000000000"]) {
    assert.equal(parseCatalogMoney(invalid), null, `expected ${invalid} to be rejected`);
  }
});

test("catalog attributes are optional objects with a readable validation result", () => {
  assert.deepEqual(parseCatalogAttributes(""), { value: {}, error: null });
  assert.deepEqual(parseCatalogAttributes("{}"), { value: {}, error: null });
  assert.deepEqual(parseCatalogAttributes('{"shade":"negro"}'), {
    value: { shade: "negro" },
    error: null,
  });
  assert.equal(parseCatalogAttributes("[").error, "Revisa las comillas y separadores del JSON.");
  assert.equal(parseCatalogAttributes("[]").error, "Escribe un objeto con pares clave y valor.");
});
