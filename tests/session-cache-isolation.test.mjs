import test from "node:test";
import assert from "node:assert/strict";

test("authorization scope fingerprint is stable but changes with identity or permissions", async () => {
  const { createAuthorizationScopeKey } = await import("../src/lib/sessionScope.js");
  const base = { authUserId: "user-a", role: "employee", permissions: ["sales", "clients"] };
  assert.equal(
    createAuthorizationScopeKey(base),
    createAuthorizationScopeKey({ ...base, permissions: ["clients", "sales"] }),
  );
  assert.notEqual(createAuthorizationScopeKey(base), createAuthorizationScopeKey({ ...base, authUserId: "user-b" }));
  assert.notEqual(createAuthorizationScopeKey(base), createAuthorizationScopeKey({ ...base, permissions: ["sales"] }));
  assert.notEqual(createAuthorizationScopeKey(base), createAuthorizationScopeKey({ ...base, role: "admin" }));
});

test("request captured under an old identity or permission scope is rejected", async () => {
  const { createScopeRequestGuard } = await import("../src/lib/sessionScope.js");
  const guard = createScopeRequestGuard("user-a|clients,sales");
  const request = guard.capture();
  assert.equal(guard.isCurrent(request), true);
  guard.update("user-b|clients,sales");
  assert.equal(guard.isCurrent(request), false);
  const nextRequest = guard.capture();
  guard.update("user-b|sales");
  assert.equal(guard.isCurrent(nextRequest), false);
});
