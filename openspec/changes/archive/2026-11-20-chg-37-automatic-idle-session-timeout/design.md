## Context

Supabase Auth credentials are persisted in `sessionStorage` through a tab-specific storage adapter. The AuthProvider owns verified identity, private query-cache invalidation, local sign-out, and route session state. Financial operations persist idempotency context in tab-scoped `sessionStorage` so a later authenticated visit can reconcile an uncertain result.

## Decisions

1. Keep the idle timer inside the authenticated AuthProvider lifecycle. A pure controller receives an injected clock and scheduler so boundary behavior is testable without waiting two hours.
2. Store only the last-activity timestamp and an expiry marker in this tab's `sessionStorage`, scoped to the verified Auth user. Never persist credentials or private rows. Do not broadcast activity or session data.
3. Treat only trusted keyboard, pointer, touch, wheel/scroll, and focus/navigation interaction as activity. Coalesce writes and schedule one boundary timer; on visibility/focus return, re-evaluate elapsed wall time rather than trusting a delayed timeout.
4. At the warning boundary, show an accessible modal with a live five-minute countdown. Trusted activity or the Continue action records a new activity timestamp and closes it. The warning itself and its timer do not count as activity.
5. At expiry, synchronously set an expired/locked state before asynchronous work, clear AuthProvider private identity and query state, then call `signOut({ scope: "local" })` and navigate to login. If sign-out errors, remain locked; the notice describes local access expiry, not server revocation.
6. Do not cancel or retry submitted financial requests. Existing pending-operation records and idempotency keys remain intact across expiry. A request whose response is unresolved stays unconfirmed and must be reconciled after a later login. An unsaved form may be lost; warn during the five-minute grace period. The expiry boundary is fixed and is not extended by network activity.
7. A later successful login in the same tab clears the expired marker and starts a new clean idle period. Identity changes reset the timer only after the new identity has been verified.

## Risks / Trade-offs

- Browser wall clocks can move. Reconcile with a monotonic in-memory clock while the document remains alive; on reload use persisted wall time, fail closed if the timestamp is malformed or materially in the future, and re-evaluate on resume. Never let a clock rollback silently extend an already-running tab's elapsed interval.
- A browser-local timeout cannot revoke already-issued JWTs by itself. Supabase documents server-side inactivity timeout as an Auth setting available on Pro and above; it is not changed here. RLS/server authorization remains authoritative, and JWT residual lifetime must be documented.
- A transaction may commit after the UI becomes locked. The client must not report failure/success based only on abort/unmount; existing idempotency reconciliation is the recovery path.

## Release Pipeline Boundary

The historic CHG-36 cutoff remains `2026-11-18T03:18:00.000Z`. Release-pipeline behavior is maintained in the independent CHG-38 Change so it can be reviewed and archived separately; CHG-37 does not alter the receipt policy or its release configuration.

## Server-side Session Limits

The connected Supabase organization is on the Free plan. Supabase's current Auth Sessions documentation states that server-side time-boxed/inactivity session limits are available on Pro and above; the local browser timeout implemented here does not revoke a JWT already issued to a client. No Auth setting, JWT lifetime, RLS policy, or Cloud project configuration is changed by this Change. A later plan upgrade and explicit Auth configuration change would be needed for server-enforced inactivity expiry; RLS and current server authorization remain authoritative.

## Validation

- Unit tests with fake clocks cover 114/115/120-minute boundaries, trusted activity, malformed/future persisted timestamps, wall-clock movement, and identity scoping.
- Playwright covers warning, continuation, expiry, locked private UI, reload/resume, separate tabs, manual logout, delayed financial responses, and fresh login.
- Run compiled production-mode auth tests against isolated local Supabase with synthetic accounts; no production changes.
