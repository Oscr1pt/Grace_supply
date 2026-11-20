import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("release scripts reject operator-supplied cutoff and approval timestamps", () => {
  for (const script of ["build-production.mjs", "deploy-production.mjs"]) {
    const result = spawnSync(
      process.execPath,
      [
        path.join(root, "scripts", script),
        "--receipt-policy-effective-at=2030-01-01T00:00:00.000Z",
        "--approved-receipt-policy-effective-at=2030-01-01T00:00:00.000Z",
      ],
      { cwd: root, encoding: "utf8", windowsHide: true },
    );
    assert.equal(result.status, 2, script);
    assert.match(result.stderr, /cutoff is versioned/);
    assert.doesNotMatch(result.stdout + result.stderr, /wrangler deploy/);
  }
});

test("explicit publication is downstream of all required preflight gates", () => {
  const source = readFileSync(path.join(root, "scripts", "deploy-production.mjs"), "utf8");
  const requiredStages = [
    'run("guarded production build"',
    '"tests/production-build-guard.test.mjs"',
    'run("compiled auth configuration probe"',
    'run("Wrangler dry-run"',
    "if (!publish)",
    'run("authorized Cloudflare publication"',
  ];
  const positions = requiredStages.map((stage) => source.indexOf(stage));
  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual(
    positions,
    [...positions].sort((a, b) => a - b),
  );
  assert.match(source, /const publish = args\.includes\("--publish"\)/);
});
