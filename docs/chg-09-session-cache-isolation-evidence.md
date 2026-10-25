# CHG-09 session cache isolation evidence

Date: 2026-10-23  
Environment: local Supabase only; synthetic Auth identities and records; Chromium. No Cloud configuration or database migrations were changed.

## Audit findings

- `src/lib/storage.ts` previously loaded and saved whole private table rows under origin-wide `lustre_*` localStorage keys. A second identity in the same browser origin could hydrate those rows before a fresh server response.
- Supabase Auth stores its credentials in per-tab `sessionStorage`; that correctly avoids sharing credentials, but did not invalidate React state in another tab.
- Business reads use hook-local React state. The router has a QueryClient but there are no private-data route loaders. Clearing only QueryClient would therefore leave private rows mounted.
- The previous read revision guard ordered requests within one hook but did not bind their results to identity and permission scope. Auth profile fetches could also resolve after a newer Auth event.
- PostgreSQL RLS/RPC remains the authorization boundary. This change only prevents stale or cross-identity UI state from being shown; it does not treat browser cache state as permission.

## Corrections

- Private tables and views are memory-only. Legacy `lustre_*` keys are cleared, and no private table rows hydrate from or persist to browser storage.
- Data requests capture identity/role/permission scope and request revision, use `AbortSignal`, and reject stale responses before committing data, errors, or loading state.
- Auth/profile changes are sequenced. A late profile failure from the old identity cannot sign out or overwrite the newly verified identity. Private React views are remounted on scope changes; QueryClient is cleared and router loaders invalidated.
- Other tabs receive only a generic invalidation hint. They revalidate their own tab-scoped session/profile; credentials and row data are never broadcast. Focus/visibility also triggers revalidation.
- Financial writes retain CHG-01 confirmation/reconciliation and CHG-07 idempotency behavior. Reads can be canceled; a pending financial write is not blindly retried or treated as canceled after an uncertain outcome.
- No SQL, RLS policy, grant, or schema changes were needed.

## Verification results

| Verification | Result |
|---|---:|
| Focused scope helper tests | 2/2 passed |
| Chromium browser suite (CHG-01 financial persistence + CHG-09 session isolation) | 17/17 passed |
| CHG-09 Chromium scenarios | 7/7 passed: stale local data, delayed A response, A logout/B login, late profile error, two tabs, permission update, revocation |
| Supabase local Auth/RLS PostgreSQL integration | 22/22 passed, including invite/recovery, revoked identity, RLS, and late-write reconciliation |
| CHG-07/08 local financial PostgreSQL integration | 20/20 passed, including atomicity, rollback, concurrency, idempotency, audit and annulment |
| `npm test` | 23 passed, 0 failed |
| `npx tsc --noEmit` | passed |
| `npm run build` | passed; existing Vite/Rolldown informational warnings remain |
| `openspec validate --changes --strict` | 1 passed, 0 failed |
| `git diff --check` | passed; Git emitted only existing LF-to-CRLF working-copy warnings |

Browser tests use local loopback Supabase only. The Auth/RLS suite requires `LOCAL_MAILPIT_URL=http://127.0.0.1:54324`; its first run without that test environment variable stopped two email-delivery checks. Rerunning with local Mailpit configured passed all 22 scenarios. The first browser run also exposed three outdated assumptions: two asserted that private rows should remain in localStorage, and one assumed a fixed starting inventory quantity. The assertions now verify no private localStorage entry and check inventory relative to its pre-operation database value; the rerun passed all 17 scenarios.

No known CHG-09 acceptance criteria remain unverified in this local environment. Cross-tab invalidation is a hint and per-tab revalidation can depend on focus scheduling; RLS remains authoritative for every remote operation.
