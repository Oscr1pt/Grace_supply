import { spawnSync } from "node:child_process";
import {
  getApprovedPublicKey,
  isFutureUtcReceiptCutoff,
  validateProductionConfig,
} from "./production-build-guard.mjs";

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  if (index >= 0) return process.argv[index + 1];
  const pair = process.argv.find((argument) => argument.startsWith(`${name}=`));
  return pair?.slice(name.length + 1);
}

function reportOutput(output, key) {
  const redacted = output
    .replaceAll(key, "[APPROVED PUBLIC KEY REDACTED]")
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[JWT REDACTED]");
  if (redacted) process.stdout.write(redacted);
}

const cutoff = argumentValue("--receipt-policy-effective-at");
const approvedCutoff = argumentValue("--approved-receipt-policy-effective-at");
if (!cutoff || cutoff !== approvedCutoff) {
  console.error(
    "Usage: npm run build:production -- --receipt-policy-effective-at=<UTC> --approved-receipt-policy-effective-at=<same-UTC>",
  );
  process.exit(2);
}

let key;
let env;
try {
  key = getApprovedPublicKey();
  const inherited = process.env;
  const explicit = {
    ...inherited,
    VITE_SUPABASE_URL: inherited.VITE_SUPABASE_URL ?? "https://qazjfofpfcwopcefupjl.supabase.co",
    VITE_SUPABASE_ANON_KEY: inherited.VITE_SUPABASE_ANON_KEY ?? key.api_key,
    VITE_ACCOUNT_PROVISIONING_ENABLED: inherited.VITE_ACCOUNT_PROVISIONING_ENABLED ?? "true",
    VITE_ACCOUNT_RECOVERY_ENABLED: inherited.VITE_ACCOUNT_RECOVERY_ENABLED ?? "false",
    VITE_RECEIPT_POLICY_EFFECTIVE_AT: cutoff,
    GRACE_APPROVED_RECEIPT_POLICY_EFFECTIVE_AT: approvedCutoff,
  };
  const config = validateProductionConfig(explicit, key);
  if (!isFutureUtcReceiptCutoff(cutoff)) {
    throw new Error(
      "Production build configuration rejected: receipt-policy cutoff must be in the future for a new release.",
    );
  }
  env = { ...explicit };
  console.log(
    `Validated release configuration for ${config.projectRef}; effective cutoff ${cutoff}.`,
  );
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const npmCli = process.env.npm_execpath;
if (!npmCli) {
  console.error("Production build must be invoked by npm so lifecycle guards run.");
  process.exit(1);
}
const result = spawnSync(process.execPath, [npmCli, "run", "build"], {
  cwd: process.cwd(),
  env,
  encoding: "utf8",
  windowsHide: true,
  maxBuffer: 32 * 1024 * 1024,
});
if (result.error) {
  console.error("Production build could not start.");
  process.exit(1);
}
if (result.status !== 0) {
  reportOutput(result.stdout ?? "", key.api_key);
  reportOutput(result.stderr ?? "", key.api_key);
  process.exit(result.status ?? 1);
}
const summary = `${result.stdout ?? ""}\n${result.stderr ?? ""}`
  .replaceAll(key.api_key, "[APPROVED PUBLIC KEY REDACTED]")
  .split(/\r?\n/)
  .filter(
    (line) =>
      /^> (prebuild|build|postbuild)$/.test(line) ||
      /^Production (build preflight|bundle verified)/.test(line) ||
      /^✓ built in/.test(line) ||
      /^\[nitro\]/.test(line),
  );
console.log(summary.join("\n") || "Production build completed and its bundle passed verification.");
const warningCount = ((result.stderr ?? "").match(/\bWARN\b/g) ?? []).length;
if (warningCount)
  console.log(`Build emitted ${warningCount} bundler warning(s); none affected the build gate.`);
