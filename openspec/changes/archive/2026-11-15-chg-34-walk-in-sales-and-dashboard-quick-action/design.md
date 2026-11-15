# Design

## Context

See `proposal.md` for motivation. `sales.client_id` is currently `NOT NULL`; `post_sale` resolves and locks an active client before processing either payment type. The sale history RPC derives customer display/search from current client lookup data. The UI stores a client UUID and its existing receipt/history models already allow a displayed `clientName`. The Dashboard's quick-action list is permission-filtered but omits sales; the sale dialog itself blocks opening while the tax policy is unsupported.

## Goals / Non-Goals

**Goals:** Persist customer display identity at sale time, preserve explicit UUID identity for registered customers, support cash-only walk-ins, and route an authorized dashboard action through existing checks.

**Non-Goals:** Create guest client rows, change client identity validation, allow walk-in credit, alter tax calculations or receipt fiscal labeling, or change credit, stock, annulment, or idempotency contracts.

## Decisions

1. **Optional relationship plus immutable name snapshot.** Add a nullable `sales.client_id` while retaining its FK and `ON DELETE RESTRICT`, and add `client_name_snapshot`. `post_sale` accepts exactly one customer mode: registered `client_id`, or a trimmed non-empty walk-in name of at most 160 characters, matching the existing client-name validation limit. For registered sales it locks/revalidates an active client and snapshots the name under that lock. For walk-ins it requires `contado`, stores NULL `client_id`, and stores the entered name. The RPC remains the financial authority. This is preferred over creating a special `clients` row, which would pollute the client directory and invite accidental credit/identity linking, and over matching text to existing names, which is ambiguous. New documents get snapshots; the migration does not backfill old sales from today's client names because that would invent historical evidence.

2. **Snapshot-first history and receipt display.** Extend `search_sales_history` to return/search `client_name_snapshot` first, then retain the current registered-client lookup fallback for older documents without a snapshot. Keep identifier search and RLS/permission filters unchanged. Existing receipts use the stored name where present, with their current fallback for legacy rows. Duplicate names never participate in identity selection.

3. **Validated quick-entry route state.** Add a typed/validated `new=1` search parameter to the Sales route. The Dashboard link includes it only for `can('sales')`; Sales opens the existing dialog only after authentication and a confirmed supported tax-policy state. Closing removes the marker so browser back/reload does not unexpectedly reopen a form. Alternatives are a second sales form (duplicates policy and validation) or direct modal state in Dashboard (cross-route coupling); both are rejected.

4. **Keep fiscal and financial operation code authoritative.** The same policy revalidation, quote, idempotency, inventory, tax-classification, and posting path remains in force. The walk-in branch changes only counterparty resolution and the persisted customer reference/snapshot. No new client lookup or client creation path is added.

## Risks / Trade-offs

- [Nullable `client_id` may reveal assumptions in old readers or generated types] → Update TypeScript domain/database mappings and audit every `clientId` consumer; retain the registered-client fallback and test old history rows.
- [A user could forge `client_name_snapshot` or combine modes] → The RPC accepts one mode, validates it server-side, derives registered snapshots from the locked row, and ignores/rejects conflicting client parameters.
- [Direct navigation could bypass dashboard visibility] → UI state is not authorization; `post_sale` continues to require active authenticated `sales` permission and tax-policy checks.
- [Historical client names are not available for old transactions] → Do not fabricate or backfill them; preserve their current lookup fallback.

## Migration Plan

1. Add the snapshot column and relax only `sales.client_id` nullability; keep FK, RLS, all existing rows, and client credit constraints unchanged.
2. Replace `post_sale` and `search_sales_history` in one forward-only migration, preserving grants and guards.
3. Verify the old frontend's registered-customer payload still works against the updated RPC; then publish the frontend.
4. If the frontend must be rolled back, retain the additive schema and backward-compatible RPC input. Walk-in rows remain intact and CHG-33's existing response envelope continues returning the snapshot name.

## Open Questions

None.
