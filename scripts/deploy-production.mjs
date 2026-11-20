import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { getApprovedPublicKey, validateProductionConfig } from "./production-build-guard.mjs";
import { resolveReceiptPolicyRelease } from "./receipt-policy-release.mjs";

const allowedArgs = new Set(["--activate-receipt-policy", "--publish"]);
const args = process.argv.slice(2);
if (args.some((argument) => !allowedArgs.has(argument)) || new Set(args).size !== args.length) {
  console.error(
    "Usage: npm run deploy:production [-- --activate-receipt-policy] [--publish] (cutoff is versioned; arbitrary timestamp arguments are rejected)",
  );
  process.exit(2);
}

const activate = args.includes("--activate-receipt-policy");
const publish = args.includes("--publish");
let key;
let env;
let release;
try {
  release = resolveReceiptPolicyRelease({ activate });
  key = getApprovedPublicKey();
  env = {
    ...process.env,
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ?? "https://qazjfofpfcwopcefupjl.supabase.co",
    VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY ?? key.api_key,
    VITE_ACCOUNT_PROVISIONING_ENABLED: process.env.VITE_ACCOUNT_PROVISIONING_ENABLED ?? "true",
    VITE_ACCOUNT_RECOVERY_ENABLED: process.env.VITE_ACCOUNT_RECOVERY_ENABLED ?? "false",
    VITE_RECEIPT_POLICY_EFFECTIVE_AT:
      process.env.VITE_RECEIPT_POLICY_EFFECTIVE_AT ?? release.effectiveAt,
    GRACE_ACTIVATE_RECEIPT_POLICY: activate ? "true" : "false",
    GRACE_RECEIPT_POLICY_RELEASE_MODE: release.mode,
  };
  const config = validateProductionConfig(env, key);
  if (config.receiptPolicyEffectiveAt !== release.effectiveAt) {
    throw new Error("Receipt-policy cutoff differs from the versioned release source.");
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const emittedConfigPath = path.resolve(".output/server/wrangler.json");
const npmCli = process.env.npm_execpath;
if (!npmCli) {
  console.error("Release pipeline must be invoked through npm.");
  process.exit(1);
}
const node = process.execPath;
const redactions = [key.api_key];

function run(label, executable, childArgs, childEnv = env) {
  const result = spawnSync(executable, childArgs, {
    cwd: process.cwd(),
    env: childEnv,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
  });
  const redact = (output = "") =>
    redactions
      .reduce((value, secret) => (secret ? value.replaceAll(secret, "[REDACTED]") : value), output)
      .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[JWT REDACTED]");
  if (result.stdout) process.stdout.write(redact(result.stdout));
  if (result.stderr) process.stderr.write(redact(result.stderr));
  if (result.error || result.status !== 0) {
    console.error(`Release pipeline stopped at ${label}.`);
    process.exit(result.status ?? 1);
  }
}

const buildArgs = [
  node,
  ["scripts/build-production.mjs", ...(activate ? ["--activate-receipt-policy"] : [])],
];
run("guarded production build", buildArgs[0], buildArgs[1]);

run("configuration and receipt policy unit tests", node, [
  "--test",
  "tests/production-build-guard.test.mjs",
  "tests/receipt-policy.test.mjs",
  "tests/receipt-policy-release.test.mjs",
]);

run("compiled auth configuration probe", node, ["scripts/test-production-build-auth.mjs"]);

let generated;
try {
  generated = JSON.parse(readFileSync(emittedConfigPath, "utf8"));
} catch {
  console.error(
    "Release pipeline stopped: generated Wrangler configuration is missing or invalid.",
  );
  process.exit(1);
}
if (
  generated.name !== "grace-supply" ||
  !generated.routes?.some(
    (route) => route.pattern === "gracesupply.net" && route.custom_domain === true,
  )
) {
  console.error(
    "Release pipeline stopped: generated Wrangler target is not the approved Worker and domain.",
  );
  process.exit(1);
}

const wranglerCli = path.resolve("node_modules/wrangler/bin/wrangler.js");
run("Wrangler dry-run", node, [wranglerCli, "deploy", "--dry-run", "--config", emittedConfigPath]);
if (!publish) {
  console.log(
    "Preflight complete. No deployment was performed; add --publish only under an explicit release authorization.",
  );
  process.exit(0);
}

try {
  const beforePublication = resolveReceiptPolicyRelease({ activate });
  if (
    beforePublication.effectiveAt !== release.effectiveAt ||
    beforePublication.mode !== release.mode
  ) {
    throw new Error("Receipt-policy release configuration changed during preflight.");
  }
} catch (error) {
  console.error(`Release pipeline stopped before publication: ${error.message}`);
  process.exit(1);
}
run("authorized Cloudflare publication", node, [
  wranglerCli,
  "deploy",
  "--config",
  emittedConfigPath,
]);
