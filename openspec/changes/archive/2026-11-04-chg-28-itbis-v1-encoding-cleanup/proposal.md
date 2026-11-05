# Proposal

## Why

Grace Supply V1 still exposes Spanish copy with mojibake (`Ã`, `Â`, `�`) and the ITBIS settings flow presents an unnecessary second approval step for the already-scoped operational configuration. This change makes the UI readable and provides one administrator-controlled V1 save flow without weakening PostgreSQL authority, auditability, or the non-fiscal receipt boundary.

## What Changes

- Normalize affected source literals and templates to UTF-8 Spanish without rewriting historical data.
- Replace the redundant ITBIS approval card/action with a single «Aplicar ITBIS» setting beside the existing tax rate and business settings.
- Keep the supported V1 modes explicit: disabled means base-price sales; enabled means 18% on `gravado`, zero on `exento`, and fail-closed for `pendiente`.
- Update the authorized server persistence path so saving settings records the administrator, validates the supported mode, and keeps `post_sale` and `sales_posting_status` consistent.
- Add focused UI, PostgreSQL, authorization, persistence, and encoding regression tests.

## Capabilities

### New Capabilities

- `utf8-spanish-copy`: Consistent, readable Spanish copy and UTF-8 handling across user-facing application surfaces.

### Modified Capabilities

- `approved-sales-tax-policy`: Simplified V1 operational ITBIS configuration while preserving server approval, audit, snapshots, idempotency, internal receipts, and the separate commercial/tax authorization gate.

## Impact

Affected React routes and shared copy, settings persistence, the existing tax-policy PostgreSQL contract through a forward-only migration if required, focused unit/integration/browser tests, and the corresponding OpenSpec capabilities. CHG-25 archived artifacts and Cloud data remain unchanged.
