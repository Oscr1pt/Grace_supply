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

test("a quick cash purchase permits no supplier while credit still requires a registered supplier", () => {
  const draft = {
    supplierId: "",
    supplierName: "",
    suppliers: [supplier],
    paymentType: "contado",
    invoiceNo: "",
    dueDate: "",
    description: "Compra rápida de inventario",
    itemId: product.id,
    inventory: [product],
    quantity: 2,
    unitCost: 12.5,
    restock: true,
    quickPurchase: true,
  };

  assert.deepEqual(validatePurchaseDraft(draft), {});
  assert.match(
    validatePurchaseDraft({ ...draft, paymentType: "credito" }).supplierId,
    /proveedor registrado y activo/i,
  );
});

test("purchase draft validates one to one hundred distinct active linked lines", () => {
  const draft = {
    supplierId: supplier.id,
    supplierName: supplier.name,
    suppliers: [supplier],
    paymentType: "contado",
    invoiceNo: "",
    dueDate: "",
    description: "Recepción de productos",
    itemId: "",
    inventory: [
      product,
      { ...product, id: "product-2", sku: "SKU-2", name: "Artículo 2", quantity: 10 },
    ],
    lines: [
      { itemId: product.id, quantity: 2, unitCost: 10.25 },
      { itemId: "product-2", quantity: 3, unitCost: 4 },
    ],
    restock: true,
  };

  assert.deepEqual(validatePurchaseDraft(draft), {});
  assert.match(
    validatePurchaseDraft({ ...draft, lines: [draft.lines[0], draft.lines[0]] }).lines,
    /repetido|duplicado/i,
  );
  assert.match(validatePurchaseDraft({ ...draft, lines: [] }).lines, /al menos/i);
  assert.match(
    validatePurchaseDraft({
      ...draft,
      lines: Array.from({ length: 101 }, (_, index) => ({
        itemId: `product-${index}`,
        quantity: 1,
        unitCost: 1,
      })),
    }).lines,
    /100/,
  );
});

test("purchase lines validate linked active products, positive integer quantities and cents precision", () => {
  const draft = {
    supplierId: supplier.id,
    supplierName: supplier.name,
    suppliers: [supplier],
    paymentType: "contado",
    invoiceNo: "",
    dueDate: "",
    description: "Compra",
    itemId: "",
    inventory: [product],
    lines: [{ itemId: product.id, quantity: 1, unitCost: 10 }],
    restock: true,
  };

  assert.match(
    validatePurchaseDraft({ ...draft, lines: [{ ...draft.lines[0], itemId: "missing" }] }).lines,
    /activo|disponible/i,
  );
  assert.match(
    validatePurchaseDraft({ ...draft, lines: [{ ...draft.lines[0], quantity: 1.5 }] }).lines,
    /entero/i,
  );
  assert.match(
    validatePurchaseDraft({ ...draft, lines: [{ ...draft.lines[0], unitCost: -1 }] }).lines,
    /costo/i,
  );
  assert.match(
    validatePurchaseDraft({ ...draft, lines: [{ ...draft.lines[0], unitCost: 1.001 }] }).lines,
    /decimales/i,
  );
});

test("purchase lines support multiple manual and mixed entries without matching inventory", () => {
  const draft = {
    supplierId: supplier.id,
    supplierName: supplier.name,
    suppliers: [supplier],
    paymentType: "contado",
    invoiceNo: "",
    dueDate: "",
    description: "",
    itemId: "",
    inventory: [product],
    lines: [
      { kind: "linked", itemId: product.id, quantity: 2, unitCost: 10 },
      { kind: "manual", manualName: "Servicio de transporte", quantity: 1, unitCost: 5.5 },
      { kind: "manual", manualName: "Servicio de transporte", quantity: 3, unitCost: 2 },
    ],
    restock: true,
  };

  assert.deepEqual(validatePurchaseDraft(draft), {});
  const invalidLinked = validatePurchaseDraft({ ...draft, inventory: [] });
  assert.match(invalidLinked.lines, /Línea 1: selecciona un producto activo/i);
  assert.match(invalidLinked.lineErrors["line-1"].itemId, /producto activo/i);
  assert.equal(invalidLinked.lineErrors["line-2"], undefined);
});

test("manual purchase lines reject blank and boundary whitespace without normalizing", () => {
  const draft = {
    supplierId: supplier.id,
    supplierName: supplier.name,
    suppliers: [supplier],
    paymentType: "contado",
    invoiceNo: "",
    dueDate: "",
    description: "",
    itemId: "",
    inventory: [product],
    lines: [{ kind: "manual", manualName: "Reparación", quantity: 1, unitCost: 12 }],
    restock: true,
  };
  assert.deepEqual(validatePurchaseDraft(draft), {});
  for (const manualName of [
    "",
    "   ",
    "\t\t",
    "\n\r",
    " \t\n\v\f\r",
    " Reparación",
    "Reparación\t",
  ]) {
    assert.match(
      validatePurchaseDraft({ ...draft, lines: [{ ...draft.lines[0], manualName }] }).lines,
      /nombre/i,
      JSON.stringify(manualName),
    );
  }
  assert.deepEqual(
    validatePurchaseDraft({
      ...draft,
      lines: [{ ...draft.lines[0], manualName: "Reparación\t interna" }],
    }),
    {},
  );
  assert.deepEqual(
    validatePurchaseDraft({
      ...draft,
      lines: [{ ...draft.lines[0], manualName: "x".repeat(500) }],
    }),
    {},
  );
  assert.match(
    validatePurchaseDraft({ ...draft, lines: [{ ...draft.lines[0], manualName: "x".repeat(501) }] })
      .lines,
    /500/,
  );
  assert.match(
    validatePurchaseDraft({ ...draft, lines: [{ ...draft.lines[0], quantity: 0 }] }).lines,
    /cantidad/i,
  );
  assert.match(
    validatePurchaseDraft({ ...draft, lines: [{ ...draft.lines[0], unitCost: 1.001 }] }).lines,
    /costo/i,
  );
});

test("purchase line validation reports every error by stable line key and field", () => {
  const draft = {
    supplierId: supplier.id,
    supplierName: supplier.name,
    suppliers: [supplier],
    paymentType: "contado",
    invoiceNo: "",
    dueDate: "",
    description: "Compra mixta",
    itemId: "",
    inventory: [product],
    restock: true,
    lines: [
      { key: "manual-empty", kind: "manual", manualName: "", quantity: 1, unitCost: 1 },
      { key: "linked-valid", kind: "linked", itemId: product.id, quantity: 1, unitCost: 2 },
      {
        key: "manual-boundary",
        kind: "manual",
        manualName: " ReparaciÃ³n",
        quantity: 1,
        unitCost: 3,
      },
    ],
  };

  const errors = validatePurchaseDraft(draft);
  assert.deepEqual(errors.lineErrors, {
    "manual-empty": {
      manualName: "L\u00ednea 1: escribe el nombre del producto no registrado.",
    },
    "manual-boundary": {
      manualName: "L\u00ednea 3: elimina los espacios al inicio o al final del nombre.",
    },
  });
  assert.equal(errors.lines, errors.lineErrors["manual-empty"].manualName);
});

test("purchase line total uses integer cents for a stable preview", async () => {
  const validationModule = await import("../src/lib/businessDocumentValidation.js");
  const calculatePurchaseTotalCents = validationModule.calculatePurchaseTotalCents;
  assert.equal(typeof calculatePurchaseTotalCents, "function");
  assert.equal(
    calculatePurchaseTotalCents([
      { quantity: 2, unitCost: 10.25 },
      { quantity: 3, unitCost: 4 },
    ]),
    3250,
  );
  assert.equal(calculatePurchaseTotalCents([{ quantity: 1.5, unitCost: 3 }]), 0);
});

test("walk-in sale validation accepts a named cash customer without client registration", () => {
  assert.deepEqual(
    validateSaleDraft({
      customerMode: "occasional",
      clientId: "",
      walkInName: "  Cliente de mostrador  ",
      clients: [],
      lines: [{ itemId: product.id, unitPrice: 25, quantity: 1, name: product.name }],
      inventory: [product],
      paymentType: "contado",
      dueDate: "",
    }),
    {},
  );
});

test("walk-in sale validation requires a trimmed name of at most 160 characters and rejects credit", () => {
  const draft = {
    customerMode: "occasional",
    clientId: "",
    walkInName: "Mostrador",
    clients: [],
    lines: [{ itemId: product.id, unitPrice: 25, quantity: 1, name: product.name }],
    inventory: [product],
    paymentType: "contado",
    dueDate: "",
  };
  assert.match(validateSaleDraft({ ...draft, walkInName: "   " }).walkInName, /nombre/i);
  assert.match(validateSaleDraft({ ...draft, walkInName: "n".repeat(161) }).walkInName, /160/);
  assert.match(validateSaleDraft({ ...draft, paymentType: "credito" }).paymentType, /contado/i);
});

test("registered sale validation still requires an active UUID for cash and credit", () => {
  const draft = {
    customerMode: "registered",
    clientId: client.id,
    walkInName: "",
    clients: [client],
    lines: [{ itemId: product.id, unitPrice: 25, quantity: 1, name: product.name }],
    inventory: [product],
    paymentType: "credito",
    dueDate: "",
  };
  assert.equal(validateSaleDraft(draft).clientId, undefined);
  assert.equal(validateSaleDraft({ ...draft, paymentType: "contado" }).clientId, undefined);
});
