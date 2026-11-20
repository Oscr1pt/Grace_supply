import test from "node:test";
import assert from "node:assert/strict";

let guard = {};
try {
  guard = await import("../scripts/production-build-guard.mjs");
} catch {
  // Keep the red phase an assertion failure when the guard has not been implemented yet.
}

test("production guard exposes config and artifact validation entry points", () => {
  assert.equal(typeof guard.validateProductionConfig, "function");
  assert.equal(typeof guard.inspectProductionBundleText, "function");
  assert.equal(typeof guard.selectApprovedPublicKey, "function");
  assert.equal(typeof guard.validateCompiledBrowserRuntimeConfig, "function");
  assert.equal(typeof guard.inspectNoPrivilegedCredentials, "function");
});

const projectUrl = "https://qazjfofpfcwopcefupjl.supabase.co";
const approvedKey = "sb_publishable_abcdefghijklmnopqrstuv_ABCDEFGH";
const syntheticPrivilegedKey = ["sb", "secret", "abcdefghijklmnopqrstuv", "ABCDEFGH"].join("_");
const cutoff = "2026-11-18T03:30:00.000Z";

function validEnv(overrides = {}) {
  return {
    VITE_SUPABASE_URL: projectUrl,
    VITE_SUPABASE_ANON_KEY: approvedKey,
    VITE_ACCOUNT_PROVISIONING_ENABLED: "true",
    VITE_ACCOUNT_RECOVERY_ENABLED: "false",
    VITE_RECEIPT_POLICY_EFFECTIVE_AT: cutoff,
    GRACE_APPROVED_RECEIPT_POLICY_EFFECTIVE_AT: cutoff,
    ...overrides,
  };
}

function assertConfigRejected(env, trustedKey = { type: "publishable", api_key: approvedKey }) {
  assert.throws(
    () => guard.validateProductionConfig(env, trustedKey),
    /Production build configuration rejected/,
  );
}

test("accepts only the approved project URL, full active publishable key, flags, and UTC cutoff", () => {
  const result = guard.validateProductionConfig(validEnv(), {
    type: "publishable",
    api_key: approvedKey,
  });
  assert.deepEqual(
    {
      projectRef: result.projectRef,
      url: result.url,
      keyType: result.keyType,
      accountProvisioningEnabled: result.accountProvisioningEnabled,
      accountRecoveryEnabled: result.accountRecoveryEnabled,
      receiptPolicyEffectiveAt: result.receiptPolicyEffectiveAt,
    },
    {
      projectRef: "qazjfofpfcwopcefupjl",
      url: projectUrl,
      keyType: "publishable",
      accountProvisioningEnabled: true,
      accountRecoveryEnabled: false,
      receiptPolicyEffectiveAt: cutoff,
    },
  );
  assert.equal(result.approvedKey, approvedKey);
});

test("rejects the one-character CHG-36 key before build", () => {
  assertConfigRejected(validEnv({ VITE_SUPABASE_ANON_KEY: "s" }));
});

test("rejects empty and truncated keys", () => {
  assertConfigRejected(validEnv({ VITE_SUPABASE_ANON_KEY: "" }));
  assertConfigRejected(validEnv({ VITE_SUPABASE_ANON_KEY: approvedKey.slice(0, -1) }));
});

test("rejects a valid-shaped key from another project by full-value comparison", () => {
  assertConfigRejected(
    validEnv({ VITE_SUPABASE_ANON_KEY: "sb_publishable_zyxwvutsrqponmlkjihgfed_ABCDEFGH" }),
  );
});

test("rejects privileged modern and legacy service-role keys", () => {
  assertConfigRejected(
    validEnv({ VITE_SUPABASE_ANON_KEY: syntheticPrivilegedKey }),
    { type: "secret", api_key: syntheticPrivilegedKey },
  );
  const serviceRoleJwt = `${Buffer.from('{"alg":"HS256"}').toString("base64url")}.${Buffer.from('{"role":"service_role"}').toString("base64url")}.synthetic`;
  assertConfigRejected(validEnv({ VITE_SUPABASE_ANON_KEY: serviceRoleJwt }), {
    type: "legacy",
    api_key: serviceRoleJwt,
  });
});

test("rejects non-approved and local Supabase URLs", () => {
  assertConfigRejected(validEnv({ VITE_SUPABASE_URL: "https://another-project.supabase.co" }));
  assertConfigRejected(validEnv({ VITE_SUPABASE_URL: "http://127.0.0.1:54321" }));
  assertConfigRejected(validEnv({ VITE_SUPABASE_URL: `${projectUrl}/rest/v1` }));
});

test("rejects incorrect authentication flags and conflicting fallback environment", () => {
  assertConfigRejected(validEnv({ VITE_ACCOUNT_PROVISIONING_ENABLED: "false" }));
  assertConfigRejected(validEnv({ VITE_ACCOUNT_RECOVERY_ENABLED: "true" }));
  assertConfigRejected(validEnv({ SUPABASE_URL: "https://other-project.supabase.co" }));
});

test("rejects invalid, non-UTC, or unapproved receipt cutoffs", () => {
  assertConfigRejected(validEnv({ VITE_RECEIPT_POLICY_EFFECTIVE_AT: "" }));
  assertConfigRejected(validEnv({ VITE_RECEIPT_POLICY_EFFECTIVE_AT: "2026-02-30T03:30:00.000Z" }));
  assertConfigRejected(validEnv({ VITE_RECEIPT_POLICY_EFFECTIVE_AT: "2026-11-18T03:30:00-04:00" }));
  assertConfigRejected(
    validEnv({ GRACE_APPROVED_RECEIPT_POLICY_EFFECTIVE_AT: "2026-11-18T04:00:00.000Z" }),
  );
});

test("requires the release cutoff to remain in the future at each publication gate", () => {
  const now = Date.parse("2026-11-18T03:00:00.000Z");
  assert.equal(guard.isFutureUtcReceiptCutoff("2026-11-18T04:00:00.000Z", now), true);
  assert.equal(guard.isFutureUtcReceiptCutoff("2026-11-18T03:00:00.000Z", now), false);
  assert.equal(guard.isFutureUtcReceiptCutoff("2026-11-18T02:00:00.000Z", now), false);
  assert.equal(guard.isFutureUtcReceiptCutoff("invalid", now), false);
});

function viteEnvObject(overrides = {}) {
  const env = {
    VITE_SUPABASE_URL: projectUrl,
    VITE_SUPABASE_ANON_KEY: approvedKey,
    VITE_ACCOUNT_PROVISIONING_ENABLED: "true",
    VITE_ACCOUNT_RECOVERY_ENABLED: "false",
    VITE_RECEIPT_POLICY_EFFECTIVE_AT: cutoff,
    ...overrides,
  };
  return `const e={${Object.entries(env)
    .map(([key, value]) => `${key}:\`${value}\``)
    .join(",")}};return e`;
}

test("inspects the emitted Vite env object consumed by the auth client", () => {
  const result = guard.inspectProductionBundleText(viteEnvObject(), {
    url: projectUrl,
    approvedKey,
    accountProvisioningEnabled: true,
    accountRecoveryEnabled: false,
    receiptPolicyEffectiveAt: cutoff,
  });
  assert.equal(result.clientConfigVerified, true);
  assert.equal(result.projectRef, "qazjfofpfcwopcefupjl");
});

test("ignores an unused Supabase SDK localhost default outside the effective Vite client config", () => {
  const result = guard.inspectProductionBundleText(
    `const sdkDefault=\"http://localhost:9999\";${viteEnvObject()}`,
    {
      url: projectUrl,
      approvedKey,
      accountProvisioningEnabled: true,
      accountRecoveryEnabled: false,
      receiptPolicyEffectiveAt: cutoff,
    },
  );
  assert.equal(result.clientConfigVerified, true);
});

test("rejects CHG-36's bundle even if a correct key appears elsewhere", () => {
  const badAuthChunk = viteEnvObject({ VITE_SUPABASE_ANON_KEY: "s" });
  const unrelatedChunk = `const docsText=${JSON.stringify(approvedKey)}`;
  assert.throws(
    () =>
      guard.inspectProductionBundleText(`${unrelatedChunk};${badAuthChunk}`, {
        url: projectUrl,
        approvedKey,
        accountProvisioningEnabled: true,
        accountRecoveryEnabled: false,
        receiptPolicyEffectiveAt: cutoff,
      }),
    /Production bundle rejected/,
  );
});

test("rejects a bundle with a wrong project, local endpoint, privileged key, flag, or cutoff", () => {
  const expected = {
    url: projectUrl,
    approvedKey,
    accountProvisioningEnabled: true,
    accountRecoveryEnabled: false,
    receiptPolicyEffectiveAt: cutoff,
  };
  for (const bundle of [
    viteEnvObject({ VITE_SUPABASE_URL: "https://other-project.supabase.co" }),
    viteEnvObject({ VITE_SUPABASE_URL: "http://localhost:54321" }),
    viteEnvObject({ VITE_SUPABASE_ANON_KEY: syntheticPrivilegedKey }),
    viteEnvObject({ VITE_ACCOUNT_RECOVERY_ENABLED: "true" }),
    viteEnvObject({ VITE_RECEIPT_POLICY_EFFECTIVE_AT: "2026-11-18T04:00:00.000Z" }),
  ]) {
    assert.throws(
      () => guard.inspectProductionBundleText(bundle, expected),
      /Production bundle rejected/,
    );
  }
});

test("rejects bundles where the client config is missing or repeated env values conflict", () => {
  const expected = {
    url: projectUrl,
    approvedKey,
    accountProvisioningEnabled: true,
    accountRecoveryEnabled: false,
    receiptPolicyEffectiveAt: cutoff,
  };
  assert.throws(
    () => guard.inspectProductionBundleText("const noClientConfig=1", expected),
    /Production bundle rejected/,
  );
  assert.throws(
    () =>
      guard.inspectProductionBundleText(
        `${viteEnvObject()};${viteEnvObject({ VITE_SUPABASE_URL: "https://other-project.supabase.co" })}`,
        expected,
      ),
    /Production bundle rejected/,
  );
});

test("selects one active public key from synthetic Supabase CLI JSON without exposing other keys", () => {
  const chosen = guard.selectApprovedPublicKey([
    { type: "publishable", name: "inactive", disabled: true, api_key: "invalid" },
    { type: "publishable", name: "active", api_key: approvedKey },
    { type: "secret", name: "secret", api_key: ["sb", "secret", "synthetic", "private"].join("_") },
  ]);
  assert.deepEqual(chosen, { type: "publishable", api_key: approvedKey });
  assert.throws(
    () =>
      guard.selectApprovedPublicKey([
        { type: "publishable", api_key: approvedKey },
        { type: "publishable", api_key: approvedKey },
      ]),
    /Production build configuration rejected/,
  );
});

test("compiled browser runtime comparison checks the exact client key and project", () => {
  assert.equal(
    guard.validateCompiledBrowserRuntimeConfig(
      { url: projectUrl, key: approvedKey },
      {
        url: projectUrl,
        approvedKey,
      },
    ),
    true,
  );
  assert.throws(
    () =>
      guard.validateCompiledBrowserRuntimeConfig(
        { url: projectUrl, key: "s" },
        {
          url: projectUrl,
          approvedKey,
        },
      ),
    /Production bundle rejected/,
  );
});

test("rejects privileged credentials in any public browser text asset", () => {
  assert.equal(guard.inspectNoPrivilegedCredentials("regular css or markup"), true);
  assert.throws(
    () => guard.inspectNoPrivilegedCredentials(syntheticPrivilegedKey),
    /Production bundle rejected/,
  );
  const serviceRoleJwt = `${Buffer.from('{"alg":"HS256"}').toString("base64url")}.${Buffer.from('{"role":"service_role"}').toString("base64url")}.synthetic`;
  assert.throws(
    () => guard.inspectNoPrivilegedCredentials(serviceRoleJwt),
    /Production bundle rejected/,
  );
});
