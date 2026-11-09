import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";

const enabled = process.env.RUN_LOCAL_SECURITY_INTEGRATION === "1";
const url = process.env.LOCAL_SUPABASE_URL;
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY;
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;

test("CHG-32 creates an inactive employee and returns a one-time setup link without SMTP", async (t) => {
  if (!enabled) return t.skip("local Supabase integration is disabled");
  assert.ok(url && anonKey && serviceKey);
  const service = createClient(url, serviceKey, { auth: { persistSession: false } });
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });
  const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 10);
  const adminEmail = `chg32-admin-${suffix}@example.test`;
  const adminPassword = `Admin-${crypto.randomUUID()}-Aa1!`;
  const employeeEmail = `chg32-employee-${suffix}@example.test`;
  const username = `chg32${suffix}`;
  let adminId;
  let employeeId;
  try {
    const createdAdmin = await service.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
    });
    assert.ifError(createdAdmin.error);
    adminId = createdAdmin.data.user.id;
    const profile = await service.from("user_profiles").insert({
      auth_user_id: adminId,
      username: `admin${suffix}`,
      name: "CHG32 admin",
      phone: "+18095550199",
      role: "admin",
      permissions: ["sales", "settings"],
      active: true,
      password_change_required: false,
    });
    assert.ifError(profile.error);
    const session = await anon.auth.signInWithPassword({
      email: adminEmail,
      password: adminPassword,
    });
    assert.ifError(session.error);
    const response = await fetch(`${url}/functions/v1/manage-profile`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${session.data.session.access_token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action: "create_user",
        username,
        name: "CHG32 employee",
        email: employeeEmail,
        phone: "+18095550198",
        role: "employee",
        permissions: ["sales"],
      }),
    });
    const body = await response.json();
    assert.equal(response.status, 202, JSON.stringify(body));
    const setupLink = new URL(body.setup_url);
    assert.equal(setupLink.pathname, "/auth/v1/verify");
    assert.match(setupLink.searchParams.get("redirect_to") ?? "", /setup-account/);
    assert.equal(body.profile.active, false);
    assert.equal(body.profile.password_change_required, true);
    const stored = await service
      .from("user_profiles")
      .select("auth_user_id,active,password_change_required")
      .eq("normalized_username", username)
      .single();
    assert.ifError(stored.error);
    employeeId = stored.data.auth_user_id;
    assert.deepEqual(
      {
        active: stored.data.active,
        password_change_required: stored.data.password_change_required,
      },
      { active: false, password_change_required: true },
    );
    const first = await fetch(body.setup_url, { redirect: "manual" });
    const second = await fetch(body.setup_url, { redirect: "manual" });
    assert.equal(first.status, 303);
    assert.equal(second.status, 303);
    assert.match(second.headers.get("location") ?? "", /error=access_denied/);
  } finally {
    if (employeeId) {
      await service.from("user_profiles").delete().eq("auth_user_id", employeeId);
      await service.auth.admin.deleteUser(employeeId);
    }
    if (adminId) {
      await service.from("user_profiles").delete().eq("auth_user_id", adminId);
      await service.auth.admin.deleteUser(adminId);
    }
  }
});

test("CHG-32 retires the SMTP invitation action without opening public registration", async (t) => {
  if (!enabled) return t.skip("local Supabase integration is disabled");
  assert.ok(url && anonKey && serviceKey);
  const service = createClient(url, serviceKey, { auth: { persistSession: false } });
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });
  const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 10);
  const email = `chg32-admin-${suffix}@example.test`;
  const password = `Admin-${crypto.randomUUID()}-Aa1!`;
  let adminId;
  try {
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(created.error);
    adminId = created.data.user.id;
    const profile = await service.from("user_profiles").insert({
      auth_user_id: adminId,
      username: `admin${suffix}`,
      name: "CHG32 admin",
      phone: "+18095550197",
      role: "admin",
      permissions: ["settings"],
      active: true,
      password_change_required: false,
    });
    assert.ifError(profile.error);
    const session = await anon.auth.signInWithPassword({ email, password });
    assert.ifError(session.error);
    const response = await fetch(`${url}/functions/v1/manage-profile`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${session.data.session.access_token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ action: "invite_employee", username: `legacy${suffix}` }),
    });
    assert.equal(response.status, 410);
  } finally {
    if (adminId) {
      await service.from("user_profiles").delete().eq("auth_user_id", adminId);
      await service.auth.admin.deleteUser(adminId);
    }
  }
});
