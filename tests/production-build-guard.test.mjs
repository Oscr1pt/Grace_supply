import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

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
  assert.equal(typeof guard.verifyProductionBundle, "function");
});

const projectUrl = "https://qazjfofpfcwopcefupjl.supabase.co";
const approvedKey = "sb_publishable_abcdefghijklmnopqrstuv_ABCDEFGH";
const syntheticPrivilegedKey = ["sb", "secret", "abcdefghijklmnopqrstuv", "ABCDEFGH"].join("_");
const cutoff = "2026-11-18T03:18:00.000Z";

function validEnv(overrides = {}) {
  return {
    VITE_SUPABASE_URL: projectUrl,
    VITE_SUPABASE_ANON_KEY: approvedKey,
    VITE_ACCOUNT_PROVISIONING_ENABLED: "true",
    VITE_ACCOUNT_RECOVERY_ENABLED: "false",
    VITE_RECEIPT_POLICY_EFFECTIVE_AT: cutoff,
    ...overrides,
  };
}

function assertConfigRejected(env, trustedKey = { type: "publishable", api_key: approvedKey }) {
  assert.throws(
    () => guard.validateProductionConfig(env, trustedKey),
    /Production build configuration rejected/,
  );
}

function writePinnedSupabaseCliFixture(
  root,
  { reportedVersion = "2.121.0", hangOnKeys = false } = {},
) {
  const platform =
    process.platform === "win32"
      ? "windows"
      : process.platform === "darwin"
        ? "darwin"
        : process.platform === "linux"
          ? "linux"
          : null;
  assert.ok(platform, `unsupported fixture platform: ${process.platform}`);
  const platformPackage = `@supabase/cli-${platform}-${process.arch}`;
  const platformRelativePath = `node_modules/${platformPackage}`;
  const packagePath = path.join(root, "node_modules", "supabase");
  const platformPath = path.join(root, ...platformRelativePath.split("/"));
  const resolvedPackage = "https://registry.npmjs.org/supabase/-/supabase-2.121.0.tgz";
  const resolvedPlatform = `https://registry.npmjs.org/${platformPackage}/-/cli-${platform}-${process.arch}-2.121.0.tgz`;
  const integrity = `sha512-${Buffer.from("synthetic-test-integrity").toString("base64")}`;

  writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ devDependencies: { supabase: "2.121.0" } }),
  );
  mkdirSync(path.join(packagePath, "dist"), { recursive: true });
  mkdirSync(platformPath, { recursive: true });
  writeFileSync(
    path.join(packagePath, "package.json"),
    JSON.stringify({
      name: "supabase",
      version: "2.121.0",
      optionalDependencies: { [platformPackage]: "2.121.0" },
    }),
  );
  writeFileSync(
    path.join(platformPath, "package.json"),
    JSON.stringify({ name: platformPackage, version: "2.121.0" }),
  );
  writeFileSync(
    path.join(root, "package-lock.json"),
    JSON.stringify({
      lockfileVersion: 3,
      packages: {
        "": { devDependencies: { supabase: "2.121.0" } },
        "node_modules/supabase": {
          version: "2.121.0",
          resolved: resolvedPackage,
          integrity,
          optionalDependencies: { [platformPackage]: "2.121.0" },
        },
        [platformRelativePath]: {
          version: "2.121.0",
          resolved: resolvedPlatform,
          integrity,
          optional: true,
        },
      },
    }),
  );
  const apiKey = "sb_publishable_abcdefghijklmnopqrstuv_ABCDEFGH";
  writeFileSync(
    path.join(packagePath, "dist", "supabase.js"),
    `if (process.argv.includes("--version")) { console.log(${JSON.stringify(reportedVersion)}); } else if (${hangOnKeys}) { setInterval(() => {}, 1000); } else { console.log(JSON.stringify([{ type: "publishable", api_key: ${JSON.stringify(apiKey)} }])); }`,
  );
  return apiKey;
}

test("approved public key lookup uses the local lockfile-pinned CLI without npm exec", () => {
  const root = mkdtempSync(path.join(tmpdir(), "grace-pinned-supabase-cli-"));
  const apiKey = writePinnedSupabaseCliFixture(root);
  const previousNpmExecPath = process.env.npm_execpath;
  delete process.env.npm_execpath;
  try {
    assert.deepEqual(guard.getApprovedPublicKey({ cwd: root, timeoutMs: 2_000 }), {
      type: "publishable",
      api_key: apiKey,
    });
  } finally {
    if (previousNpmExecPath === undefined) delete process.env.npm_execpath;
    else process.env.npm_execpath = previousNpmExecPath;
    rmSync(root, { recursive: true, force: true });
  }
});

test("approved public key lookup rejects a CLI version different from the pin", () => {
  const root = mkdtempSync(path.join(tmpdir(), "grace-pinned-supabase-cli-"));
  writePinnedSupabaseCliFixture(root, { reportedVersion: "2.122.0" });
  try {
    assert.throws(
      () => guard.getApprovedPublicKey({ cwd: root, timeoutMs: 2_000 }),
      /pinned Supabase CLI version/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("approved public key lookup stops a stalled CLI subprocess within its timeout", () => {
  const root = mkdtempSync(path.join(tmpdir(), "grace-pinned-supabase-cli-"));
  writePinnedSupabaseCliFixture(root, { hangOnKeys: true });
  try {
    assert.throws(
      () => guard.getApprovedPublicKey({ cwd: root, timeoutMs: 100 }),
      /timed out after 100 ms/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("accepts only the approved project URL, full active publishable key, flags, and UTC cutoff", () => {
  assert.ok(
    Date.parse(cutoff) < Date.now(),
    "the approved cutoff is historical and still valid for later releases",
  );
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
  assertConfigRejected(validEnv({ VITE_SUPABASE_ANON_KEY: syntheticPrivilegedKey }), {
    type: "secret",
    api_key: syntheticPrivilegedKey,
  });
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
    validEnv({
      VITE_RECEIPT_POLICY_EFFECTIVE_AT: "2026-11-19T03:18:00.000Z",
      GRACE_APPROVED_RECEIPT_POLICY_EFFECTIVE_AT: "2026-11-19T03:18:00.000Z",
    }),
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

test("production bundle verification finds the effective auth client by its compiled config, not a filename", () => {
  const root = mkdtempSync(path.join(tmpdir(), "grace-production-auth-chunk-"));
  const assets = path.join(root, "public", "assets");
  mkdirSync(assets, { recursive: true });
  writeFileSync(path.join(assets, "index--compiled.js"), viteEnvObject(), "utf8");
  writeFileSync(path.join(assets, "app--other.js"), "const unrelated = true;", "utf8");
  try {
    const result = guard.verifyProductionBundle(root, {
      url: projectUrl,
      approvedKey,
      accountProvisioningEnabled: true,
      accountRecoveryEnabled: false,
      receiptPolicyEffectiveAt: cutoff,
    });
    assert.equal(result.authChunk, "index--compiled.js");
    assert.equal(result.clientConfigVerified, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("production bundle verification rejects ambiguous effective auth client chunks", () => {
  const root = mkdtempSync(path.join(tmpdir(), "grace-production-auth-chunk-"));
  const assets = path.join(root, "public", "assets");
  mkdirSync(assets, { recursive: true });
  writeFileSync(path.join(assets, "client-a.js"), viteEnvObject(), "utf8");
  writeFileSync(path.join(assets, "client-b.js"), viteEnvObject(), "utf8");
  try {
    assert.throws(
      () =>
        guard.verifyProductionBundle(root, {
          url: projectUrl,
          approvedKey,
          accountProvisioningEnabled: true,
          accountRecoveryEnabled: false,
          receiptPolicyEffectiveAt: cutoff,
        }),
      /exactly one effective Supabase client chunk/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
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
