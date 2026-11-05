# Design

## Context

The archived CHG-25 migration already owns tax calculations, snapshots, idempotency, and internal receipts. The current UI adds a separate approval interaction, while several source files contain UTF-8 mojibake. This change must layer a simpler V1 save path without editing archived artifacts or changing Cloud.

## Goals / Non-Goals

**Goals:**

- Establish one settings save flow for the supported disabled/18% modes.
- Keep PostgreSQL authoritative and preserve authorization, audit, inventory, and historical invariants.
- Correct user-facing Spanish source text and add regression coverage.

**Non-Goals:**

- No NCF, e-CF, DGII integration, tax-law certification, or Cloud migration.
- No rewrite of historical database text or archived CHG-25 artifacts.
- No arbitrary tax rates or direct client-side financial writes.

## Decisions

1. **Explicit supported modes.** The server accepts only disabled mode or enabled 18% mode; arbitrary rates fail validation. This avoids silently inventing tax behavior.
2. **Single authorized settings mutation.** Reuse the existing settings persistence boundary where possible and add a forward-only RPC/migration only if the current contract cannot atomically record the supported mode and audit actor. The UI no longer calls a second approval action.
3. **Fail-closed posting.** `sales_posting_status` and `post_sale` share the same effective-mode predicate. Pending or malformed configuration cannot post; disabled mode is valid when the saved policy is internally coherent.
4. **Targeted encoding repair.** Replace confirmed mojibake literals in source, tests, and templates with UTF-8 text; do not run a blind byte substitution over data or generated files.
5. **Evidence first.** Add unit, PostgreSQL/Auth/RLS, and browser checks before marking tasks complete. All writes use a disposable local stack.

## Risks / Trade-offs

- [Risk] Existing Cloud schemas may not contain the incremental settings contract → Mitigation: test migrations locally only and document Cloud rollout as a separate authorized step.
- [Risk] Removing visible approval controls could hide the commercial gate → Mitigation: retain server authorization/audit and clearly label the feature as operational V1, not fiscal certification.
- [Risk] Broad copy cleanup could alter intended wording → Mitigation: limit edits to confirmed mojibake and review affected diffs.

## Migration Plan

Use a new forward-only migration only when required by the current database contract. Apply and verify it on a fresh disposable Supabase project; do not run `supabase db push` or modify Cloud. Rollback is by disabling the operational setting and preserving existing sales history.
