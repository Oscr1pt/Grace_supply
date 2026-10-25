import test from "node:test";
import assert from "node:assert/strict";
import { clampSaleQuantity, getBarcodeProductDetails, getCatalogSearchText } from "../src/lib/catalog.js";

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
  assert.match(searchText, /fijación fuerte/);
  assert.match(searchText, /peinado/);
  assert.match(searchText, /grace supply/);
  assert.match(searchText, /100 g/);
  assert.match(searchText, /tarro/);
});
