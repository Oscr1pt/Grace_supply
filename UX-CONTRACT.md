# UX Contract — Sales and Purchases History

This contract records interface consequences for the Sales and Purchases history routes. Authoritative query, permission, ordering, and date behavior is defined in `openspec/changes/archive/2026-11-14-chg-33-sales-purchases-history-filters-pagination/design.md` and its delta specifications; this file does not replace those rules.

## Sources

| Concern | Source of truth |
| --- | --- |
| History permissions and data visibility | Existing Supabase RLS policies and the CHG-33 read-only RPC contract |
| Sales and Purchases history behavior | `openspec/changes/archive/2026-11-14-chg-33-sales-purchases-history-filters-pagination/specs/` |
| Visual language and shared controls | `DESIGN.md`, `src/styles.css`, and `src/components/ui/` |
| Financial writes and reconciliation | Existing business-operation APIs and their current OpenSpec contracts |

## Flow ledger

| User intent | Interface behavior | Safety consequence |
| --- | --- | --- |
| Find a document | Search identifier or visible client / supplier text; debounce remote queries; Enter submits immediately; clear cancels the pending search and returns focus | Superseded reads cannot replace newer results |
| Limit by time | Choose a preset or complete both custom dates; show range validation beside the filters | Business-local dates use the timezone defined by the CHG-33 design |
| Browse matches | Show server-filtered count and 25-row pages; retain stable newest-first order | Never download the full history for client-side filtering |
| Recover from a read error | Show a clear error and explicit retry; preserve filter values | Retry repeats a read only |
| Review no results | Distinguish a truly empty history from a filtered search with no matches | Do not imply records were deleted |
| Inspect a record | Keep existing receipt, purchase, and permission-gated annulment behavior | Browsing, filtering, and paging do not create or alter financial records |

## State and routing decisions

Filters remain route-local transient state because these established routes do not currently define a history-query URL contract. Reloading begins at page one with the default period. Search is limited to 120 characters in the server contract; UI copy should not imply broader matching. Dates and counts follow the active Spanish product locale. Loading is represented in the table, and page navigation is unavailable while no matching rows exist.

## Accessibility and responsive behavior

Each input has a visible label. Search exposes a named clear action; period choices use the shared accessible select. Range errors are announced as alerts and associated date fields expose invalid state. Pagination uses named Previous/Next controls and a live result count. Filter controls stack at narrow viewports; table scrolling is contained within its own surface.
