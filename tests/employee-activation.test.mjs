import test from "node:test";
import assert from "node:assert/strict";
import { activateProfile } from "../supabase/functions/_shared/employee-activation.js";

function makeService({
  activationError = null,
  unbanError = null,
  rebanError = null,
  active = false,
} = {}) {
  const calls = [];
  const service = {
    auth: {
      admin: {
        async getUserById(id) {
          calls.push(["get-user", id]);
          return {
            data: {
              user: {
                id,
                email: "synthetic@example.test",
                email_confirmed_at: "2026-11-01T00:00:00Z",
              },
            },
            error: null,
          };
        },
        async updateUserById(id, attributes) {
          calls.push(["auth-update", id, attributes]);
          if (attributes.ban_duration === "none")
            return { data: { user: { id } }, error: unbanError };
          return { data: { user: { id } }, error: rebanError };
        },
      },
    },
    from(table) {
      assert.equal(table, "user_profiles");
      return {
        update(values) {
          calls.push(["profile-update", values]);
          return {
            eq(column, value) {
              calls.push(["profile-filter", column, value]);
              return {
                select() {
                  return {
                    async maybeSingle() {
                      if (values.active === true && activationError)
                        return { data: null, error: activationError };
                      return {
                        data: {
                          auth_user_id: value,
                          active: values.active,
                          password_change_required: false,
                        },
                        error: null,
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
  return {
    service,
    calls,
    profile: {
      auth_user_id: "synthetic-user-id",
      username: "synthetic",
      active,
      password_change_required: false,
    },
  };
}

test("activate unblocks Auth before enabling the profile, including reconciliation of an already-active profile", async () => {
  const { service, calls, profile } = makeService({ active: true });
  const result = await activateProfile(service, profile);
  assert.equal(result.status, 200);
  assert.equal(result.body.profile.active, true);
  assert.deepEqual(calls.slice(0, 3), [
    ["get-user", profile.auth_user_id],
    ["auth-update", profile.auth_user_id, { ban_duration: "none" }],
    ["profile-update", { active: true }],
  ]);
});

test("failed Auth unblock leaves the profile inactive and never attempts activation", async () => {
  const { service, calls, profile } = makeService({
    unbanError: new Error("Auth failure"),
    active: true,
  });
  const result = await activateProfile(service, profile);
  assert.equal(result.status, 503);
  assert.match(result.body.error, /desbloquear/i);
  assert.ok(calls.some((call) => call[0] === "profile-update" && call[1].active === false));
  assert.ok(!calls.some((call) => call[0] === "profile-update" && call[1].active === true));
});

test("failed profile activation restores the Auth ban", async () => {
  const { service, calls, profile } = makeService({
    activationError: new Error("Database failure"),
  });
  const result = await activateProfile(service, profile);
  assert.equal(result.status, 409);
  assert.ok(calls.some((call) => call[0] === "auth-update" && call[2].ban_duration === "none"));
  assert.ok(calls.some((call) => call[0] === "auth-update" && call[2].ban_duration === "876000h"));
});

test("activation rejects a pending password before changing Auth or the profile", async () => {
  const { service, calls, profile } = makeService();
  profile.password_change_required = true;
  const result = await activateProfile(service, profile);
  assert.equal(result.status, 409);
  assert.equal(calls.length, 0);
});
