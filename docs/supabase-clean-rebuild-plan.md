# Grace Supply — Clean Supabase Cloud Rebuild (Approved Direction)

**Date:** 2026-10-21  
**Repository:** `Oscr1pt/Grace_supply`  
**Working branch:** `feature/database-remediation`  
**Status:** Architectural direction approved by project owner; implementation and any destructive database action remain separate decisions.

## Decision

Grace Supply is still in development, has not been deployed to a public domain, has not been delivered to the business, and its existing database contains only disposable test records.

**Create a NEW independent Supabase Cloud project for development** (suggested name: `grace-supply-dev-v2`) and build the database **from a reviewed, clean, version-controlled schema**. Keep the legacy Supabase project `ooytnnqxlxxgyenrutky` temporarily as a restricted reference. Do not copy its insecure schema, grants, RLS policies, passwords, test users, or commercial records into the new project.

The new project reference is **UNKNOWN** until the user creates the project and confirms its ID from the Supabase Dashboard. **NEVER use `ooytnnqxlxxgyenrutky` as the new target.**

## Safety and scope

- **Do not execute changes in the old Supabase project** during the rebuild unless the user separately authorizes its containment or shutdown. The legacy project still represents a potentially exposed API because its six business tables had RLS disabled. The fact that the website is local does not make Supabase Cloud local.
- Do not delete either project, run remote resets or `DROP`/`TRUNCATE` against the old database, or rotate Auth users automatically.
- Do not use the `supabase-grace-dev-write` MCP server for the new project: it remains scoped to the **old project ref**. Configure a distinct project-scoped MCP server once the new project is created and its ref has been confirmed.
- Never commit API secrets, database connection passwords, privileged keys, personal data, or backups to this **public GitHub repository**. New application keys belong in environment variables and privileged secrets only on trusted servers.
- Do not replay `supabase_migration.sql`, `supabase_migration_expenses.sql`, or an older CHG-00 containment migration blindly. Inspect each migration and assemble an ordered clean baseline for the NEW project. Old test-data backfills and mappings are not needed.
- The user approved the new-project **strategy**, not a specific SQL migration, deleting a database, incurring paid cloud charges, or shipping to production.

## Execution gates and intended workflow

1. **Create and identify the new Cloud project.** The user creates `grace-supply-dev-v2` in their Supabase organization and provides only its new non-secret project ref. Confirm its new dashboard URL, organization and region, and that it is not used by any other app. Leave the old project unchanged.
2. **Reconnect tooling carefully.** Configure `supabase-grace-v2-ro` and optionally `supabase-grace-v2-write` with the **new** project ref only. Verify the project-scoped URL before SQL. Keep old aliases clearly labeled as legacy.
3. **Reconcile OpenSpec planning.** Update existing CHG-00/01/03/04/05/06/07/08 via the OpenSpec update workflow before implementation, keeping **at most three tasks per Change**. Do not overwrite any ongoing local work by Codex. CHG-00 verification 1.1 was reported complete **locally**; this branch may not yet contain that local commit.
4. **Create clean, reproducible schema.** In `supabase/migrations/`, establish a reviewed sequence that builds the current domain model (not legacy jewelry placeholders), PK/FK, monetary constraints, transaction tables and safe initial access. Generate TypeScript types and ensure app queries match. Use synthetic seeds.
5. **Secure identity and access.** Maintain `username + password` in the UI, verify passwords through Supabase Auth on a trusted flow, map username to Auth identity without exposing private email lookups, and configure unique, verified recovery email or approved admin-assisted recovery. Deny anonymous business-data access. Test REST/RPC and role-specific access; preserve coordinated rollout of CHG-04 and CHG-05.
6. **Build and validate financial operations.** Verified persistence, atomic posting, concurrency protection, idempotency, credit payment integrity, non-destructive annulments and audit records, with integration/regression tests.
7. **Only after passing tests:** update the app's environment to point to the NEW project. The current app reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (fallbacks `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`/`SUPABASE_ANON_KEY`) from `src/lib/supabase.ts`. Use only the new project's **public/publishable client key** on the client. Never expose a privileged secret.

Supabase's CLI workflow: `supabase link --project-ref <NEW_REF>`, inspect `supabase db push --dry-run`, then apply reviewed migrations with `supabase db push`. These commands are **illustrative**, not authorization to run them until destination and SQL are reviewed. Running a local full Supabase stack needs Docker; linking/pushing to Supabase Cloud does not require a locally running Docker engine.

## Reassessment of existing Changes

| Change | New-project focus |
| --- | --- |
| **CHG-00** | Document and contain legacy API exposure separately; establish safe project identity, new-project setup, minimal recovery plan and initial secure boundary. Do not block the new project solely on restoring disposable old test records. |
| **CHG-03** | Author a complete **clean baseline migration** and reconstructible seed on the new project. Remove legacy text-ID backfill and historic data migration requirements. |
| **CHG-06** | Define the **target** domain model and constraints from scratch: UUIDs, relationships, typed credits/payments and NUMERIC financial amounts; coordinate closely with CHG-03. |
| **CHG-04 / CHG-05** | Create new Auth identities and secure profile/role linkage; apply least-privilege RLS before business data access; coordinated functional rollout. |
| **CHG-01** | Ensure Supabase errors are checked and no UI falsely reports writes as persisted; sequence before activating authenticated workflows when practical. |
| **CHG-07** | Authorize and test DB-side transactions, stock concurrency, credits and idempotency in the clean environment. |
| **CHG-08** | Financial audit and reversible annulment; no production history migration is needed. |

**Provisional implementation dependency order:** CHG-00 planning/containment -> CHG-03 + CHG-06 model/baseline coordination -> CHG-01 persistence -> CHG-04/05 secure access (joint activation) -> CHG-07 -> CHG-08. Refine with Codex after reviewing actual artifacts. Do not mark a Change complete if its acceptance tests do not pass.

## What remains to be decided

- New Supabase project ref and final region.
- Whether recovery emails are unique and controlled by each employee, or administrative recovery is required.
- Detailed permission matrix, tax/rounding/stock units, financial annulment/reconciliation, and retention rules.
- Production infrastructure, backup coverage, RPO/RTO, and owner acceptance **before delivery**.

## Local handoff precautions

The repository branch on GitHub may lag behind Codex's local filesystem (including CHG-00 1.1 and files like `scripts/chg00-anon-probe.mjs` and the old-project-specific containment migration). **Do not reset, overwrite, rebase or discard local changes simply to fetch this planning document.** Check `git status` and commit or stash work appropriately before integrating remote commits.

This decision document is not an OpenSpec validation result and does not amend the eight existing OpenSpec artifacts on its own. Update and validate them via `openspec-update-change` and `openspec validate` in the user's local Codex environment.
