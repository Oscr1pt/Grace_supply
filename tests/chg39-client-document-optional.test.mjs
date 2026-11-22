import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const clientForm = readFileSync(new URL("../src/routes/_app/clients.tsx", import.meta.url), "utf8");
const receipt = readFileSync(new URL("../src/routes/_app/sales.tsx", import.meta.url), "utf8");

test("client document is optional while supplied values remain validated and duplicate checked", () => {
  assert.match(clientForm, /validateClientForm\(form\)/);
  assert.doesNotMatch(clientForm, /validateClientForm\(form,\s*\{\s*requireDocument/);
  assert.match(clientForm, /label="RNC \/ Cédula \(opcional\)"/);
  assert.match(clientForm, /placeholder="Puedes agregarlo después"/);
  assert.match(clientForm, /findClientDocumentDuplicate\(clients, form\.rnc, editing\?\.id\)/);
  assert.match(
    clientForm,
    /const normalizedDocument = normalizeClientDocument\(form\.rnc\) \|\| null/,
  );
  assert.match(clientForm, /rnc: normalizedDocument/);
  assert.doesNotMatch(clientForm, /el documento es diferente/i);
  assert.match(clientForm, /Confirmo que se trata de otra persona distinta\./);
});

test("receipt omits the non-fiscal banner without changing historical policy logic or receipt identity", () => {
  assert.doesNotMatch(receipt, /RECIBO INTERNO\s*[—-]\s*NO ES COMPROBANTE FISCAL/);
  assert.match(receipt, /isReceiptPolicyApplicable\(sale\.createdAt, policyEffectiveAt\)/);
  assert.match(receipt, /\{sale\.receiptNo\}/);
  assert.match(receipt, /\{settings\.businessName\}/);
  assert.match(receipt, /\{settings\.businessAddress\}/);
  assert.match(receipt, /\{settings\.businessPhone\}/);
});
