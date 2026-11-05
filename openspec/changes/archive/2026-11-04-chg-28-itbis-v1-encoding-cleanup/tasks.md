# Tasks

## 1. UTF-8 Spanish copy

- [x] 1.1 Correct confirmed mojibake in React screens, Edge Functions, validation messages, receipts, tests, and templates without changing behavior or historical data; verify with a targeted scan and accented-copy tests.

## 2. Simplified V1 ITBIS settings

- [x] 2.1 Replace the redundant approval card/action with the single «Aplicar ITBIS» setting beside the 18% rate and general business settings, preserving disabled-by-default behavior, supported classifications, accessible states, and clear internal-receipt wording; verify the focused settings/browser tests.

## 3. Authorized backend and integration QA

- [x] 3.1 Adapt the authorized persistence boundary and PostgreSQL posting predicate for disabled/18% modes, retaining audit, idempotency, stock, atomicity, and snapshots; verify authorized/denied users, reload persistence, ITBIS on/off sales, and run `npm test`, Auth/RLS, Playwright, TypeScript, ESLint, build, `git diff --check`, and OpenSpec strict on disposable local data.

## Workflow follow-up

- Archive and publish only after the implementation and validations pass; keep commercial/tax-law approval documented as a separate prerequisite.
