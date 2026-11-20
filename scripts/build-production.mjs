import { spawnSync } from "node:child_process";
import { getApprovedPublicKey, validateProductionConfig } from "./production-build-guard.mjs";
import { resolveReceiptPolicyRelease } from "./receipt-policy-release.mjs";

const allowedArgs = new Set(["--activate-receipt-policy"]);
const args = process.argv.slice(2);
if (args.some((argument) => !allowedArgs.has(argument)) || args.length > 1) {
  console.error(
    "Usage: npm run build:production [-- --activate-receipt-policy] (cutoff is versioned; arbitrary timestamp arguments are rejected)",
  );
  process.exit(2);
}

let key;
let env;
try {
  const activate = args.includes("--activate-receipt-policy");
  const release = resolveReceiptPolicyRelease({ activate });
  key = getApprovedPublicKey();
  const inherited = process.env;
  env = {
    ...inherited,
    VITE_SUPABASE_URL: inherited.VITE_SUPABASE_URL ?? "https://qazjfofpfcwopcefupjl.supabase.co",
    VITE_SUPABASE_ANON_KEY: inherited.VITE_SUPABASE_ANON_KEY ?? key.api_key,
    VITE_ACCOUNT_PROVISIONING_ENABLED: inherited.VITE_ACCOUNT_PROVISIONING_ENABLED ?? "true",
    VITE_ACCOUNT_RECOVERY_ENABLED: inherited.VITE_ACCOUNT_RECOVERY_ENABLED ?? "false",
    VITE_RECEIPT_POLICY_EFFECTIVE_AT:
      inherited.VITE_RECEIPT_POLICY_EFFECTIVE_AT ?? release.effectiveAt,
    GRACE_ACTIVATE_RECEIPT_POLICY: activate ? "true" : "false",
    GRACE_RECEIPT_POLICY_RELEASE_MODE: release.mode,
  };
  const config = validateProductionConfig(env, key);
  if (config.receiptPolicyEffectiveAt !== release.effectiveAt) {
    throw new Error("Production build cutoff differs from the versioned receipt-policy release.");
  }
  console.log(
    `Validated ${release.mode} receipt-policy release for ${config.projectRef}; cutoff remains ${release.effectiveAt}.`,
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
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`
    .replaceAll(key.api_key, "[APPROVED PUBLIC KEY REDACTED]")
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[JWT REDACTED]");
  process.stdout.write(output);
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
