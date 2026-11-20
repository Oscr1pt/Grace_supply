## Implementation

- [x] 1.1 Add a pure, clock-injected idle-session controller with tab- and identity-scoped timestamp persistence, safe clock handling, and 115/120 minute boundaries.
- [x] 1.2 Integrate the controller with verified AuthProvider identity; reset on verified login/identity change and dispose on manual logout/revocation.
- [x] 1.3 Add accessible warning dialog and countdown; continue/activity resets the deadline without sharing state across tabs.
- [x] 1.4 Expire by hiding private routes and clearing private in-memory state before local Supabase sign-out; preserve a non-sensitive login notice and remain locked if sign-out fails.
- [x] 1.5 Preserve pending financial records and idempotency during timeout, avoid automatic retries, and warn that unsaved forms may be lost.
- [x] 1.6 Document browser-local vs server-side session expiry and record the receipt-cutoff release-pipeline issue for the separate CHG-38 Change without changing the historic cutoff.

## Tests

- [x] 2.1 Unit-test activity classification, persistence, 114/115/120-minute boundaries, clock changes, malformed state, expiry marker, and identity scope.
- [x] 2.2 Browser-test warning/countdown/continue, expiry/private-data removal, reload and suspended-tab resume, and expiry notice.
- [x] 2.3 Browser-test two tabs with different identities, manual logout cleanup, revocation precedence, and late auth/profile responses.
- [x] 2.4 Test a pending financial operation at timeout through post-login reconciliation: no duplicate submission, no false confirmation, and the idempotency record survives.
- [x] 2.5 Test compiled production build login/session/profile/dashboard/reload/logout/new login against isolated local synthetic Supabase.

## Verification

- [x] 3.1 Complete the focused unit and Playwright tests, compiled local-auth test, TypeScript, ESLint, focused Prettier, local build, Supabase config verification, and OpenSpec strict.
- [x] 3.2 Run `git diff --check`; review changed files and confirm production, the main worktree, and unrelated Docker resources remain untouched.

## Evidence and remaining validation

- The compiled local-auth Playwright run passed five scenarios: login/session/relogin; warning, continuation and expiry; pending-request non-retry; suspended-page recheck; and pending-operation reconciliation after a fresh login.
- The dedicated `desktop-linux` Docker Engine is healthy. The CHG-37 stack's PostgreSQL, Auth, Kong, and Edge Runtime are available; Kong is bound to localhost port 64121 and `/auth/v1/health` returns 200. Vector was restarting but was not needed by these tests.
- The initial revocation setup attempted to physically delete an Auth user while its `user_profiles` row still referenced it, which violated the foreign key. The test now exercises the supported `manage-profile` revocation flow and cleans employee profiles before their synthetic Auth identities. It retains one synthetic local admin fixture so it can be reused without violating the active-admin invariant.
- The real revocation flow returned HTTP 403 from Auth. Before the fix, an already-open tab retained its private user state after revalidation failed. `AuthProvider` now fails closed for Auth 401/403 responses: it clears private state and query cache, invalidates a pending login attempt, and signs out locally. The idle warning is dismissed, a second identity in another tab remains active, and login for the revoked account is rejected after reload.
- The delayed-profile regression passed: a previously captured active profile response was released after revocation, and it did not restore the session or private access. The separate-tab/revocation scenario also passed on its focused run; each test completed Playwright teardown without an `afterAll` timeout.
- A later combined rerun hit a local `username-login` response timeout after repeated synthetic login cycles. Its cause was not confirmed. The affected revocation/late-profile and two-tab scenarios passed in separate focused runs; no production or remote Auth changes were made.
- The in-flight request test preserves the synthetic idempotency record and confirms no retry or success toast at expiry. A compiled-browser test also expires a pending purchase, verifies private access is hidden, logs in again, obtains a synthetic server-confirmed result through the existing `get_business_operation` path, and confirms the operation is cleared without a `post_purchase` resend.
- Focused local checks after the Auth change: 32 unit tests passed, TypeScript passed, focused ESLint reported zero errors (two existing Fast Refresh warnings), focused Prettier passed, and the production-mode local build passed. CHG-37 is 13/13; CHG-38 remains 6/6 and was not modified.
