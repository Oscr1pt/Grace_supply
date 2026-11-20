import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  getApprovedPublicKey,
  isFutureUtcReceiptCutoff,
  validateProductionConfig,
} from "./production-build-guard.mjs";

function option(name) {
  const index = process.argv.indexOf(name);
  if (index >= 0) return process.argv[index + 1];
  return process.argv.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);
}

function run(label, executable, args, env, redactionValues) {
  const result = spawnSync(executable, args, {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
  });
  const redact = (output = "") =>
    redactionValues
      .reduce((value, secret) => (secret ? value.replaceAll(secret, "[REDACTED]") : value), output)
      .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[JWT REDACTED]");
  if (result.stdout) process.stdout.write(redact(result.stdout));
  if (result.stderr) process.stderr.write(redact(result.stderr));
  if (result.error || result.status !== 0) {
    console.error(`Release pipeline stopped at ${label}.`);
    process.exit(result.status ?? 1);
  }
}

const cutoff = option("--receipt-policy-effective-at");
const approvedCutoff = option("--approved-receipt-policy-effective-at");
const publish = process.argv.includes("--publish");
if (!cutoff || cutoff !== approvedCutoff) {
  console.error(
    "Usage: npm run deploy:production -- --receipt-policy-effective-at=<UTC> --approved-receipt-policy-effective-at=<same-UTC> [--publish]",
  );
  process.exit(2);
}

let key;
let env;
try {
  key = getApprovedPublicKey();
  env = {
    ...process.env,
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ?? "https://qazjfofpfcwopcefupjl.supabase.co",
    VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY ?? key.api_key,
    VITE_ACCOUNT_PROVISIONING_ENABLED: process.env.VITE_ACCOUNT_PROVISIONING_ENABLED ?? "true",
    VITE_ACCOUNT_RECOVERY_ENABLED: process.env.VITE_ACCOUNT_RECOVERY_ENABLED ?? "false",
    VITE_RECEIPT_POLICY_EFFECTIVE_AT: cutoff,
    GRACE_APPROVED_RECEIPT_POLICY_EFFECTIVE_AT: approvedCutoff,
  };
  validateProductionConfig(env, key);
  if (!isFutureUtcReceiptCutoff(cutoff))
    throw new Error("Receipt cutoff must be future-dated for the release.");
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

run(
  "guarded production build",
  node,
  [
    "scripts/build-production.mjs",
    `--receipt-policy-effective-at=${cutoff}`,
    `--approved-receipt-policy-effective-at=${approvedCutoff}`,
  ],
  env,
  redactions,
);

run(
  "configuration and receipt unit tests",
  node,
  ["--test", "tests/production-build-guard.test.mjs", "tests/receipt-policy.test.mjs"],
  env,
  redactions,
);

run(
  "compiled auth configuration probe",
  node,
  ["scripts/test-production-build-auth.mjs"],
  env,
  redactions,
);

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
run(
  "Wrangler dry-run",
  node,
  [wranglerCli, "deploy", "--dry-run", "--config", emittedConfigPath],
  env,
  redactions,
);
if (!publish) {
  console.log(
    "Preflight complete. No deployment was performed; add --publish only under an explicit release authorization.",
  );
  process.exit(0);
}
if (!isFutureUtcReceiptCutoff(cutoff)) {
  console.error("Release pipeline stopped: the receipt-policy cutoff expired before publication.");
  process.exit(1);
}
run(
  "authorized Cloudflare publication",
  node,
  [wranglerCli, "deploy", "--config", emittedConfigPath],
  env,
  redactions,
);
