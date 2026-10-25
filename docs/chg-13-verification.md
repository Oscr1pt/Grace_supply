# CHG-13 Verification Record

Date: 2026-10-24

## Disposable Supabase integration

- A separate local Supabase project applied all 16 installable migrations. The habitual `jewel-sales-hub` database was not reset, and its running state was unchanged by the verifier.
- The clean schema fingerprint was `cb5a261a88c23fd43b4ab4dfdc33b009415323fdf3b246ac95a78e6d247d3dd6`.
- Catalog browser checks passed 3/3 against real local persistence: initial empty state, product and custom category creation, edit, activate/deactivate, search, generic barcode label, persistence rejection with form retention, RLS filtering while inactive, and the same product UUID in sales and purchase selectors.
- Purchase RPC restocked one unit at cost 12.50; the browser showed the catalog selling price 45.50 and stock 1. Attempting to sell two units was clamped to available stock. Purchase and sale used the authorized financial operations.
- Auth/RLS integration passed 22/22. Financial integration passed 20/20, including tax-policy blocking, concurrency, stock restrictions, operation idempotency and audit attribution/rollback.

## Browser and application checks

- Full browser suite with the disposable stack's Mailpit URL passed 24/24, including invitation, password setup, password recovery, invalid/expired links and session/cache isolation.
- `npm test`: 40 passed, 0 failed, 1 intentionally skipped local integration test (the integration suites were run separately against the disposable stack).
- `npx tsc --noEmit`: passed.
- `npm run build`: passed.
- Strict global OpenSpec validation: 13/13 passed after the capability spec was synchronized.

## Compatibility and scope

- Cloud preflight targeted project `qazjfofpfcwopcefupjl`. The remote history has the first 15 migrations applied and only `20261024051641` pending. `db push --dry-run --linked --skip-vault` listed only `20261024051641_chg12_flexible_product_catalog.sql`; no real push was run.
- The read-only Cloud impact query found 0 inventory rows. It also found 0 rows with legacy metal/karat or gem/weight/size values to map, and 0 blank category, SKU, or name values that would fail the new checks. Thus the migration's inventory backfill affects no existing records on this project at inspection time.
- Historical jewelry columns and values remain for existing records and compatibility. CHG-12 maps `metal` to `brand`, `karat` to `presentation`, and preserves weight, stone, cut, clarity, color, and size values under `attributes.legacy`; `kind` still accepts `joya` and `piedra` for historical rows. Generic labels and workflows do not infer or emit those details.
- No earlier migration was rewritten, no records were deleted, the old Supabase project was not modified, and the recent Auth/password-recovery flows remain covered by the passing browser and Auth/RLS suites.
