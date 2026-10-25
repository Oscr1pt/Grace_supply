# CHG-08 financial audit and annulment evidence

## Implemented boundary

- New CHG-08 migrations are additive; the applied CHG-07 migration was not edited. They were applied with Supabase CLI `migration up --local` only.
- `financial_audit_events` records a stable business operation ID, Auth actor ID, server timestamp, operation/document type and ID, and a small allowlisted detail object. Events are created by a PostgreSQL trigger when the durable CHG-07 operation result is written, in the same transaction. Existing test rows were not backfilled.
- Authenticated users cannot insert, update, or delete audit events. RLS limits reads to active administrators. The database owner and trusted `service_role` remain privileged maintenance principals; neither key is used in the frontend.
- New expense posts use an idempotent server RPC. Authenticated direct expense insert/update has been revoked. Sales, purchases, credits, and payments retain their nominal values and snapshots; direct application deletes remain denied.
- Active administrators can annul complete sales, purchases, and expenses with a nonempty reason and stable idempotency key. Sales restore line quantities; purchases reverse restocked quantities only when enough stock remains. Credit principal is retained as `voided_principal`, with net paid/balance preserved. A payment reversal is full-only, retains the original payment row, and adds a positive compensating record. A credit document with a nonzero net paid amount cannot be annulled.
- Annulment/reversal changes no bank, card, or cash settlement and makes no claim that money was returned. Dashboard revenue and credit totals exclude annulled records; expense totals already exclude annulled rows.

## Verification evidence

Run against local Supabase/PostgreSQL with synthetic Auth identities and data:

- `npm.cmd test`: 21 passed, 0 failed. The standalone test command skips opt-in local integration suites; those were run separately.
- `npm.cmd run test:business:local`: 20 passed, 0 failed. Coverage includes existing CHG-07 concurrency/idempotency/reconciliation, forged actor/time inputs, audit append-only permissions, audit-trigger failure rollback, concurrent repeated sale annulment, active payment denial, full payment reversal, purchase stock-shortage denial and compensation, retained expense nominal, and net report calculation.
- `npm.cmd run test:browser:local`: 10 passed, 0 failed in Chrome. Browser flows create and annul synthetic expenses and sales, retain original documents, and preserve existing persistence/error/reconciliation coverage.
- `node_modules/.bin/tsc.cmd --noEmit`: passed.
- `npm.cmd run build`: passed.
- `npx.cmd --yes @fission-ai/openspec@latest validate --changes --strict`: 1 Change passed, 0 failed.

The first Playwright run exposed a field selector issue in the test; the selector was corrected. A later browser run exposed an inventory expectation that ignored the new sale-void fixture; the deterministic expected quantity was corrected. Final browser results above are from the subsequent passing full run.

## Decisions still required before production

1. Approve the tax rate, whether prices include tax, tax calculation and rounding rules, and any required tax treatment for annulled documents. Sales remain blocked when the tax policy is not approved.
2. Define the handling and evidence required for external cash, card, transfer, or cheque settlement when a sale, purchase, expense, or payment is annulled. CHG-08 records internal accounting compensation only; it does not refund or reconcile an external payment.
3. Decide whether partial document annulments or partial payment reversals are allowed. Current RPCs support complete document annulment and full payment reversal only; there is no partial path.
4. Approve correction periods, required reason standards, and whether additional approval is needed for high-value or closed-period corrections.
5. Name the audit custodian and approve retention, backup, export, and access-review requirements. Events are not automatically purged.
6. Approve the business rule for goods that are not physically returned or are not resalable. Current stock compensation changes quantities only and does not assess condition or value.

These decisions do not change the local test fixtures into business-policy approvals. No Cloud project was targeted.
