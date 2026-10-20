# Grace Supply — Database Remediation Roadmap

**Branch:** `feature/database-remediation`
**Scope:** Supabase/PostgreSQL security, data integrity, transactions and audit logging.
**Status:** Proposed; not implemented.
**Exclusions:** DGII/e-CF integration, UI redesign, dependency upgrades (CHG-02), browser-session cleanup (CHG-09).

## Ground rules
- One OpenSpec change at a time for implementation; maximum **3 top-level tasks per change**.
- Each change needs proposal, design, delta specifications, tasks and acceptance criteria.
- Use staging and synthetic data. No production SQL, migration or credential disclosure as part of proposal creation.
- CHG-04 and CHG-05 **must have a coordinated cutover**; do not deploy insecure interim authorization.
- Treat the earlier confirmed anonymous access and password exposure as urgent until verified contained.
- Deployment requires an approved backup/restore plan and human authorization.

## Changes

### CHG-00 — `chg-00-containment-backups-staging` (Critical; findings 1, 2, 3)
1. Verify current exposure and document urgent containment without accessing private customer/password data.
2. Establish staging, backup and recovery verification, and credential-rotation plan.
3. Define safe cutover, rollback, owner approval and exit criteria.

**Acceptance:** anonymous access to sensitive tables is contained, recoverability tested, risks documented.

### CHG-01 — `chg-01-durable-persistence-errors` (Critical; finding 7)
1. Define consistent verified persistence contract for Supabase writes, including errors and affected row checks.
2. Correct false success and silent fallback in storage, settings, sales and employee workflows.
3. Test denied RLS, failed writes, disconnects, and no phantom confirmation.

**Acceptance:** user-visible success only after confirmed persistence.

### CHG-03 — `chg-03-versioned-schema-migrations` (High; findings 8, 9)
1. Compare deployed schema with TypeScript types and app queries; inventory missing tables/columns and incompatible IDs.
2. Design versioned migrations and replace unsafe proposed policies; coordinate future permissions with CHG-05.
3. Verify clean install and data migration on staging, including rollback/backfill.

**Acceptance:** schema reproducible without permissive public policies or data loss.

### CHG-04 — `chg-04-auth-identity-migration` (Critical; findings 2, 3, 12)
1. Plan Supabase Auth account migration, forced password reset and legacy-secret invalidation.
2. Design verified identity/session handling and privileged account administration; remove plaintext password comparisons and self-admin registration.
3. Test sessions, admin bootstrap, revocation, and coordinated cutover with CHG-05.

**Acceptance:** secrets are not stored in public user records and roles cannot be forged in the browser.

### CHG-05 — `chg-05-rls-least-privilege` (Critical; findings 1, 3, 9)
1. Specify row/operation privilege matrix for anonymous, employee, admin and revoked users.
2. Design RLS policies and minimal grants for tables and RPC/functions; prohibit blanket `USING (true)`.
3. Test direct REST/RPC access across roles; deploy in coordination with CHG-04.

**Acceptance:** unauthenticated access denied; least privilege enforced on database, not just frontend.

### CHG-06 — `chg-06-db-integrity-constraints` (High; finding 6)
1. Model relational references, payment-credit relationship and compatible identifiers/decimal amounts.
2. Plan CHECK, FK, UNIQUE and workload-justified indexes, with existing-data remediation.
3. Test invalid amounts, negative stock, orphan references, duplicate numbers and migration compatibility.

**Acceptance:** invalid financial/inventory states rejected by PostgreSQL.

### CHG-07 — `chg-07-atomic-business-operations` (High; findings 5, 6)
1. Design server/RPC operation contracts and authorization for sales, purchases, credits, payments and inventory updates.
2. Plan atomic writes, concurrency control, server-side financial calculation and idempotency.
3. Test parallel last-item sales, retries, insufficient stock, partial failure, and balanced credits.

**Acceptance:** no partial operations, overselling or duplicate payments.

### CHG-08 — `chg-08-financial-audit-annulment` (High; finding 10)
1. Design immutable restricted audit records with verified actor `auth.uid()` and timestamps.
2. Replace destructive deletion of financial documents with controlled void/compensating entries.
3. Test audit authorization, actor integrity, stock/saldo reconciliation and historical preservation.

**Acceptance:** full traceability and no silent loss of financial evidence.

## Dependency order

```text
CHG-00
  +--> CHG-01
  +--> CHG-03 --> CHG-06 --> CHG-07 --> CHG-08
  +--> CHG-04 <--> CHG-05 [coordinated security cutover]
                       +--> CHG-07
```

CHG-04/05 require a shared rollout plan and staging verification rather than two independent deploys.

## Out of scope here
- CHG-02 vulnerable dependencies/lockfiles
- CHG-09 browser cache and cross-user data retention
- Production-readiness visual and comprehensive Phase 3 QA work (though each change has targeted checks)
- Fiscal invoice/DGII/e-CF integration; receipts are internal only

## Next step
Create the eight corresponding proposals using the repository's `openspec-propose` workflow and CLI scaffold on `feature/database-remediation`. Generate `proposal.md`, `design.md`, delta `specs/` and `tasks.md` for each; validate with `openspec validate`. Proposal creation must never execute migrations or implement code.
