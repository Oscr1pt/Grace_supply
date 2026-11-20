## ADDED Requirements

### Requirement: Idle-expired access requires a fresh verified login

When a tab reaches its configured idle limit, the system MUST deny its private routes and clear its in-memory private identity before asynchronous local sign-out. The expired state MUST NOT be undone by a late Auth callback, token refresh, stale profile response, or sign-out network failure. A subsequent successful login MUST establish a new verified session and a fresh idle period.

#### Scenario: Late Auth callback after idle expiry

- **WHEN** a previously started Auth/profile response completes after the tab was locked for idle expiry
- **THEN** it cannot restore private UI access or overwrite the expired state.

#### Scenario: Login after idle expiry

- **WHEN** the user successfully authenticates again in the same tab
- **THEN** the expiry marker is cleared only after identity verification and the new tab session starts with a fresh idle timestamp.
