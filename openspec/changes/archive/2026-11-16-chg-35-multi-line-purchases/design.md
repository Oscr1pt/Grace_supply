# Design

## Context

See `proposal.md` for motivation. `purchases` is a single header with nullable `item_id` but required scalar `quantity` and `unit_cost`. `post_purchase` writes one row, optionally increments one inventory item, and creates at most one supplier credit. `annul_financial_document` reads the original operation's `restock` request and reverses one scalar item. CHG-33's `search_purchases_history` returns a paged header envelope; the current purchase table has no line-detail query. Purchase, supplier-credit, inventory and operation RLS/grants are already defined and must remain authoritative.

## Goals / Non-Goals

**Goals:** Give one purchase document a normalized, immutable set of item snapshots; keep totals, idempotency, restock, credit and annulment atomic; provide an RLS-protected detail read and retain legacy request/history behavior.

**Non-Goals:** Rewrite other financial documents, change supplier rules, alter RLS on existing tables, backfill fabricated product snapshots, introduce per-line tax or payment, or change the business meaning of a purchase without a linked product.

## Decisions

1. **Normalized child lines; keep `purchases` as the one document header.** Add `purchase_lines` keyed to one `purchase_id`, with stable `line_number`, nullable `item_id`, nullable `sku_snapshot`, required `name_snapshot`, positive integer quantity, `NUMERIC(14,2)` unit cost and server-derived subtotal, and the persisted `restocked` fact. A linked line has a valid inventory FK and non-NULL SKU/name snapshots; a manual line has `item_id = NULL`, `sku_snapshot = NULL`, an exact, non-empty name snapshot of at most 500 characters, and `restocked = false`. Reject names consisting only of ASCII space, tab, LF, VT, FF or CR, and reject any of those characters at either edge. Preserve internal whitespace and the supplied name exactly; do not normalize before fingerprinting or persistence. Store line subtotals/total from server calculations, not client input. Keep unique linked item IDs per purchase; PostgreSQL's default distinct-NULL unique semantics allow multiple independent manual rows, including identical names.

2. **Preserve scalar fields only as legacy compatibility fields.** Leave all old rows untouched. Keep their scalar columns and old read fallback. Relax `quantity` and `unit_cost` nullability so a genuinely multi-item header does not misstate one item's quantity/cost; for a single-line post, keep scalar values populated. Continue accepting the old scalar unlinked-purchase contract. In new `lines[]` requests, allow multiple manual lines and mixtures of manual and linked lines. Manual lines never affect stock; the purchase-level restock flag applies only to linked lines. Require a valid manual name under the exact whitespace rule above. Do not synthesize catalog identities or backfill historical snapshots.

3. **Version-compatible posting through the existing operation.** Extend `post_purchase` to accept the current scalar request as a legacy one-line shape and a validated `lines[]` shape. Use the same active-purchases authorization, operation reservation/idempotency, supplier and credit rules. Reject empty or excessive input (bound: 100 lines), non-integer/non-positive quantities, negative or over-precision costs, duplicate linked product IDs, inactive/missing inventory references, invalid manual names, and totals beyond the existing monetary range. Derive linked snapshots from inventory under lock; lock unique inventory rows in sorted UUID order before validation/update to avoid deadlock. Validate the exact manual string and persist it without trimming, so the fingerprinted request and stored snapshot cannot diverge. Persist `restocked = false` for manual rows. Compute each line and document total with `NUMERIC(14,2)` server-side.

4. **One header, one credit, one durable idempotency result.** Insert the header and all child lines, inventory increases, and (if credit) one `supplier_credits` row for the document total in the existing transaction. Include the exact line array and metadata in the canonical business-operation request/result so a lost response can be reconciled without duplicate stock or credit effects. Existing client payloads continue to be accepted by the same RPC.

5. **Compensate persisted restocked lines on annulment.** Extend `annul_financial_document` to read `purchase_lines.restocked`, exclude manual rows, lock affected inventory rows in deterministic order, validate that every affected linked product can absorb its reversal, and then decrement all restocked quantities and void the same header/one credit atomically. Preserve the current paid-credit restriction. For pre-migration purchases without child rows, retain the existing `business_operations.request.restock` plus scalar header fallback. Any failure rolls back the complete transaction.

6. **Keep purchase-line reads under existing purchase access.** Enable RLS on `purchase_lines`; allow only SELECT to authenticated users whose existing `purchases` or `suppliers` read permission permits the parent document. Revoke direct INSERT/UPDATE/DELETE grants. The mutation path remains the authorized posting RPC. Extend `search_purchases_history` without changing its envelope, stable order, count, filters or search contract; include a line count/summary for headers. Load lines for a selected document using a narrowly filtered SELECT that is protected by the child RLS policy. Old records with no child rows render from their existing scalar columns.

7. **Use the purchase-level restock control already present.** In the line editor, the existing `restock` toggle applies to all linked lines. Manual rows are excluded from restocking and persist `restocked = false`, including in mixed requests. This preserves today's linked-product operation semantics without inventing per-line stock behavior.

8. **Represent manual rows without inventing inventory identity.** Use `item_id IS NULL` as the persisted distinction between manual and linked rows; keep `name_snapshot` populated for both kinds and `sku_snapshot` NULL for manual rows. The manual editor collects only a name/description, quantity and unit cost. It never creates an inventory row. `purchase_lines_purchase_item_unique` may remain because Postgres treats NULLs as distinct by default; repeated manual names therefore remain legal while duplicate linked UUIDs stay rejected. In mixed documents, manual rows always persist `restocked = false`, even when the purchase-level restock option is enabled for linked products.

9. **Render source explicitly in history details.** Include nullable `item_id` in line detail and summary mappings. Display manual rows as “Producto no registrado” without a SKU, and linked rows as inventory-linked. Keep existing legacy scalar fallback and CHG-33 history filtering, count, order and page size unchanged.

## Risks / Trade-offs

- [Dropping scalar NOT NULL constraints may expose nulls to older clients] → Populate scalar fields for single-line posts, keep old response keys, update types/mappers to accept null for multi-line headers, and test the deployed prior frontend's legacy reads/writes.
- [Multi-line documents cannot be fully represented by the old scalar UI] → Do not collapse lines into an inaccurate weighted cost/quantity. A rollback after multi-line writes must retain a detail-capable read path; never drop child lines or reverse schema to hide the feature data.
- [RLS could allow reading a line without its header] → Child SELECT policy must check the parent through the same purchase permission and parent visibility; test direct API reads as each allowed and denied role.
- [An annulment could partially reverse stock] → Lock all applicable items first, validate all quantities before updating, and rely on the single transaction for all-or-nothing behavior.
- [Historical product names/costs are unavailable] → Do not backfill; present the existing legacy description and linkage only.
- [A large line array can extend lock duration] → Bound a document to 100 lines; validate before writes and measure with representative synthetic purchases before adding any further indexes.

## Migration Plan

1. Add `purchase_lines`, RLS, read-only authenticated access, indexes for verified parent/detail and FK paths, and nullable scalar compatibility columns; do not alter existing rows.
2. Deploy compatible `post_purchase`, `annul_financial_document`, and `search_purchases_history`: preserve all existing keys/grants and test legacy scalar requests before enabling the UI.
3. Deploy the frontend with line editor, detail query, pending-operation restoration and existing permissions.
4. Verify simple legacy documents, multi-line cash/credit, restock and all-or-nothing annulment before normal use.
5. If the frontend is rolled back, the updated RPC accepts old scalar writes and the additive schema/data remain. Retain a compatible line-detail viewer for multi-line records; do not drop data or reverse the migration as an improvised rollback.

## Open Questions

None. The proposed 100-line limit and duplicate-line rejection are stated design decisions for review with the proposal.
