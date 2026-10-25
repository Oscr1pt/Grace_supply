import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("the private npm package and lockfile identify Grace Supply", () => {
  const manifest = JSON.parse(read("../package.json"));
  const lockfile = JSON.parse(read("../package-lock.json"));

  assert.equal(manifest.name, "grace-supply");
  assert.equal(manifest.private, true);
  assert.equal(lockfile.name, manifest.name);
  assert.equal(lockfile.packages[""].name, manifest.name);
});

test("the small barcode preset uses neutral naming and keeps its physical dimensions", () => {
  const settings = read("../src/lib/settings.ts");

  assert.match(
    settings,
    /key: "compacta",\s+label: "Compacta \(25 × 12 mm\)",\s+widthMm: 25,\s+heightMm: 12/,
  );
  assert.doesNotMatch(settings, /key: "joyeria"/);
});

test("business name and page metadata remain Grace Supply", () => {
  assert.match(read("../src/lib/settings.ts"), /businessName: "GRACE SUPPLY"/);
  assert.match(read("../src/routes/__root.tsx"), /title: "GRACE SUPPLY/);
});

test("the existing local Supabase project id stays pinned to its data-bearing stack", () => {
  assert.match(read("../supabase/config.toml"), /^project_id = "jewel-sales-hub"/m);
});
