## ADDED Requirements

### Requirement: Idle timeout is tab-scoped and invalidates private state

Each authenticated tab MUST track trusted direct user activity independently, warn after 115 minutes, and lock local private access after 120 minutes without activity. Background work, token refresh, polling, rendering, and activity in another tab MUST NOT extend this tab's deadline. The tab MUST re-evaluate elapsed time after reload, visibility restoration, or suspension.

#### Scenario: Private tab is idle

- **WHEN** 115 minutes elapse without trusted user interaction in an authenticated tab
- **THEN** that tab shows an accessible five-minute warning without resetting its deadline.

#### Scenario: Idle limit is reached

- **WHEN** 120 minutes elapse without trusted interaction
- **THEN** the tab hides private views and invalidates private in-memory state before attempting local sign-out; it never claims server revocation unless confirmed.

#### Scenario: Financial request is unresolved at expiry

- **WHEN** a submitted financial request has no confirmed response at the idle deadline
- **THEN** the client does not report failure or success, does not retry, and preserves its existing identity-scoped idempotency/reconciliation record for a later verified session.
