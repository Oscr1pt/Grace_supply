import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";

const enabled = process.env.CHG39_DISPOSABLE_TESTS === "1";
const url = process.env.LOCAL_SUPABASE_URL;
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY;
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const container = process.env.LOCAL_SUPABASE_CONTAINER;
const disposableStack = /^supabase_db_gracechg39[a-z0-9]+$/.test(container ?? "");
const skipReason = !enabled || !url || !anonKey || !serviceKey || !disposableStack;
const suffix = globalThis.crypto.randomUUID().replaceAll("-", "").slice(0, 10);
const email = `chg39-client-${suffix}@example.test`;
const password = `Client-${globalThis.crypto.randomUUID()}-9c!`;
const clientIds = [globalThis.crypto.randomUUID(), globalThis.crypto.randomUUID()];
const saleId = globalThis.crypto.randomUUID();
const creditId = globalThis.crypto.randomUUID();
let service;
let authenticated;
let authUserId;

test(
  "CHG-39 authenticated client writes allow NULL identity while preserving validation, uniqueness, RLS, and history",
  { skip: skipReason },
  async () => {
    const target = new URL(url);
    assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(target.hostname));
    assert.match(container, /^supabase_db_gracechg39[a-z0-9]+$/);

    service = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const anonymous = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const anonymousReader = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const createdUser = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    assert.ifError(createdUser.error);
    authUserId = createdUser.data.user.id;

    const profile = await service.from("user_profiles").insert({
      auth_user_id: authUserId,
      username: `chg39-${suffix}`,
      name: "Synthetic CHG-39 client operator",
      role: "employee",
      permissions: ["clients"],
      active: true,
    });
    assert.ifError(profile.error);

    const signIn = await anonymous.auth.signInWithPassword({ email, password });
    assert.ifError(signIn.error);
    authenticated = anonymous;

    const first = await authenticated
      .from("clients")
      .insert({ id: clientIds[0], name: `CHG39 ${suffix} first`, status: "activo", rnc: null })
      .select("id,rnc,rnc_normalized")
      .single();
    assert.ifError(first.error);
    assert.deepEqual(first.data, { id: clientIds[0], rnc: null, rnc_normalized: null });

    const second = await authenticated
      .from("clients")
      .insert({ id: clientIds[1], name: `CHG39 ${suffix} second`, status: "activo" })
      .select("id,rnc,rnc_normalized")
      .single();
    assert.ifError(second.error);
    assert.deepEqual(second.data, { id: clientIds[1], rnc: null, rnc_normalized: null });

    const anonymousRead = await anonymousReader
      .from("clients")
      .select("id")
      .eq("id", clientIds[0])
      .maybeSingle();
    assert.ok(anonymousRead.error || anonymousRead.data === null, "RLS must deny anonymous reads");

    const sale = await service.from("sales").insert({
      id: saleId,
      receipt_no: `GS-CHG39-${suffix}`,
      client_id: clientIds[0],
      subtotal: 100,
      tax_rate: 0,
      tax: 0,
      total: 100,
      payment_type: "credito",
    });
    assert.ifError(sale.error);
    const credit = await service.from("client_credits").insert({
      id: creditId,
      sale_id: saleId,
      client_id: clientIds[0],
      receipt_no: `GS-CHG39-${suffix}`,
      total: 100,
      paid: 0,
      balance: 100,
      status: "pendiente",
    });
    assert.ifError(credit.error);

    const completed = await authenticated
      .from("clients")
      .update({ rnc: "001-1234567-3" })
      .eq("id", clientIds[0])
      .select("id,rnc,rnc_normalized")
      .single();
    assert.ifError(completed.error);
    assert.deepEqual(completed.data, {
      id: clientIds[0],
      rnc: "001-1234567-3",
      rnc_normalized: "00112345673",
    });

    const duplicate = await authenticated
      .from("clients")
      .update({ rnc: "00112345673" })
      .eq("id", clientIds[1])
      .select("id")
      .maybeSingle();
    assert.equal(duplicate.error?.code, "23505", "normalized duplicate documents stay unique");

    const invalid = await authenticated
      .from("clients")
      .update({ rnc: "40219994058" })
      .eq("id", clientIds[1])
      .select("id")
      .maybeSingle();
    assert.equal(invalid.error?.code, "23514", "PostgreSQL still rejects an invalid checksum");

    const history = await service
      .from("sales")
      .select("id,client_id,receipt_no,total")
      .eq("id", saleId)
      .single();
    assert.ifError(history.error);
    assert.deepEqual(history.data, {
      id: saleId,
      client_id: clientIds[0],
      receipt_no: `GS-CHG39-${suffix}`,
      total: 100,
    });
    const persistedCredit = await service
      .from("client_credits")
      .select("id,client_id,sale_id,balance")
      .eq("id", creditId)
      .single();
    assert.ifError(persistedCredit.error);
    assert.deepEqual(persistedCredit.data, {
      id: creditId,
      client_id: clientIds[0],
      sale_id: saleId,
      balance: 100,
    });
  },
);

test.after(async () => {
  if (!service) return;
  await service.from("client_credits").delete().eq("id", creditId);
  await service.from("sales").delete().eq("id", saleId);
  await service.from("clients").delete().in("id", clientIds);
  if (authUserId) {
    await service.from("user_profiles").delete().eq("auth_user_id", authUserId);
    await service.auth.admin.deleteUser(authUserId);
  }
});
