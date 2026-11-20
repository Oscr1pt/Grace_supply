## Why

Grace Supply can remain open on a shared or unattended device. The application needs a predictable two-hour idle limit while allowing normal work to continue and giving the current user five minutes to continue the session.

## What Changes

- Track trusted, direct user activity per authenticated tab, without treating background refreshes, polling, renders, or automatic navigation as activity.
- Warn accessibly after 115 idle minutes and expire the tab-local session at 120 minutes, including after reload or browser suspension.
- On expiry, hide private views and invalidate in-memory private state before attempting local Supabase sign-out; route to login with a factual idle-expiry notice.
- Preserve the existing tab-scoped identity and pending-operation reconciliation guarantees. Do not claim an in-flight financial request failed or retry it automatically.
- Document that client-side expiry is not server-side JWT revocation; changing Supabase session inactivity settings is outside this Change.

## Capabilities

### Modified Capabilities

- `session-cache-isolation`: add tab-scoped idle state, expiry invalidation, and financial in-flight behavior.
- `verified-user-identity`: require idle-expired sessions to lose private UI access and re-authenticate.
- `account-access-usability`: define accessible warning, continuation, and post-expiry message.

## Impact

- React authentication provider and private application layout.
- A testable idle-session controller and accessible warning dialog.
- Focused unit and browser tests; no database, production configuration, or financial RPC changes.
