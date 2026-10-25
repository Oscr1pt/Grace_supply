# Design

## Context

See `proposal.md` for motivation. At the audit baseline (2026-10-22), `package-lock.json` resolves React 19.2.8, TanStack Start 1.168.42, TanStack React Router 1.170.25, router plugin 1.168.29, Vite 7.3.6, Cloudflare Vite plugin 1.51.1, Wrangler 4.120.0, and the exact Nitro prerelease 3.0.260603-beta. `package.json` and `package-lock.json` already contain user work; inspect diffs before updating either. `bun.lock` exists, but no `packageManager` field is set and the documented scripts use npm; establish whether it is an active install path before changing it.

The full audit reports 19 vulnerable packages (6 critical, 9 high, 4 moderate); production-only reports 16 (5 critical, 7 high, 4 moderate). A dry-run `npm audit fix` fails safely with ERESOLVE because the resolver selects TanStack Start 1.169.4, whose peer requires Vite >=8, while the project currently has Vite 7.3.6. No files were changed by the dry run.

### Baseline findings and candidate patched lines

| Package(s) | Installed version(s) | Severity / advisory | Candidate remediation |
|---|---|---|---|
| `@tanstack/react-start` | 1.168.42 | Critical; GHSA-qx66-fv34-fjm8, unauthenticated reflected XSS | Patched since 1.168.60; coordinate at 1.169.4 with Vite 8. |
| `@tanstack/react-start-rsc` | 0.1.41 | Critical, transitive Start server-function chain | At least 0.1.59; latest 0.1.65 through Start. |
| `@tanstack/react-start-server` | 1.167.30 | Critical, transitive Start server-function chain | At least 1.167.46; latest 1.167.52 through Start. |
| `@tanstack/start-plugin-core` | 1.171.33 | Critical, transitive Start server-function chain | At least 1.171.49; latest 1.171.55 through Start. |
| `@tanstack/start-server-core` | 1.169.25 | Critical; GHSA-qx66-fv34-fjm8 | At least 1.169.39; latest 1.169.45 through Start. |
| `@cloudflare/vite-plugin` | 1.51.1 | Moderate via affected Miniflare/Wrangler | Candidate 1.64.0; peers support Vite 8 and Wrangler 4.151+. |
| `nitro` | 3.0.260603-beta | Moderate; vulnerable `env-runner` path | npm recommends 3.0.260903-beta; exact pin and prerelease dependency churn require build/regression validation. |
| `vite` | 7.3.6 | High; Vite/launch-editor issues | Candidate 8.3.5; requires coordinated TanStack Start 1.169.4. |
| `wrangler` | 4.120.0 | Moderate via Miniflare | Cloudflare plugin candidate brings >=4.151; registry latest observed 4.152.0. |
| `miniflare` | 5.20260801.1-alpha; nested 4.20260730.0 | High; affected ranges include both versions | Resolve through patched Cloudflare/Nitro dependency graph; never force an incompatible override. |
| `env-runner` | 0.1.16 | Moderate via Nitro | Nitro 3.0.260903-beta uses 0.2.x; registry latest observed 0.3.7. |
| `undici` | 7.28.0 and 7.29.0 | High; multiple HTTP, cache, cookie, TLS and DoS advisories | Keep major 7 and resolve to >=7.30.0 (registry latest observed 7.30.1) unless supported parent range requires otherwise. |
| `sharp` | 0.35.2 | High; libheif/librsvg advisories | Resolve to stable >=0.35.5 through compatible parent graph. |
| `seroval` | 1.6.2 | High; typed-array memory exhaustion | >=1.6.3; latest observed 1.7.0 if compatible. |
| `source-map-js` | 1.2.1 | High; indexed-section event-loop DoS | 1.2.2. |
| `js-yaml` | 4.3.1 | High; empty merge-source CPU use | 4.3.2, staying on major 4. |
| `brace-expansion` | 1.1.18 and 5.0.9 | High; quadratic expansion and recursive stack exhaustion | 1.1.21 and 5.0.12. |
| `launch-editor` | 2.14.1 | High; Windows command argument/path checks | 2.14.2. |
| `shell-quote` | 1.10.0 | Critical, development dependency; command injection in `quote()` | Resolve to a patched 1.x release (registry latest observed 1.12.0). |

Audit metadata and compatible parent constraints are authoritative for the exact lock resolution; transitive candidates above must be verified in the regenerated lock and final audits, not assumed from the latest package version alone. The published TanStack advisory lists patched versions and impact at [GHSA-qx66-fv34-fjm8](https://github.com/TanStack/router/security/advisories/GHSA-qx66-fv34-fjm8). Current registry peer metadata reports Start 1.169.4 supports React 18/19 and requires Vite >=8; Cloudflare Vite plugin 1.64.0 supports Vite 6/7/8 and Wrangler 4.151+; the project config package accepts Vite <9. Nitro's 3.0.260903-beta release calls out major dependency upgrades and security hardening, so it is treated as a compatibility-sensitive prerelease update, not a trivial patch.

## Goals / Non-Goals

**Goals:** eliminate critical/high advisories where patched compatible releases exist, also resolve moderate findings without hiding them, keep package manager metadata reproducible, and prove the existing app/build/Worker/Supabase-local flows still work.

**Non-Goals:** changing application behavior, auth/RLS/business rules, SQL migrations, Supabase Cloud configuration, Edge Function source, lockfile-manager migration, or removing dependencies/features to reduce audit counts.

## Decisions

- Upgrade TanStack Start, Router, router plugin, Vite, and Cloudflare plugin as a coordinated set. Choosing only the minimum TanStack backport leaves Vite 7 compatible, but resolver-selected latest Start requires Vite 8 and currently makes standard npm audit remediation fail with ERESOLVE. The installed `@lovable.dev/vite-tanstack-config` accepts Vite <9; React 19 peers are supported. Validate actual Worker build and browser tests before accepting.
- Update pinned Nitro to the npm-recommended 3.0.260903-beta after reviewing its release and confirming local build/test compatibility. Published Lovable config versions, including latest 2.26.7, declare optional peer `nitro: ">=3.0.260603-beta"`; npm semver excludes the later date-stamped prerelease. The project actively uses this package for Start/Vite/Cloudflare setup, so removing it would change runtime/build behavior. Vendor the locked 2.7.7 package and broaden only this peer to `>=3.0.260603-beta || >=3.0.260903-beta`; its runtime files remain byte-identical to the published copy. The patched range is justified by registry metadata plus successful Cloudflare/Nitro build and browser regression. Regenerate with ordinary npm install, then require clean `npm ls` and `npm ci --dry-run`; do not use `--force`, `--legacy-peer-deps`, or dependency overrides.
- Prefer parent-package updates for vulnerable transitive dependencies. Use a targeted npm override only if a patched version is semver/API compatible, no patched parent release resolves it, and install/build/local tests verify the override. Keep `js-yaml` on v4 and `undici` on v7 where the parent ranges allow.
- Keep `package-lock.json` as the npm release lockfile because project scripts and required audits use npm. Change `bun.lock` only if repository configuration or CI confirms Bun is an active supported install route; otherwise document the single supported lockfile for this release.
- No database access is needed. Local Supabase test scripts must positively validate loopback, and no Cloud target, migration, or remote Edge deployment is permitted.

## Risks / Trade-offs

- [Vite 8 or TanStack upgrades change SSR/router behavior] → upgrade together, retain React 19, run TypeScript/build/route generation and browser workflows.
- [Nitro beta upgrade changes Worker/runtime semantics] → review release notes, inspect resolved tree, run Cloudflare production build and local preview; leave task blocked if the deployed adapter cannot be validated.
- [npm audit resolves newer transitive packages outside a parent range] → never force; prefer compatible graph/overrides only with evidence, and report unresolved findings.
- [A clean audit is mistaken for Cloud validation] → document that results are package-lock and local runtime evidence only; no Cloud database or Function operations occur.

## Migration Plan

1. Capture the current manifest/lock diff and both baseline audit JSON results.
2. Update only affected direct dependency ranges and regenerate npm lock without force; review transitive changes and ensure lock consistency.
3. Run audits, TypeScript, unit tests, local PostgreSQL/Auth integration, browser regression, build, and OpenSpec validation.
4. Roll back only the dependency edits in this Change if compatibility fails; preserve all pre-existing work and leave the Change uncompleted until safe remediation and evidence exist.
