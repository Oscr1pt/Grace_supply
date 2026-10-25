import test from "node:test";
import assert from "node:assert/strict";
import { validateBusinessSettings } from "../src/lib/settings-validation.js";
import { createSettingsWriter } from "../src/lib/settings-writer.js";
import { clearSettingsCache } from "../src/lib/settings-cache.js";

test("business settings rejects blank names, malformed phones, and invalid tax rates", () => {
  assert.deepEqual(
    validateBusinessSettings({
      businessName: "  ",
      businessPhone: "phone?",
      taxRate: "NaN",
    }),
    {
      businessName: "Escribe el nombre del negocio.",
      businessPhone: "Escribe un teléfono válido con entre 7 y 15 dígitos.",
      taxRate: "Escribe una tasa numérica entre 0 y 100.",
    },
  );
});

test("business settings accepts a valid zero tax rate and formatted phone", () => {
  assert.deepEqual(
    validateBusinessSettings({
      businessName: " Grace Supply ",
      businessPhone: "+1 (809) 555-0100",
      taxRate: "0",
    }),
    {},
  );
});

test("serialized settings patches preserve confirmed fields across consecutive writes", async () => {
  let confirmed = { businessName: "Grace", labelWidthMm: 50, labelShowPrice: true };
  const writes = [];
  const writer = createSettingsWriter({
    getConfirmed: () => confirmed,
    persist: async (next) => {
      writes.push(next);
      return next;
    },
    commit: (next) => {
      confirmed = next;
    },
  });

  await Promise.all([
    writer({ labelWidthMm: 70 }),
    writer({ labelShowPrice: false }),
    writer({ businessName: "Grace Supply" }),
  ]);

  assert.deepEqual(writes.at(-1), {
    businessName: "Grace Supply",
    labelWidthMm: 70,
    labelShowPrice: false,
  });
});

test("settings writer persists only the fields changed by each operation", async () => {
  let confirmed = { businessName: "Grace", labelWidthMm: 50 };
  const persistedPatches = [];
  const writer = createSettingsWriter({
    getConfirmed: () => confirmed,
    persist: async (_next, patch) => {
      persistedPatches.push(patch);
      return { ...confirmed, ...patch };
    },
    commit: (next) => {
      confirmed = next;
    },
  });

  await writer({ labelWidthMm: 70 });
  assert.deepEqual(persistedPatches, [{ labelWidthMm: 70 }]);
});

test("failed settings writes do not commit or report success and can be retried", async () => {
  let confirmed = { businessName: "Grace", labelWidthMm: 50 };
  let attempts = 0;
  const writer = createSettingsWriter({
    getConfirmed: () => confirmed,
    persist: async (next) => {
      attempts += 1;
      if (attempts === 1) throw new Error("offline");
      return next;
    },
    commit: (next) => {
      confirmed = next;
    },
  });

  await assert.rejects(writer({ labelWidthMm: 70 }), /offline/);
  assert.deepEqual(confirmed, { businessName: "Grace", labelWidthMm: 50 });
  await writer({ labelWidthMm: 70 });
  assert.deepEqual(confirmed, { businessName: "Grace", labelWidthMm: 70 });
});

test("local cache cleanup removes only approved browser list keys", () => {
  const values = new Map([
    ["lustre_clients", "clients"],
    ["lustre_inventory", "items"],
    ["lustre_sales", "sales"],
    ["lustre_purchases", "purchases"],
    ["sb-auth-token", "session"],
    ["unrelated", "keep"],
  ]);
  const storage = { removeItem: (key) => values.delete(key) };

  assert.equal(clearSettingsCache(storage), true);
  assert.deepEqual(
    [...values],
    [
      ["sb-auth-token", "session"],
      ["unrelated", "keep"],
    ],
  );
});

test("local cache cleanup reports partial failures accurately", () => {
  let removed = 0;
  const storage = {
    removeItem: () => {
      removed += 1;
      if (removed === 2) throw new Error("blocked");
    },
  };
  assert.equal(clearSettingsCache(storage), false);
});
