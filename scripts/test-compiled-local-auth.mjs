import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";

const stackWorkdir = process.env.GRACE_LOCAL_SUPABASE_WORKDIR;
if (!stackWorkdir) {
  console.error(
    "Set GRACE_LOCAL_SUPABASE_WORKDIR to the dedicated disposable CHG-36 Supabase stack.",
  );
  process.exit(2);
}

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
let statusText;
try {
  statusText = execFileSync(
    npx,
    ["--offline", "--yes", "supabase@2.121.0", "status", "--workdir", stackWorkdir, "-o", "env"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      shell: process.platform === "win32",
    },
  );
} catch {
  console.error("The dedicated local Supabase stack is unavailable.");
  process.exit(2);
}

const values = Object.fromEntries(
  statusText.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^([A-Z_]+)="(.*)"$/);
    return match ? [[match[1], match[2]]] : [];
  }),
);
const url = values.API_URL;
const anonKey = values.ANON_KEY;
const serviceKey = values.SERVICE_ROLE_KEY;
if (
  !url ||
  !anonKey ||
  !serviceKey ||
  !["127.0.0.1", "localhost", "::1"].includes(new URL(url).hostname)
) {
  console.error("Local Supabase status was incomplete or not loopback; refusing to build or test.");
  process.exit(2);
}

const env = {
  ...process.env,
  LOCAL_SUPABASE_URL: url,
  LOCAL_SUPABASE_ANON_KEY: anonKey,
  LOCAL_SUPABASE_SERVICE_ROLE_KEY: serviceKey,
  VITE_SUPABASE_URL: url,
  VITE_SUPABASE_ANON_KEY: anonKey,
  VITE_ACCOUNT_PROVISIONING_ENABLED: "true",
  VITE_ACCOUNT_RECOVERY_ENABLED: "false",
  VITE_RECEIPT_POLICY_EFFECTIVE_AT: "2030-01-01T00:00:00.000Z",
};
delete env.GRACE_APPROVED_RECEIPT_POLICY_EFFECTIVE_AT;
delete env.GRACE_EXPECTED_PUBLIC_KEY;

const viteCli = path.resolve("node_modules/vite/bin/vite.js");
const build = spawnSync(process.execPath, [viteCli, "build", "--mode", "production"], {
  cwd: process.cwd(),
  env,
  encoding: "utf8",
  windowsHide: true,
  maxBuffer: 32 * 1024 * 1024,
});
const redact = (output) =>
  output
    .replaceAll(anonKey, "[LOCAL PUBLIC KEY REDACTED]")
    .replaceAll(serviceKey, "[LOCAL PRIVILEGED KEY REDACTED]")
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[JWT REDACTED]");
if (build.status !== 0) {
  if (build.stdout) process.stdout.write(redact(build.stdout));
  if (build.stderr) process.stderr.write(redact(build.stderr));
  console.error("Local-config production-mode build failed.");
  process.exit(build.status ?? 1);
}
console.log(
  "Built production-mode browser/Worker artifacts against the isolated local Supabase stack (not a production artifact).",
);

const playwrightCli = path.resolve("node_modules/playwright/cli.js");
const test = spawnSync(
  process.execPath,
  [
    playwrightCli,
    "test",
    "--config=playwright.compiled-local-auth.config.mjs",
    "tests/browser/compiled-local-auth.spec.mjs",
  ],
  {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
  },
);
if (test.stdout) process.stdout.write(redact(test.stdout));
if (test.stderr) process.stderr.write(redact(test.stderr));
if (test.error) {
  console.error("Compiled local authentication test could not start.");
  process.exit(1);
}
process.exit(test.status ?? 1);
