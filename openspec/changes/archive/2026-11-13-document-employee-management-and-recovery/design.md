# Design

## Context

The existing canonical capabilities `account-access-usability` and `secure-user-creation-editing` already define account states, administrative authorization, user editing, initial setup, and privacy. CHG-21 and CHG-22 are archived and must remain unchanged. The published employee table and the later recovery hotfix added observable details that were not represented in those canonical contracts.

This follow-up is documentation-only. The implementation and production state are treated as validated inputs; this Change does not deploy, alter data, or change application behavior.

## Goals / Non-Goals

**Goals:**
- Make the canonical specs describe the shipped employee table/search/filter/modal and contextual access actions.
- Record the administrative recovery contract for inactive or Auth-blocked accounts.
- Preserve privacy, server authorization, existing account-state semantics, and separation from public email recovery.
- Keep deployment and test evidence in this Change's historical record.

**Non-Goals:**
- Change source code, migrations, RLS, Edge Functions, secrets, flags, or production data.
- Modify or re-archive CHG-21 or CHG-22.
- Re-run functional or production tests already reported and confirmed by the owner.

## Decisions

1. **Extend the existing capabilities.** Use deltas for `account-access-usability` and `secure-user-creation-editing`, whose purposes already cover access state and employee administration. A new capability would duplicate those contracts.
2. **Modify complete requirement blocks.** Preserve all existing scenarios for role authorization, session revocation, password setup, and persistence reconciliation while adding the missing table and recovery behavior.
3. **Keep configuration conditional in the permanent contract.** Public email recovery is unavailable when its server flag is false; the current production setting is recorded below as historical evidence. Administrative assisted recovery remains a distinct authorized operation.
4. **Keep evidence out of functional requirements.** Versions, deployment IDs, and test counts are release history and appear only in this design record.
5. **Leave historical archives immutable.** CHG-21/CHG-22 remain unchanged; OpenSpec archive will synchronize this follow-up's deltas and archive only this new Change.

Alternatives considered: creating a new employee-management capability (rejected because existing capabilities already own these behaviors) and editing the two historical archives directly (rejected to preserve their provenance).

## Risks / Trade-offs

- **The production public-recovery flag may change later** → the normative spec describes behavior conditional on the flag; the current value is release evidence only.
- **Auth may reject a recovery redemption after a later revocation** → the contract distinguishes `user_banned` from invalid/expired-link responses and never changes account activation as a recovery side effect.
- **The documentation represents a published implementation** → the owner’s production validation and prior automated results are recorded explicitly; no new test result is inferred.

## Migration Plan

Run OpenSpec strict validation for this Change, review its two deltas, archive only `document-employee-management-and-recovery` using the official OpenSpec command, then validate canonical specs and archived Changes. There is no database or application migration. If the documentation needs correction later, use a subsequent OpenSpec Change rather than rewriting CHG-21/CHG-22 history.

## Historical Publication Evidence

This record is historical and does not define permanent functional requirements:

- Related archived Changes: `2026-11-01-chg-21-employee-authentication-usability` and `2026-11-02-chg-22-secure-user-creation-editing`; their archive files are not modified by this follow-up.
- Supabase project: `qazjfofpfcwopcefupjl`; Edge Function `manage-profile` v16, ACTIVE, `verify_jwt=true`.
- Cloudflare Worker: `grace-supply`, frontend version `e0dc2237-e3c5-480c-a127-1e05a68c492a`.
- Automated evidence reported for the published hotfix: Auth/RLS 23/23 PASS; Playwright 6/6 PASS; `npm test` 146 PASS, 0 FAIL, 4 SKIP.
- Additional reported checks: focused tests 40 PASS, TypeScript PASS, focused ESLint PASS, production build PASS.
- Owner’s post-deployment manual validation: 5/5 PASS, covering employee administration, recovery rejection for revoked accounts, reactivation and new links, password change/login, and preservation of state, role, and permissions.
- Public automatic email recovery remained disabled in the current production configuration; the separate administrator-assisted recovery path was validated for authorized use.
