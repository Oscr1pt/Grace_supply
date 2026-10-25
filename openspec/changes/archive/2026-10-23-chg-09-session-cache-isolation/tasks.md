# Tasks

## 1. Audit cache and session boundaries

- [x] 1.1 Trace TanStack Query, React state/context, localStorage/sessionStorage, legacy persistence, router loaders, and Supabase Auth lifecycle; record each private-data cache, its lifetime, and exposure in `design.md` and verify the inventory against source searches.
- [x] 1.2 Document account-switch, revocation, permission-change, multi-tab, and late-response risks before implementation; verify the documented risks correspond to current code paths and do not treat RLS as a cache privacy control.

## 2. Isolate and invalidate private state

- [x] 2.1 Remove private-row localStorage hydration/persistence and bind table/view state to a verified identity and authorization generation; add focused tests proving private rows are not persisted or reused across generations.
- [x] 2.2 Guard Auth profile loads against out-of-order events, cancel or reject stale reads before any state commit, and clear private React/Query/router state on logout, identity/revocation, and permission changes; add focused tests for stale responses and permission scope changes.
- [x] 2.3 Add token-free cross-tab invalidation and per-tab profile revalidation; verify logout/profile changes invalidate other tabs without copying session credentials or allowing a cached view to bypass RLS.

## 3. Verify real session and financial regressions

- [x] 3.1 Add and run local Chromium tests with synthetic Supabase Auth identities for A-to-B switching, delayed A response, revoked identity, changed permissions, and two tabs; verify B never renders A's private fixture and RLS still controls remote access.
- [x] 3.2 Run financial browser regressions for pending/error/uncertain submissions, then Auth/RLS integration, all automated tests, `tsc --noEmit`, production build, and strict OpenSpec validation; document actual results and any environment-dependent blocker.
