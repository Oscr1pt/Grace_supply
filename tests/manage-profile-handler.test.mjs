import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { webcrypto } from "node:crypto";

const handlerSource = readFileSync(
  new URL("../supabase/functions/manage-profile/index.ts", import.meta.url),
  "utf8",
);
const activationSource = readFileSync(
  new URL("../supabase/functions/_shared/employee-activation.js", import.meta.url),
  "utf8",
);

function profile(username, id, role = "employee", options = {}) {
  return {
    username,
    normalized_username: username,
    auth_user_id: id,
    name: username,
    phone: null,
    role,
    permissions: role === "admin" ? ["dashboard", "settings"] : ["sales"],
    active: options.active ?? true,
    password_change_required: options.passwordChangeRequired ?? false,
    banned: options.banned ?? false,
    emailConfirmed: options.emailConfirmed,
    authUnavailable: options.authUnavailable ?? false,
  };
}

function createHarness({
  actorId = "admin-id",
  actorRole = "admin",
  profiles,
  incidents = [],
  recoveryError = null,
}) {
  const authUsers = new Map(
    profiles
      .filter((p) => !p.authUnavailable)
      .map((p) => [
        p.auth_user_id,
        {
          id: p.auth_user_id,
          email: p.username + "@example.test",
          email_confirmed_at: p.emailConfirmed === false ? null : "2026-11-01T00:00:00.000Z",
          banned: p.banned,
          banned_until: p.banned ? "2099-01-01T00:00:00.000Z" : null,
        },
      ]),
  );
  const events = [];
  function execute(q) {
    events.push([q.table, q.operation, ...q.filters]);
    const rows = q.table === "user_profiles" ? profiles : incidents;
    const found = rows.filter((row) => q.filters.every(([key, value]) => row[key] === value));
    if (q.operation.startsWith("update")) {
      if (!found[0]) return { data: null, error: null };
      Object.assign(found[0], q.values);
      return { data: { ...found[0] }, error: null };
    }
    return {
      data: q.many ? found.map((row) => ({ ...row })) : found[0] ? { ...found[0] } : null,
      error: null,
    };
  }
  const service = {
    auth: {
      admin: {
        async getUserById(id) {
          const user = authUsers.get(id);
          events.push(["auth.getUserById", id]);
          return user
            ? { data: { user: { ...user } }, error: null }
            : { data: { user: null }, error: Error("missing") };
        },
        async updateUserById(id, attrs) {
          events.push(["auth.update", id, attrs.ban_duration]);
          const user = authUsers.get(id);
          if (!user) return { data: { user: null }, error: Error("missing") };
          user.banned = attrs.ban_duration !== "none";
          user.banned_until = user.banned ? "2099-01-01T00:00:00.000Z" : null;
          return { data: { user: { ...user } }, error: null };
        },
        async generateLink(args) {
          events.push(["auth.generateLink", args.type, args.email, args.options?.redirectTo]);
          if (recoveryError) return { data: null, error: recoveryError };
          return {
            data: { properties: { action_link: "https://auth.example.test/recovery-once" } },
            error: null,
          };
        },
      },
    },
    from(table) {
      const q = { table, filters: [], operation: "select", values: null };
      const b = {
        select() {
          q.operation = q.operation === "update" ? "update-select" : "select";
          return b;
        },
        eq(k, v) {
          q.filters.push([k, v]);
          return b;
        },
        update(v) {
          q.operation = "update";
          q.values = v;
          return b;
        },
        maybeSingle() {
          return Promise.resolve(execute(q));
        },
        order() {
          q.many = true;
          return b;
        },
        single() {
          return Promise.resolve(execute(q));
        },
        then(resolve, reject) {
          return Promise.resolve(execute(q)).then(resolve, reject);
        },
      };
      return b;
    },
  };
  const identity = { user: { id: actorId, email_confirmed_at: "2026-11-01T00:00:00.000Z" } };
  const globals = {
    activateProfile: null,
    createClient(_url, key) {
      if (key === "service-key") return service;
      return {
        auth: {
          async getUser(token) {
            return token === "test-token"
              ? { data: identity, error: null }
              : { data: { user: null }, error: Error("bad token") };
          },
        },
      };
    },
    normalizeUsername(value) {
      return typeof value === "string" ? value.trim().normalize("NFKC").toLowerCase() : "";
    },
    json(_request, status, body) {
      return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });
    },
  };
  const context = vm.createContext({
    __test: globals,
    Deno: {
      env: {
        get(k) {
          return (
            {
              SUPABASE_URL: "http://127.0.0.1:54321",
              SUPABASE_ANON_KEY: "anon-key",
              SUPABASE_SERVICE_ROLE_KEY: "service-key",
              ACCOUNT_PROVISIONING_ENABLED: "false",
              ACCOUNT_RECOVERY_ENABLED: "true",
              APP_PUBLIC_ORIGIN: "https://gracesupply.net",
              APP_ALLOWED_ORIGINS: "https://gracesupply.net",
            }[k] ?? null
          );
        },
      },
      serve(handler) {
        context.handler = handler;
      },
    },
    URL,
    Request,
    Response,
    crypto: webcrypto,
    console: { log() {}, warn() {}, error() {} },
  });
  const helper = activationSource.replace(
    /^export\s+async\s+function\s+activateProfile/m,
    "globalThis.__test.activateProfile = async function activateProfile",
  );
  vm.runInContext(helper, context);
  const transformed = handlerSource
    .replace(
      /^import \{ createClient \} from "npm:@supabase\/supabase-js@2";$/m,
      "const { createClient } = globalThis.__test;",
    )
    .replace(
      /^import \{ json, normalizeUsername \} from "\.\.\/_shared\/http\.ts";$/m,
      "const { json, normalizeUsername } = globalThis.__test;",
    )
    .replace(
      /^import \{ activateProfile \} from "\.\.\/_shared\/employee-activation\.js";$/m,
      "const { activateProfile } = globalThis.__test;",
    );
  vm.runInContext(
    ts.transpileModule(transformed, {
      compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    context,
  );
  return {
    profiles,
    authUsers,
    events,
    request(body, token = "test-token") {
      const headers = { "content-type": "application/json" };
      if (token) headers.authorization = "Bearer " + token;
      return context.handler(
        new Request("http://local.test/functions/v1/manage-profile", {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        }),
      );
    },
  };
}

test("handler revokes then reactivates an employee and clears the Auth ban", async () => {
  const employee = profile("worker", "worker-id");
  const h = createHarness({ profiles: [profile("boss", "admin-id", "admin"), employee] });
  const revoke = await h.request({ action: "revoke", username: "worker" });
  assert.equal(revoke.status, 200);
  assert.equal(employee.active, false);
  assert.equal(h.authUsers.get("worker-id").banned, true);
  const activate = await h.request({ action: "activate", username: "worker" });
  assert.equal(activate.status, 200);
  assert.equal(employee.active, true);
  assert.equal(h.authUsers.get("worker-id").banned, false);
});

test("handler reconciles an active profile whose Auth identity is banned", async () => {
  const employee = profile("worker", "worker-id", "employee", { active: true, banned: true });
  const h = createHarness({ profiles: [profile("boss", "admin-id", "admin"), employee] });
  const response = await h.request({ action: "activate", username: "worker" });
  assert.equal(response.status, 200);
  assert.equal(employee.active, true);
  assert.equal(h.authUsers.get("worker-id").banned, false);
  assert.ok(h.events.some((e) => e[0] === "auth.update" && e[2] === "none"));
});

test("handler updates employee name, phone and permissions", async () => {
  const employee = profile("worker", "worker-id");
  const h = createHarness({ profiles: [profile("boss", "admin-id", "admin"), employee] });
  const response = await h.request({
    action: "update",
    username: "worker",
    name: "Worker Updated",
    phone: "+1 809 555 0101",
    permissions: ["sales", "inventory", "admin"],
  });
  assert.equal(response.status, 200);
  assert.equal(employee.name, "Worker Updated");
  assert.equal(employee.phone, "+1 809 555 0101");
  assert.deepEqual(employee.permissions, ["sales", "inventory"]);
});

test("handler rejects a non-admin before changing an employee", async () => {
  const employee = profile("worker", "worker-id");
  const h = createHarness({
    actorId: "worker-id",
    actorRole: "employee",
    profiles: [profile("boss", "admin-id", "admin"), employee],
  });
  const response = await h.request({ action: "update", username: "worker", name: "Denied" });
  assert.equal(response.status, 403);
  assert.equal(employee.name, "worker");
});

test("handler protects the administrator from revoking their own account", async () => {
  const admin = profile("boss", "admin-id", "admin");
  const h = createHarness({ profiles: [admin] });
  const response = await h.request({ action: "revoke", username: "boss" });
  assert.equal(response.status, 409);
  assert.equal(admin.active, true);
  assert.equal(h.authUsers.get("admin-id").banned, false);
});

test("handler returns a controlled not-found response for an absent target", async () => {
  const admin = profile("boss", "admin-id", "admin");
  const h = createHarness({ profiles: [admin] });
  const response = await h.request({ action: "activate", username: "missing" });
  assert.equal(response.status, 404);
  assert.match((await response.json()).error, /perfil/i);
});

test("handler returns only explicit email-verification state to an active administrator", async () => {
  const admin = profile("boss", "admin-id", "admin");
  const confirmed = profile("confirmed", "confirmed-id", "employee", { emailConfirmed: true });
  const pending = profile("pending", "pending-id", "employee", { emailConfirmed: false });
  const unknown = profile("unknown", "unknown-id", "employee", { authUnavailable: true });
  const h = createHarness({ profiles: [admin, confirmed, pending, unknown] });

  const response = await h.request({ action: "list_employees" });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(
    body.profiles.map(({ username, email_confirmed }) => ({ username, email_confirmed })),
    [
      { username: "boss", email_confirmed: true },
      { username: "confirmed", email_confirmed: true },
      { username: "pending", email_confirmed: false },
      { username: "unknown", email_confirmed: null },
    ],
  );
  assert.doesNotMatch(JSON.stringify(body), /@example\.test|auth_user_id|email"/);
  assert.equal(h.events.filter(([type]) => type === "auth.getUserById").length, 4);
});

test("handler denies employee access to the privileged employee directory", async () => {
  const h = createHarness({
    actorId: "worker-id",
    profiles: [profile("boss", "admin-id", "admin"), profile("worker", "worker-id", "employee")],
  });

  const response = await h.request({ action: "list_employees" });

  assert.equal(response.status, 403);
  assert.equal(
    h.events.some(([type]) => type === "auth.getUserById"),
    false,
  );
});

test("handler refuses recovery links for a revoked employee without changing the account", async () => {
  const employee = profile("worker", "worker-id", "employee", {
    active: false,
    passwordChangeRequired: false,
    banned: true,
  });
  const before = structuredClone(employee);
  const h = createHarness({ profiles: [profile("boss", "admin-id", "admin"), employee] });
  const response = await h.request({ action: "generate_recovery_link", username: "worker" });
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /reactivar/i);
  assert.deepEqual(employee, before);
  assert.equal(h.authUsers.get("worker-id").banned, true);
  assert.equal(
    h.events.some((event) => event[0] === "auth.generateLink"),
    false,
  );
  assert.equal(
    h.events.some((event) => event[0] === "auth.update"),
    false,
  );
});

test("handler generates a recovery link after an administrator reactivates the employee", async () => {
  const employee = profile("worker", "worker-id", "employee", {
    active: false,
    passwordChangeRequired: false,
    banned: true,
  });
  const h = createHarness({ profiles: [profile("boss", "admin-id", "admin"), employee] });
  const blocked = await h.request({ action: "generate_recovery_link", username: "worker" });
  assert.equal(blocked.status, 409);

  employee.active = true;
  h.authUsers.get("worker-id").banned = false;
  h.authUsers.get("worker-id").banned_until = null;
  h.events.length = 0;
  const response = await h.request({ action: "generate_recovery_link", username: "worker" });

  assert.equal(response.status, 200);
  assert.equal((await response.json()).recovery_url, "https://auth.example.test/recovery-once");
  assert.equal(employee.active, true);
  assert.equal(employee.role, "employee");
  assert.deepEqual(employee.permissions, ["sales"]);
  assert.equal(
    h.events.some((event) => event[0] === "auth.update"),
    false,
  );
  assert.ok(h.events.some((event) => event[0] === "auth.generateLink" && event[1] === "recovery"));
});

test("handler refuses recovery links when Auth is banned even if the profile appears active", async () => {
  const employee = profile("worker", "worker-id", "employee", {
    active: true,
    passwordChangeRequired: false,
    banned: true,
  });
  const h = createHarness({ profiles: [profile("boss", "admin-id", "admin"), employee] });
  const response = await h.request({ action: "generate_recovery_link", username: "worker" });

  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /reactivar/i);
  assert.equal(
    h.events.some((event) => event[0] === "auth.generateLink"),
    false,
  );
  assert.equal(employee.active, true);
});

test("handler denies employee recovery-link requests and handles Auth errors safely", async () => {
  const employee = profile("worker", "worker-id");
  const denied = createHarness({
    actorId: "worker-id",
    profiles: [profile("boss", "admin-id", "admin"), employee],
  });
  const deniedResponse = await denied.request({
    action: "generate_recovery_link",
    username: "worker",
  });
  assert.equal(deniedResponse.status, 403);
  const failed = createHarness({
    profiles: [profile("boss", "admin-id", "admin"), employee],
    recoveryError: Error("private token detail"),
  });
  const failedResponse = await failed.request({
    action: "generate_recovery_link",
    username: "worker",
  });
  assert.equal(failedResponse.status, 503);
  assert.doesNotMatch(await failedResponse.text(), /private token detail|recovery-once/);
});
