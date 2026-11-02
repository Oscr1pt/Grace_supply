import test from "node:test";
import assert from "node:assert/strict";
import { validatePurchaseDraft, validateSaleDraft } from "../src/lib/businessDocumentValidation.js";

const client = { id: "client-1", name: "Cliente A", status: "activo" };
const product = { id: "product-1", sku: "SKU-1", name: "Artículo", price: 25, quantity: 3 };
const supplier = { id: "supplier-1", name: "Proveedor A", status: "activo" };

test("sale draft validation rejects inactive clients, stale prices, and quantities beyond stock", () => {
  const errors = validateSaleDraft({
    clientId: client.id,
    clients: [client],
    lines: [{ itemId: product.id, unitPrice: 25, quantity: 4, name: product.name }],
    inventory: [product],
    paymentType: "credito",
    dueDate: "",
  });
  assert.match(errors.lines, /existencia/i);
  assert.deepEqual(
    validateSaleDraft({
      clientId: "inactive",
      clients: [{ ...client, status: "inactivo" }],
      lines: [],
      inventory: [],
      paymentType: "contado",
      dueDate: "",
    }),
    {
      clientId: "Selecciona un cliente activo.",
      lines: "Agrega al menos un artículo.",
    },
  );
});

test("purchase draft validation requires a registered supplier for credit and safe document values", () => {
  const errors = validatePurchaseDraft({
    supplierId: "",
    supplierName: "Proveedor libre",
    suppliers: [supplier],
    paymentType: "credito",
    invoiceNo: "",
    dueDate: "",
    description: "",
    itemId: "",
    inventory: [],
    quantity: 1.5,
    unitCost: 1.001,
    restock: true,
  });
  assert.match(errors.supplierId, /registrado/i);
  assert.match(errors.invoiceNo, /factura/i);
  assert.match(errors.description, /artículo/i);
  assert.match(errors.quantity, /entero/i);
  assert.match(errors.unitCost, /decimales/i);
});

test("a cash purchase permits a free-text supplier and a non-restocking description-only document", () => {
  assert.deepEqual(
    validatePurchaseDraft({
      supplierId: "",
      supplierName: "Proveedor libre",
      suppliers: [supplier],
      paymentType: "contado",
      invoiceNo: "",
      dueDate: "",
      description: "Compra sin artículo vinculado",
      itemId: "",
      inventory: [],
      quantity: 2,
      unitCost: 0,
      restock: false,
    }),
    {},
  );
});
