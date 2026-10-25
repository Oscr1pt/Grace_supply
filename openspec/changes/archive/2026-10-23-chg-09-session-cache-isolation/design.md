# Design

## Context

See `proposal.md` for the motivation and observed cache risks. `src/lib/storage.ts` initializes table state from origin-wide `lustre_*` localStorage keys and writes whole remote rows back to those keys. `src/lib/auth.tsx` restores a profile asynchronously after Supabase Auth events; its per-hook request guards do not carry an identity or permission generation. Auth tokens intentionally use per-tab `sessionStorage`, so tab session changes are not a reliable cache invalidation channel. TanStack Query is instantiated by the router, but the current business data hooks use React state rather than Query.

The frontend remains untrusted. Supabase Auth verifies identity, and PostgreSQL RLS and authorized RPCs decide every remote read and write.

## Goals / Non-Goals

**Goals:**

- Ensure private rows never hydrate from or persist into shared origin storage.
- Bind in-memory data, pending reads, and visible private views to a current identity and permission generation.
- Invalidate views and query state on identity, role, permission, revocation, logout, and cross-tab signals.
- Preserve per-tab credentials and CHG-01/CHG-07 pending, error, idempotency, and reconciliation behavior.

**Non-Goals:**

- Changing Auth identity design, RLS, database schemas, or business operations.
- Broadcasting access or refresh tokens between tabs.
- Persisting financial or customer data offline.
- Introducing a new query/state-management dependency or a broad route/data-layer rewrite.

## Decisions

### Use a monotonically changing session authorization generation

Auth state will expose a stable scope key and generation derived from the verified Auth user ID plus the current profile role and sorted permissions. Auth event handling will reject stale profile loads if a newer event has already arrived. A transition to a different scope will clear the QueryClient, invalidate router loaders, and remount or clear private view state. This is needed because current data is held in hook-local React state and clearing QueryClient alone would not clear those rows.

Alternative considered: key cache entries only by user ID. Rejected because role or permission changes within the same identity must invalidate old views too.

### Remove private row persistence from localStorage

Business tables and views will fetch into memory only. Legacy `lustre_*` keys will be removed on initialization and session transitions. Any retained local settings must be explicitly classified as non-sensitive; the legacy generic storage hook will not be used for private rows.

Alternative considered: namespace localStorage by user ID. Rejected because it leaves sensitive financial/customer data persisted on shared devices and still requires reliable invalidation on revocation.

### Cancel reads and guard every state commit

Each table/view read will capture the session generation and an AbortController. Session transitions abort outstanding reads where the Supabase query builder supports AbortSignal. Before changing state, cache, read-error state, or loading state, the request must confirm both its local request sequence and captured session generation are current. This guards transports that cannot be canceled or that resolve after abort.

Mutations retain existing request IDs, confirmation, and reconciliation logic. A session transition must not blindly retry a mutation; an uncertain financial outcome continues through the current CHG-01 reconciliation path and CHG-07 idempotency key.

### Signal cross-tab invalidation without sharing sessions

Use a small BroadcastChannel message containing only a generic invalidation event (no user identifier, tokens, or row data) after logout, profile permission changes, and local revocation actions. Receivers clear private in-memory data and revalidate their own per-tab Supabase session/profile. Focus/visibility revalidation handles server-side revocation or permission changes that happened elsewhere. If BroadcastChannel is unavailable, the current tab still enforces local scope guards and focus revalidation.

Alternative considered: persist a logout token or broadcast session tokens. Rejected because this would weaken the tab-scoped credential boundary. Cross-tab messages are hints only; every protected operation remains subject to RLS.

### Do not use cached data as authorization

Private UI access is gated by the current verified profile, and server-side RLS remains the final decision for reads and mutations. If revalidation fails or a protected request is denied, the UI clears stale private data and requires renewed authorization; it does not treat the prior cache as permission.

## Risks / Trade-offs

- [Removing local row caching increases repeat reads and makes offline views unavailable] → Keep responses in memory for the active scope and rely on existing page loading states; do not add offline persistence in this change.
- [A background tab can miss a transient broadcast or a server-side role change] → Revalidate on visibility and before private data can be reused after a scope transition; RLS continues to reject unauthorized operations.
- [A request may finish despite cancellation] → Guard every post-await state update with both request sequence and session generation.
- [Clearing a form during account revocation can discard user input] → Keep CHG-01 behavior for ordinary persistence failures; clear private forms only when their authorization scope is no longer valid and show a clear state.

## Migration Plan

1. Remove legacy private `lustre_*` cache entries on app startup and transition, and remove cache hydration/writes from the private table hook.
2. Add scope generation, stale Auth-event protection, request abort/commit guards, and query/router/view invalidation.
3. Add generic cross-tab invalidation and profile revalidation.
4. Run local Auth/RLS and real-browser tests with synthetic identities, including reverse-order and late-response cases, then TypeScript, unit tests, and build.

Rollback is a code rollback only. No schema changes or remote migrations are required; old local cache keys remain ignored and are cleared by the prior cleanup logic.
