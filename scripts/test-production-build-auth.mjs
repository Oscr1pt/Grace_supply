import { spawnSync } from "node:child_process";
import path from "node:path";
import { getApprovedPublicKey } from "./production-build-guard.mjs";

let key;
try {
  key = getApprovedPublicKey();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const playwrightCli = path.resolve("node_modules/playwright/cli.js");
const result = spawnSync(
  process.execPath,
  [
    playwrightCli,
    "test",
    "--config=playwright.production.config.mjs",
    "tests/browser/production-build-auth-config.spec.mjs",
  ],
  {
    cwd: process.cwd(),
    env: { ...process.env, GRACE_EXPECTED_PUBLIC_KEY: key.api_key },
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
  },
);

const redact = (output) =>
  output
    .replaceAll(key.api_key, "[APPROVED PUBLIC KEY REDACTED]")
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[JWT REDACTED]");
if (result.stdout) process.stdout.write(redact(result.stdout));
if (result.stderr) process.stderr.write(redact(result.stderr));
if (result.error) {
  console.error("Compiled authentication configuration probe could not start.");
  process.exit(1);
}
process.exit(result.status ?? 1);
