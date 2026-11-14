# Design

## Context

See `proposal.md` for motivation and `specs/safe-sales-purchases-ui/spec.md` for the observable contract. The current routes load all Sales/Purchases rows through generic `useSupabaseTable`; sales also loads all line snapshots. Both tables use `created_at` as their operational timestamp. Existing RLS policies and permission-scoped lookup views remain authoritative.

Schema evidence:
- Sales identifier: `sales.receipt_no`; counterpart key: `sales.client_id` to `clients.id`; no client-name snapshot exists on a sale. Existing sales history displays the current visible client name through `sales_client_lookup`. Sales references use `ON DELETE RESTRICT`, so deleting a referenced client cannot erase the historic sale.
- Purchases identifiers: `purchases.invoice_no` and `purchases.id`; historical counterpart display/search uses `purchases.supplier`, the stored name snapshot. Do not substitute the current supplier name.
- Both history timestamps are `created_at timestamptz`.

## Goals / Non-Goals

**Goals:**
- Return one filtered 25-row page and an exact count, computed from one database snapshot per RPC call.
- Reject direct RPC calls by identities lacking the same read permission as the existing policies.
- Preserve existing financial read and write behavior.

**Non-Goals:**
- Change posting, receipt contents, tax, stock, credit or annulment behavior.
- Change any table grants or RLS policy.
- Add a page-size selector or financial aggregates.
- Search an old client name that is not stored as a sale snapshot; the current relationship remains the canonical visible client name.

## Decisions

### Dedicated server read functions

Add two typed PostgreSQL RPCs for Sales and Purchases. Each takes normalized search text, optional start and exclusive-end timestamps, and a positive page number; the server fixes page size at 25. The function returns one row containing `total_count` and a JSON array of page records, so the count remains available even if a page is empty. Count and page rows are computed in one SQL statement to keep them consistent for that response. Results order by `created_at DESC, id DESC`; an out-of-range page returns an empty array and the true total, allowing the client to clamp to the final valid page.

Functions are `STABLE SECURITY INVOKER`, use schema-qualified relations and parameterized inputs, and do not execute dynamic SQL. Before querying, each explicitly checks the existing permission helper and raises SQLSTATE `42501` if the caller lacks access: Sales accepts `sales` or `clients`; Purchases accepts `purchases` or `suppliers`. This matches existing table read policies and makes direct unauthorized authenticated RPC calls fail instead of merely returning an empty set. `private.has_permission` already checks active, verified profiles and is executable by `authenticated`.

Revoke function execution from `PUBLIC` and `anon`; grant it only to `authenticated`. Keep existing table SELECT grants and RLS unchanged. Sales customer-name search uses the restricted `sales_client_lookup` for sales permission and `public.clients` under its current RLS for client permission, unioned by ID and selecting only ID/name. Purchase search uses the historical supplier snapshot. Return only columns the current list needs; retrieve sale line snapshots only for the current page or on receipt open, through the existing `sale_lines` RLS policy.

Supabase documents that `.or()` uses raw PostgREST filter syntax and cannot combine fields across tables; merging separate client-side searches would make global ordering, exact counts and offset pagination incorrect or unbounded. The read RPC keeps those operations inside PostgreSQL. See [Supabase JavaScript `.or()`](https://supabase.com/docs/reference/javascript/using-filters-or) and [Supabase database function security](https://supabase.com/docs/guides/database/functions).

### Literal search

Normalize whitespace and case in the function. Search is a literal case-insensitive substring: `receipt_no` or visible client name for Sales; `invoice_no`, UUID text, or stored supplier name for Purchases. Bind the search as a parameter and use `strpos(lower(column), lower(search)) > 0`; this treats `%`, `_`, commas, quotes and backslashes as ordinary text without raw PostgREST syntax or wildcard expansion. Reject search longer than 120 characters with a validation SQLSTATE. Empty search is treated as null.

### Business dates

Use `created_at` for both lists. A shared pure date-range helper calculates business calendar boundaries in `America/Santo_Domingo` and passes UTC ISO instants. Use `created_at >= start AND created_at < endExclusive`: Today is local midnight through next local midnight; Last 7 days includes today and the previous six local calendar days; This month runs from local month start to next month start; custom ranges include the full final day by using the following local midnight as the exclusive end. Avoid `23:59:59.999`. Missing one custom bound or start after end shows validation and does not issue a partial query.

### Page and request state

Keep filters/page state local to the two history routes; do not alter the financial operation state or global `useSupabaseTable`. Reuse `src/components/ui/pagination.tsx` if accessible current-page and disabled states meet the interface contract. Use a 300 ms IME-safe search debounce, explicit clear, and cancel/ignore stale requests with `AbortController`, request generation and auth-scope validation. Reset page to 1 on committed filter changes and clear. Show page, filtered record count, Previous/Next, and correct disabled states. The count describes matching documents, not sums of current-page totals.

If concurrent changes make a page out of range, clamp to the last page based on the returned count and refetch once. Distinguish initial loading, retryable error, no records in an unfiltered history, and no matches for active filters. Wrap filter controls and pagination at 320/375/768/1280 px without document-level horizontal overflow. Keep existing receipt and annulment actions and their permission checks.

### Migration and indexes

Add one forward-only migration with the two read-only RPCs and narrow function execute grants. No table, RLS, existing grant or financial write changes. Existing indexes are `(client_id, created_at DESC)` for sales and `(supplier_id, created_at DESC)` for purchases, not global date/ID order plus substring search. Measure with `EXPLAIN (ANALYZE, BUFFERS)` against more than 1,000 synthetic rows before considering indexes. Add no index or extension unless measured need justifies a separate forward-only change.

## Risks / Trade-offs

- **Substring search and exact count may cost more as history grows** → return only 25 rows, cap search length, measure query plans, and add indexes only with evidence.
- **Offset pages can shift between requests as new rows arrive** → stable date/ID order, refresh count each call, reset to page one after writes/refresh, and clamp out-of-range pages; no cross-request snapshot is promised.
- **RPCs could expose data if owner privileges or grants are wrong** → `SECURITY INVOKER`, explicit permission rejection, authenticated-only execute, existing RLS and role-specific integration tests.
- **Date conversion could exclude boundary records** → test exact local midnight, end-exclusive instant, month/year boundaries and custom final date.
- **Sales has no client-name snapshot** → preserve the current client reference and visible-name behavior; do not add historical PII or alter financial records.

## Migration Plan

1. Add the forward-only read RPC migration and client types; apply only to the disposable local Supabase stack.
2. Verify grants, RPC security, authorization, result count, search, dates, order and 1,000+ records before route integration.
3. Add route-specific readers and controls while retaining current posting and annulment calls.
4. Run role/RLS and browser regressions, including confirmation that reads do not mutate sales, purchases or inventory.
5. Deployment, when separately authorized, must apply the additive RPC migration before the frontend. A frontend rollback can leave these unused read-only functions in place; no data rollback is needed.

## Open Questions

- Query-plan evidence at the 1,000+ synthetic-row test scale will determine whether an additional index is justified; do not add one without that evidence.