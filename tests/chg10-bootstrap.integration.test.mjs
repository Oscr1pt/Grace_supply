import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import test from "node:test";

const enabled = process.env.RUN_LOCAL_BOOTSTRAP_INTEGRATION === "1";
const url = process.env.LOCAL_SUPABASE_URL;
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const container = process.env.LOCAL_SUPABASE_CONTAINER;
const mailpit = process.env.LOCAL_MAILPIT_URL;
const admin = enabled && url && serviceKey
  ? createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  : null;

function sqlTemplate(filename, values) {
  let sql = readFileSync(new URL(`../supabase/bootstrap/${filename}`, import.meta.url), "utf8");
  for (const [key, value] of Object.entries(values)) {
    const literal = key === "AUTH_USER_ID"
      ? `'${value}'`
      : `'${String(value).replaceAll("'", "''")}'`;
    sql = sql.replaceAll(`'__${key}__'`, literal);
  }
  assert.doesNotMatch(sql, /__[A-Z_]+__/);
  return sql;
}

function runSql(sql) {
  try {
    return execFileSync("docker", ["exec", "-i", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], {
      input: sql,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (error) {
    const detail = Buffer.isBuffer(error.stderr) ? error.stderr.toString("utf8") : String(error.stderr ?? error.message);
    throw new Error(detail, { cause: error });
  }
}

async function mailpitInvite() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const response = await fetch(`${mailpit}/api/v1/messages`);
    assert.equal(response.ok, true, "Mailpit API must be available locally");
    const payload = await response.json();
    const message = payload.messages?.find((item) => item.To?.some((recipient) => recipient.Address === email));
    if (message) {
      const detailResponse = await fetch(`${mailpit}/api/v1/message/${message.ID}`);
      assert.equal(detailResponse.ok, true);
      const detail = await detailResponse.json();
      for (const body of [detail.Text, detail.HTML]) {
        if (typeof body !== "string") continue;
        for (const match of body.matchAll(/https?:\/\/[^\s"<>]+/g)) {
          const link = new URL(match[0].replaceAll("&amp;", "&"));
          if (link.pathname === "/auth/v1/verify" && link.searchParams.get("type") === "invite") return link;
        }
      }
      throw new Error("Auth invitation arrived but did not contain the expected verification link");
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Auth invitation did not arrive in local Mailpit");
}

const email = `chg10-bootstrap-${crypto.randomUUID()}@example.test`;

test("trusted one-time admin bootstrap is recoverable, confirmation-gated, and single-use", { skip: !enabled }, async () => {
  assert.ok(url && serviceKey && mailpit, "local-only Supabase and Mailpit credentials are required");
  assert.match(container ?? "", /^supabase_db_chg10[a-z0-9]+$/);
  assert.ok(["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname));
  assert.ok(["localhost", "127.0.0.1", "::1"].includes(new URL(mailpit).hostname));

  const invited = await admin.auth.admin.inviteUserByEmail(email, { data: { name: "Synthetic CHG-10 Owner" } });
  assert.ifError(invited.error);
  const authId = invited.data.user.id;
  const values = { AUTH_USER_ID: authId, USERNAME: "chg10_bootstrap_owner", DISPLAY_NAME: "Synthetic CHG-10 Owner" };

  // An invalid profile input simulates a partial failure after Auth invitation.
  const invalid = sqlTemplate("first-admin-create.sql", { ...values, USERNAME: "x" });
  assert.throws(() => runSql(invalid));
  const afterFailure = await admin.from("user_profiles").select("auth_user_id");
  assert.ifError(afterFailure.error);
  assert.equal(afterFailure.data.length, 0, "failed insertion must roll back without a profile");

  // Resume with the same Auth UUID. The transaction lock makes parallel retries serialize.
  const createSql = sqlTemplate("first-admin-create.sql", values);
  const attempts = await Promise.allSettled([Promise.resolve().then(() => runSql(createSql)), Promise.resolve().then(() => runSql(createSql))]);
  const successes = attempts.filter((attempt) => attempt.status === "fulfilled").length;
  const failures = attempts.filter((attempt) => attempt.status === "rejected");
  assert.equal(successes, 1, `exactly one serialized create should succeed; errors: ${failures.map((attempt) => attempt.reason?.message).join(" | ")}`);
  assert.equal(failures.length, 1);

  const profileBefore = await admin.from("user_profiles").select("role,active,auth_user_id").eq("auth_user_id", authId).single();
  assert.ifError(profileBefore.error);
  assert.deepEqual(profileBefore.data, { role: "admin", active: false, auth_user_id: authId });
  const activateSql = sqlTemplate("first-admin-activate.sql", { AUTH_USER_ID: authId });
  assert.throws(() => runSql(activateSql), /matching Auth identity is not confirmed/);

  const invitationLink = await mailpitInvite();
  assert.equal(invitationLink.searchParams.get("type"), "invite");
  assert.ok(invitationLink.searchParams.has("token") || invitationLink.searchParams.has("token_hash"));
  const confirmationResponse = await fetch(invitationLink, { redirect: "manual" });
  assert.ok([301, 302, 303, 307, 308].includes(confirmationResponse.status), "following the Mailpit Auth invite should confirm and redirect");
  const confirmed = await admin.auth.admin.getUserById(authId);
  assert.ifError(confirmed.error);
  assert.ok(confirmed.data.user.email_confirmed_at, "Auth should mark the invited identity confirmed");

  runSql(activateSql);
  const activated = await admin.from("user_profiles").select("active").eq("auth_user_id", authId).single();
  assert.ifError(activated.error);
  assert.equal(activated.data.active, true);
  assert.throws(() => runSql(createSql), /first-admin bootstrap is single use/);
  assert.throws(() => runSql(activateSql), /expected inactive first-admin profile was not found/);

  const extra = await admin.auth.admin.createUser({ email: `chg10-extra-${crypto.randomUUID()}@example.test`, email_confirm: true });
  assert.ifError(extra.error);
  const extraCreate = sqlTemplate("first-admin-create.sql", { ...values, AUTH_USER_ID: extra.data.user.id, USERNAME: "chg10_extra_admin" });
  assert.throws(() => runSql(extraCreate), /first-admin bootstrap is single use/);
});
