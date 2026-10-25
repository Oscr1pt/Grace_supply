# Grace Supply Auth and RLS Implementation Plan

> **For agentic workers:** Follow the three tracked OpenSpec tasks in each Change; do not add more than three primary tasks to either Change.

**Goal:** Replace legacy table-password login and client-controlled sessions with Supabase Auth, then enforce least-privilege access in local PostgreSQL.

**Architecture:** Keep CHG-04 and CHG-05 as separate OpenSpec Changes with a shared local integration gate. CHG-04 links Auth UUIDs to the existing CHG-03 `user_profiles` table, authenticates usernames through a server-only Supabase Edge Function, and derives client state from a verified Auth user plus RLS-protected profile. CHG-05 adds explicit grants, RLS policies, and narrow read projections; unauthenticated and revoked identities remain denied.

**Tech Stack:** React, TypeScript, `@supabase/supabase-js`, Supabase Auth/Edge Functions, PostgreSQL migrations and Node integration tests.

**Spec:** `openspec/changes/chg-04-auth-identity-migration/` and `openspec/changes/chg-05-rls-least-privilege/`.

## Global Constraints

- Use only the local Supabase project configured in `supabase/config.toml`; no Cloud or previous project operations.
- Never expose `service_role` or another privileged key to browser code.
- Do not enable public admin registration or trust local profile/role data as authority.
- Keep the password recovery channel decision pending; do not add recovery behavior before the ownership model is decided.
- Preserve the CHG-03/CHG-06 schema contract and the existing local files.
- Keep each OpenSpec Change at exactly three primary tasks.

## Review Focus

- Username lookup must not disclose whether an account exists; test generic errors for unknown, inactive and bad-password cases.
- A persisted browser profile must never restore authority after refresh; test Auth revalidation and forged session data.
- Profile revocation must deny requests with a still-valid access token; test against REST/PostgreSQL.
- Anonymous and permission-limited roles must not read private columns or mutate financial records; test both allowed and denied REST calls.
- A confirmed write must be visible on a subsequent authorized database read; test with a real local Auth identity.

## Task 1: CHG-04 identity and authentication

- Add an additive migration for profile integrity and server authorization helpers without altering CHG-03/06 definitions.
- Add username login Edge Function with generic failure responses and server-only credentials.
- Replace password-table lookups, public admin registration and localStorage role sessions with Supabase Auth sessions plus verified profile fetch.
- Add failing tests for old login authority and new username/Auth behavior; verify them before implementation.
- Record password recovery as disabled pending an approved ownership model.

## Task 2: CHG-05 least-privilege policy

- Add explicit authenticated grants and per-resource RLS policies backed by current active profile permissions.
- Keep anon/revoked denied; keep direct financial posting and protected fields closed until their authorized operation exists.
- Expose only explicitly approved projections for indirect sales lookups.
- Add failing integration assertions for anon, employee module boundaries, admin and revoked roles before migration application.

## Task 3: coordinated local verification

- Apply only new migrations to the running local Supabase instance; do not reset or seed over existing local data.
- Run real Auth identities through username login and REST authorization checks, including CHG-01 confirmed write/readback and RLS denial.
- Run TypeScript, build, unit/integration tests, and strict OpenSpec validation for both Changes and CHG-01.
- Mark tasks complete only after each task's full acceptance evidence exists; leave unresolved criteria unchecked.
