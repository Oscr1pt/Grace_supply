# Tasks

## 1. Lecturas paginadas seguras y fechas de negocio

- [x] 1.1 Add a forward-only migration with read-only Sales and Purchases RPCs; verify explicit rejection when the caller lacks the matching permission, authenticated-only execution, `SECURITY INVOKER`, unchanged RLS, minimal fields, stable ordering, fixed 25-row page, filtered exact count and literal parameterized search, including empty-page metadata, with Auth/RLS integration tests.
- [x] 1.2 Add the `America/Santo_Domingo` date-range helper for all five period choices and inclusive custom end dates; verify local-midnight/UTC boundaries, month/year changes, invalid partial ranges and exclusive upper-bound cases with unit tests.
- [x] 1.3 Add typed route-specific history readers with bounded parameters, auth-scope/request cancellation and stale-response protection; verify `useSupabaseTable` and business-operation APIs are unchanged.

## 2. Integrate history controls in both routes

- [x] 2.1 Add Sales search, period/custom dates, clear action, 25-row navigation, filtered count and loading/error/empty/no-match/out-of-range states; verify receipt viewing and permission-gated annulment from paged rows with browser tests.
- [x] 2.2 Add equivalent Purchases controls using invoice number, UUID and historical supplier snapshot; verify existing purchase display, permission-gated annulment and query states with browser tests.
- [x] 2.3 Reuse shared pagination where accessible; verify keyboard labels, page reset on filter changes and no unintended horizontal overflow at 320, 375, 768 and 1280 px for both routes.

## 3. Integrated validation and financial invariants

- [x] 3.1 Run local Auth/RLS integration for admins, permitted Sales/Purchases roles, client/supplier lookup roles, authenticated users without permissions and anonymous callers; verify forbidden calls are rejected and counts never reveal protected history.
- [x] 3.2 Seed more than 1,000 synthetic historical rows and verify search, all date presets, boundaries, page traversal without omissions/duplicates, tie ordering, clear/reset and query plans; add an index only if measured evidence requires it.
- [x] 3.3 Run focused Playwright for both histories and assert browsing/filtering/paging/retry do not post, annul, change financial totals, alter tax/receipt snapshots or mutate inventory; run TypeScript, affected lint, `npm test`, build, `git diff --check` and OpenSpec strict.
