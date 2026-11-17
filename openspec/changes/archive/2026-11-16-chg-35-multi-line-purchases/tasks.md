# Tasks

## 1. Forward-compatible schema and read security

- [x] 1.1 Create a forward-only migration for `purchase_lines` with stable line order, product/name/SKU snapshots, quantity, unit cost, server-derived subtotal and persisted restock state; verify old purchases remain byte-for-byte unchanged and no synthetic historical snapshots are backfilled.
- [x] 1.2 Relax only scalar `quantity`/`unit_cost` nullability for multi-line headers and add RLS with authenticated SELECT limited to existing purchase/supplier parent visibility; verify anon and unauthorized roles cannot read lines and authenticated users cannot directly insert/update/delete them.
- [x] 1.3 Apply the migration to a disposable local Supabase stack and verify legacy columns, FKs, RLS, indexes, generated database types and row counts before/after.

## 2. Atomic multi-line posting

- [x] 2.1 Extend `post_purchase` for a bounded 1â€“100 line request, server-side snapshots/totals, deterministic inventory locking, duplicate-item rejection, restock and one supplier credit; verify all effects commit or roll back together in integration tests.
- [x] 2.2 Preserve the scalar legacy payload and unlinked single purchase path; verify existing CHG-07/CHG-12 requests still post and replay correctly.
- [x] 2.3 Add Auth/RLS/business integration tests for permission denial, inactive/missing products, invalid quantity/cost/overflow, duplicate lines, no-stock-change mode, restock concurrency, one payable, identical replay, changed-payload idempotency conflict and uncertain-result recovery.
- [x] 2.4 Update pending-operation form/request context for a line array; verify an interrupted request restores every line and reuses the same idempotency key without duplicate posting.

## 3. All-or-nothing financial annulment

- [x] 3.1 Extend `annul_financial_document` to reverse each line marked restocked after locking and checking all affected stock; verify insufficient stock or active credit payments reject the entire annulment without changing any row.
- [x] 3.2 Retain the pre-migration scalar fallback and add regression tests for legacy purchases, non-restocked lines, multiple restocked products, concurrent stock changes, audit compensation and repeated annulment.

## 4. CHG-33 history and details

- [x] 4.1 Extend `search_purchases_history` with line count/summary while preserving search, filters, exact count, 25-row ordering and response keys; verify old and new purchases return compatible history records.
- [x] 4.2 Add a purchase-line detail reader using parent-filtered RLS and update mappings/types; verify a permitted user reads only the selected document's lines while unauthorized direct reads reveal no rows.
- [x] 4.3 Add unit/integration coverage for line details, legacy scalar fallback, stable search/paging totals and immutable product snapshots after catalog changes.

## 5. Purchase composer

- [x] 5.1 Replace the scalar product editor with add/remove line controls and per-line quantity, unit cost and subtotal; preserve supplier, invoice, payment, due-date, description-only purchase and purchase-level restock behavior, and verify correct total display.
- [x] 5.2 Validate 1â€“100 lines, duplicate products, quantities, costs, linked products and restock rules in UI and server; verify invalid forms retain input and never announce persistence.
- [x] 5.3 Add Playwright coverage for line editing, total calculation, single payable, restock toggle, no-linked legacy purchase, history details, loading/error states and responsive viewports.

## 6. Integration verification

- [x] 6.1 Run focused business/Auth-RLS, unit and browser suites, TypeScript, focused ESLint, production build, OpenSpec strict and `git diff --check`; verify Sales, ITBIS, purchase history filters/search, existing supplier-credit operations and financial audit behavior remain unchanged.

## 7. Manual and mixed product lines (extension before archive)

- [x] 7.1 Create a new forward-only migration that allows `purchase_lines.item_id` and `sku_snapshot` to be NULL for manual rows, preserves the linked-product FK and uniqueness, requires a non-empty manual name snapshot of at most 500 characters, and enforces that manual rows are never restocked; do not edit the published CHG-35 migration or backfill historical rows.
- [x] 7.2 Extend `post_purchase(jsonb)` to accept manual and mixed `lines[]` while preserving the scalar legacy payload, one purchase/credit, server totals, authorization, idempotency and atomicity; prove manual lines do not create inventory records or change stock.
- [x] 7.3 Verify linked-product duplication remains rejected while multiple manual rows, including identical names, remain independent; reject missing/blank/oversized manual names and invalid quantities/costs without partial effects.
- [x] 7.4 Verify purchase annulment ignores manual rows, reverses only linked rows actually restocked, and rejects mixed annulments atomically when linked stock is insufficient; retain legacy annulment and payable rules.
- [x] 7.5 Extend history summary/detail mappings and types to distinguish manual from linked rows while preserving CHG-33 filters, search, count, order, paging, RLS and legacy fallback.
- [x] 7.6 Update the composer with per-line linked/manual selection, manual name/description, editable quantity/cost, subtotals, shared total, removal and clear source labels; manual-only and mixed lines must retain operation idempotency and pending-draft recovery.
- [x] 7.7 Add integration/Auth-RLS and Playwright coverage for manual, mixed, credit, stock, annulment, invalid input, maximum line count, duplicate names, no product creation, history display, uncertain recovery and the currently published CHG-35 frontend contract.
- [x] 7.8 Run focused PostgreSQL integration, Auth/RLS, Playwright, unit, TypeScript, ESLint, production build, OpenSpec strict and `git diff --check`; complete only after evidence is recorded.

- [x] 7.9 Align manual-name validation in PostgreSQL, frontend and OpenSpec: reject empty names and ASCII whitespace (space, tab, LF, VT, FF, CR) at either boundary, allow internal whitespace, preserve the exact accepted string, and verify the runtime after the first migration and after the second migration.

- [x] 7.10 Exercise the owner-reported manual-first/mixed purchase scenario; verify boundary whitespace is rejected, correcting to the exact accepted name clears inline validation, the name is snapshotted unchanged, and restock guidance states that only linked products affect inventory. Playwright: 8/8 PASS on the dedicated local CHG-35 stack.
