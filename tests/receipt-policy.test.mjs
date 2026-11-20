import test from "node:test";
import assert from "node:assert/strict";
import { isReceiptPolicyApplicable, receiptPolicyCopy } from "../src/lib/receiptPolicy.js";

const effectiveAt = "2026-11-17T16:00:00.000Z";

test("keeps the approved receipt policy copy exact and complete", () => {
  assert.deepEqual(receiptPolicyCopy, {
    thanks: "¡GRACIAS POR SU COMPRA!",
    title: "POLÍTICA DE CAMBIOS Y DEVOLUCIONES",
    paragraphs: [
      "No realizamos devoluciones de dinero por cambios de opinión.",
      "Los cambios por otros productos pueden solicitarse dentro de los 15 días posteriores a la compra, presentando el recibo y el producto en buen estado.",
      "Verifique sus productos antes de retirarse del establecimiento.",
      "Esta política no limita las garantías ni los derechos del consumidor establecidos por la ley.",
    ],
  });
  const copy = JSON.stringify(receiptPolicyCopy);
  assert.doesNotMatch(copy, /joyer[ií]a|prendas/i);
});

test("requires the configured publication cutoff to be a valid UTC timestamp", () => {
  const saleInstant = "2026-11-17T16:00:00.000Z";
  assert.equal(isReceiptPolicyApplicable(saleInstant, "2026-11-17T16:00:00Z"), true);
  assert.equal(isReceiptPolicyApplicable(saleInstant, "2026-11-17T11:00:00-05:00"), false);
  assert.equal(isReceiptPolicyApplicable(saleInstant, "2026-02-30T16:00:00Z"), false);
});
test("applies the receipt policy at or after its effective instant only", () => {
  assert.equal(isReceiptPolicyApplicable("2026-11-17T15:59:59.999Z", effectiveAt), false);
  assert.equal(isReceiptPolicyApplicable(effectiveAt, effectiveAt), true);
  assert.equal(isReceiptPolicyApplicable("2026-11-17T16:00:00.001Z", effectiveAt), true);
  assert.equal(isReceiptPolicyApplicable("not-a-date", effectiveAt), false);
  assert.equal(isReceiptPolicyApplicable(effectiveAt, ""), false);
});
