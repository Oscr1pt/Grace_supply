# CHG-03 — Versioned schema evidence

## Canonical model

`supabase/migrations/20261022000000_chg03_versioned_domain_schema.sql` is the sole installable CHG-03 domain baseline. Older root-level SQL files remain historical references and are not loaded by the Supabase CLI. The baseline creates 12 public tables: clients, suppliers, inventory, sales, sale_lines, purchases, client_credits, supplier_credits, credit_payments, expenses, settings, and user_profiles.

Migration SHA-256, independently recalculated from the repository file on 2026-10-22:

`32e9d86bc8261f3d008473ead297a874b88efae14595df09d52ee915448fb8ae`

Entity and relationship identifiers are UUIDs. Monetary fields use `NUMERIC(14,2)` in DOP, with range checks. Credit payments have separate nullable client/supplier credit foreign keys and a constraint requiring exactly one. Sale lines preserve item name, SKU, and applied unit price snapshots. PostgreSQL enforces the foreign keys, stock and quantity domains, unique SKUs and receipt numbers, credit balance arithmetic, and a single deterministic settings row.

No test or historical business rows are imported. `settings` has one deterministic default row. `user_profiles` references newly provisioned `auth.users` and has no password field; CHG-04 owns its identity lifecycle. CHG-03 enables RLS and revokes table, sequence, and function privileges from `PUBLIC`, `anon`, and `authenticated`; it creates no client policies. This is a closed baseline pending authorization work owned by CHG-05.

The relational model and constraints follow the CHG-06 design/specification for UUID relationships, typed credit payments, snapshots, decimal amounts, DOP, valid quantities, and balanced credits. The TypeScript `Relationships` metadata now enumerates every PostgreSQL FK, including the cross-schema `user_profiles.auth_user_id → auth.users.id` reference; generated `normalized_username` is excluded from Insert/Update. Structural coordination with CHG-06 is complete. No Cloud URL was queried because no remote operation was performed.

## External local verification

The user reports that `scripts/chg03-verify-local.ps1` was run from external Windows PowerShell and reached its final line:

`Local CHG-03 reconstruction verification finished.`

The raw transcript from that successful run was not available in this workspace at review time. The reported result is therefore attributed to the user's external run; the repository verifier and assertions were reviewed to establish what reaching that line means. The verifier prints the migration checksum, requires migration history to contain CHG-00 versions `20261021041426` and `20261021043648` before `20261022000000`, checks local-only flags and the local project ID, and only prints its final line after every assertion below succeeds.

Reported local results and corresponding verifier checks:

- Clean local reconstruction from the versioned migration sequence completed, followed by another clean reconstruction.
- `supabase/tests/chg03_schema_contract.sql` passed. It checks the 12-table contract, UUID and `NUMERIC(14,2)`, settings singleton and DOP, RLS/default denial, valid relationships and snapshots, and rejection of negative stock, ambiguous or orphan payment references, non-finite amounts, orphan sales, and duplicate receipt numbers.
- Synthetic fixtures are inserted inside a PL/pgSQL block and rolled back; postconditions assert that their markers are absent.
- The structural signature of columns, defaults, constraints, indexes, RLS state, and policies matched across repeated rebuilds.
- A synthetic unexpected relation caused the migration precondition to fail. The verifier checked that the failed migration was not recorded and that the schema signature had no partial changes.
- The verifier's `finally` reset restored the complete local baseline; migration history and final schema signature were checked again.
- TypeScript contract and application integration were subsequently checked with `tsc --noEmit` and `npm run build` (results recorded below).

These results verify local behavior only. No HTTP test against Supabase Cloud was run, no migration was deployed remotely, and the legacy Supabase project was not accessed. A full disaster-recovery restore from a backup remains untested; the local failed-migration rollback assertion is not a backup recovery drill.

The verifier refuses to run unless `supabase/config.toml` names `jewel-sales-hub`, refuses a linked-project marker, requires `--local`, rejects `--linked`, `--db-url`, and `--project-ref`, and supplies the repository `--workdir`. Its resets affect only that isolated local Supabase stack and are destructive to local data in that stack.

## TypeScript and persistence alignment

`src/lib/database.types.ts` describes the migrated tables and is now connected to the typed domain Supabase client. The generic persistence adapter accepts only tables in that contract. Sales are serialized into `sales` without the UI-only `lines` property; reads load normalized `sale_lines` and rebuild the existing UI-facing `Sale.lines`. Credit payment models and callers use `clientCreditId` or `supplierCreditId`, matching the two SQL foreign keys and exactly-one rule. Settings model and UI expose the schema's fixed DOP currency.

The current legacy `users`/password path remains isolated behind an untyped auth client for CHG-04; it does not match `user_profiles` and is not claimed as part of the CHG-03 contract. Sale posting is still two client requests and the current remove flow is not made compatible with restrictive sale/credit foreign keys here; transactional posting and lifecycle behavior belong to CHG-07. These limits remain open integration work and do not alter the migration schema.

## Validation run in this workspace

- `tsc --noEmit`: passed after integrating the typed contract and correcting TypeScript adapter/model mismatches.
- `npm run build`: passed for client, SSR, and Nitro output. Vite emitted existing chunk-size and dependency/config warnings; no build errors.
- `openspec.cmd validate --changes --strict`: passed for all eight Changes (8 passed, 0 failed) using the installed CLI from `C:\Users\oscar\AppData\Roaming\npm\openspec.cmd`. No installation or `openspec init` was attempted.

## Boundaries and remaining acceptance

- CHG-04 owns provisioning identities and replacing the legacy `users`/password flow. The CHG-03 profile FK is structural only and does not implement Auth.
- CHG-07 owns atomic sale/line/credit/payment posting and financial lifecycle behavior. CHG-03's adapter preserves the normalized row shape but does not claim multi-request atomicity.
- Tax calculation rules, invoice/RNC uniqueness beyond current declared constraints, whether supplier free-text alone identifies a supplier credit, and rounding/status transition rules remain business decisions. The schema's `total = subtotal + tax` and `paid + balance = total` checks are arithmetic invariants; they do not approve a tax formula or workflow.
- No Supabase Cloud HTTP verification, deployment, or backup restore drill is claimed by CHG-03/06.
