# Proposal

## Why

The current dependency tree contains critical and high advisories, including GHSA-qx66-fv34-fjm8 in TanStack Start. Remediate these before Cloud deployment so the deployed frontend/server bundle is built from a reviewed, reproducible dependency graph.

## What Changes

- Classify the current full and production npm audits, installed versions, advisory ranges, patched versions, and runtime exposure.
- Update vulnerable direct dependencies and their affected transitive graph to compatible patched releases, including the coordinated TanStack/Vite/Cloudflare toolchain where required.
- Keep npm manifest and lockfile in sync; do not use force-based bulk upgrades or hide findings by removing features/dependencies.
- Run application, browser, Supabase-local integration, build, type, and OpenSpec regression checks and update the deployment-readiness report with remaining risk.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. This is dependency/toolchain remediation without a change to Grace Supply's runtime behavior or database contract; `skip_specs: true` is intentional.

## Impact

`package.json`, `package-lock.json`, potentially the tracked Bun lockfile if it is an active install path, the Vite/TanStack/Cloudflare/Nitro build toolchain, local browser/integration test runs, and the deployment readiness report. No SQL migrations, Supabase project configuration, Edge Function behavior, or Cloud resources are in scope.
