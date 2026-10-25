# Tasks

## 1. Analysis and classification

- [x] 1.1 Run full and production-only npm audits; map every affected direct/transitive package to installed version, advisory, severity, vulnerable range, fixed version, and runtime exposure in the readiness report.
- [x] 1.2 Verify GHSA-qx66-fv34-fjm8 and evaluate coordinated TanStack, React, Vite, Cloudflare Workers, and Nitro compatibility using official advisory/release/peer metadata; record the approved update path and remaining risk.

## 2. Dependency remediation

- [x] 2.1 Update vulnerable direct dependencies to patched releases, coordinate TanStack/Vite/Cloudflare, pin the reviewed Nitro prerelease, and regenerate `package-lock.json`. Preserve `bun.lock` because Bun is not an active supported installer in project scripts/CI. The final lock was regenerated without `--force`, `--legacy-peer-deps`, or overrides; a local copy of Lovable's config corrects only its peer metadata, as documented alongside the vendored package.
- [x] 2.2 Resolve the Nitro prerelease peer mismatch by retaining the used Lovable config with a narrowly scoped, documented local peer range correction; verify `npm ls` has no invalid dependencies, `npm ci --dry-run --ignore-scripts` succeeds, React 19 peer compatibility holds, and full/production audits have zero findings.

## 3. Regression and verification

- [x] 3.1 Run TypeScript, unit tests, local PostgreSQL/Auth integration, Chromium browser regressions for login/session/permissions/sales/purchases/payments, Edge Function local checks, and production build; verify all Supabase test endpoints are loopback-only. Auth/RLS ran twice at 22/22 and the three repaired cases also passed in reverse order; fixture cleanup was checked locally.
- [x] 3.2 Record exact final versions, unresolved vulnerabilities/exposure, and test results in `docs/deployment-readiness-qazjfofpfcwopcefupjl.md`; validate the Change and active Changes with strict OpenSpec commands, without archiving the Change.
