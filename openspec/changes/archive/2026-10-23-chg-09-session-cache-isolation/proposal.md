# Proposal

## Why

Grace Supply keeps private client, inventory, sales, purchase, and expense rows in a `localStorage` cache shared by every account and tab on the same origin. Logout attempts to clear that cache, but session validation and per-hook reads are asynchronous, so a late response or a tab that does not receive the other tab's `sessionStorage` Auth event can leave private data visible under another identity.

The application needs a single session boundary for private in-memory and persisted data. Auth and PostgreSQL RLS remain authoritative; browser cache state must never grant access or survive a principal or permission change in a way that exposes another user's rows.

## What Changes

- Add a session cache boundary keyed by the verified Supabase identity and current authorization context.
- Clear private cache and sensitive view state on logout, identity change, account revocation, and permission change; prevent late responses from an older session from updating visible state.
- Coordinate cache invalidation across tabs without sharing session tokens, and revalidate access on focus/visibility changes.
- Stop persisting financial and other private rows in origin-wide `localStorage`; retain only non-sensitive or explicitly approved browser persistence.
- Add browser regressions for account switching, stale requests, revocation, permission changes, multiple tabs, and financial form guarantees.

## Capabilities

### New Capabilities

- `session-cache-isolation`: Private browser data is scoped to the verified identity and authorization context and is invalidated safely when either changes.

### Modified Capabilities

- None.

## Impact

The change affects `src/lib/auth.tsx`, `src/lib/storage.ts`, `src/lib/supabase.ts`, the root/router cache lifecycle, and local browser tests. TanStack Query is instantiated in `src/router.tsx` but the current data hooks use component state and an origin-wide `lustre_*` `localStorage` cache. Supabase Auth uses tab-scoped `sessionStorage`; this avoids shared tokens but means Auth session events do not provide cross-tab cache invalidation. Current per-hook request guards order requests within one hook but do not bind a response to the principal or permission context that started it.

The UI remains subject to PostgreSQL RLS on every remote operation. No database schema or policy changes are intended.
