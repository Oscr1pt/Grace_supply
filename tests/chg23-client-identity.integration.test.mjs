import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const url = process.env.LOCAL_SUPABASE_URL;
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY;
const disposable = process.env.CHG23_DISPOSABLE_TESTS === "1";

const skipReason = !disposable || !url || !serviceKey || !anonKey;
const service = url && serviceKey ? createClient(url, serviceKey) : null;
const anon = url && anonKey ? createClient(url, anonKey) : null;
const ids = [];

test(
  "CHG-23 local database rejects invalid and normalized duplicate client documents",
  { skip: skipReason },
  async () => {
    const suffix = globalThis.crypto.randomUUID().slice(0, 8);
    const firstId = globalThis.crypto.randomUUID();
    const duplicateId = globalThis.crypto.randomUUID();
    const emptyId = globalThis.crypto.randomUUID();
    ids.push(firstId, duplicateId, emptyId);
    const base = {
      name: `CHG23 ${suffix}`,
      email: `${suffix}@example.test`,
      phone: "809-555-0100",
      status: "activo",
    };

    const first = await service
      .from("clients")
      .insert({ ...base, id: firstId, rnc: "001-1234567-3" })
      .select("id,rnc_normalized")
      .single();
    assert.ifError(first.error);
    assert.equal(first.data.rnc_normalized, "00112345673");

    const duplicate = await service
      .from("clients")
      .insert({ ...base, id: duplicateId, rnc: "00112345673" })
      .select("id")
      .maybeSingle();
    assert.ok(duplicate.error, "normalized duplicate must be rejected by PostgreSQL");
    assert.equal(duplicate.error.code, "23505");

    const invalid = await service
      .from("clients")
      .insert({ ...base, id: globalThis.crypto.randomUUID(), rnc: "texto libre" })
      .select("id")
      .maybeSingle();
    assert.ok(invalid.error, "invalid document must be rejected by PostgreSQL");
    assert.equal(invalid.error.code, "23514");

    const empty = await service
      .from("clients")
      .insert({ ...base, id: emptyId, email: `${suffix}-empty@example.test`, rnc: "" })
      .select("id,rnc_normalized")
      .single();
    assert.ifError(empty.error);
    assert.equal(empty.data.rnc_normalized, null);

    const edit = await service
      .from("clients")
      .update({ name: `CHG23 edited ${suffix}` })
      .eq("id", firstId)
      .select("id")
      .single();
    assert.ifError(edit.error);
    assert.equal(edit.data.id, firstId);

    const anonymousRead = await anon.from("clients").select("id").eq("id", firstId);
    assert.ok(
      anonymousRead.error || anonymousRead.data?.length === 0,
      "anonymous access must not expose clients",
    );
  },
);

test.after(async () => {
  if (service && ids.length) await service.from("clients").delete().in("id", ids);
});
