# Tasks

## 1. Posting contract and schema

- [x] 1.1 Add a forward-only migration for nullable `sales.client_id` and a customer-name snapshot; verify existing rows and FK/RLS constraints remain unchanged and no historical values are fabricated.
- [x] 1.2 Extend `post_sale` to accept exactly one registered or walk-in customer mode; verify active-client validation, 160-character name validation, cash-only walk-ins, and atomic rollback for rejected requests in PostgreSQL integration tests.
- [x] 1.3 Add Auth/RLS and business-operation regression cases for anonymous/unauthorized calls, duplicate-name walk-ins, credit rejection, idempotent retry, ITBIS calculation, stock, and absence of client-row creation; verify existing registered cash/credit cases still pass.

## 2. Sale form and validation

- [x] 2.1 Add registered/occasional customer mode and name input to `sales.tsx` and `businessDocumentValidation`; verify no identity fields are requested, credit is unavailable for walk-ins, and existing registered payment choices remain.
- [x] 2.2 Update sale request and uncertain-operation recovery context for both customer modes; verify failed or uncertain submissions retain the entered name and idempotency key without creating a client.
- [x] 2.3 Add unit and Playwright coverage for switching modes, duplicate names, required/limited walk-in name, active registered UUID selection, cash-only enforcement, and policy-blocked submission.

## 3. Historical name and receipt compatibility

- [x] 3.1 Update `search_sales_history` to return and search snapshot names before registered-client fallback; verify CHG-33 pagination/count/search and legacy no-snapshot records remain compatible.
- [x] 3.2 Update sale history/receipt mappings and database/domain types for nullable `clientId`; verify walk-in name renders in history and receipt and legacy sales retain their current display.
- [x] 3.3 Add regression tests proving equal names do not link identities and changing a registered client's name does not change a newly snapshotted sale display.

## 4. Dashboard quick action

- [x] 4.1 Add a sales-permission-filtered Â«Registrar ventaÂ» quick action and validated route state to open the existing sale dialog; verify it is hidden without `sales` and closing clears the open intent.
- [x] 4.2 Add browser coverage for authorized navigation, direct URL access without privilege, authentication, tax-policy blocked state, and preservation of other Dashboard quick actions.

## 5. Integration verification

- [x] 5.1 Run the focused business/Auth-RLS, unit, and Playwright suites plus TypeScript, focused ESLint, production build, `git diff --check`, and OpenSpec strict; verify ITBIS, idempotency, stock, credit, annulment, and receipt fiscal wording remain unchanged.
