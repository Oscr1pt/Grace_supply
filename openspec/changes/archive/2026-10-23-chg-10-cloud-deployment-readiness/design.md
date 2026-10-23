# Design

## Context

See `proposal.md` for motivation. The repository has 15 installable migrations in `supabase/migrations`; `supabase/legacy-migrations/20261020120000_chg00_anonymous_containment.sql` is intentionally outside that sequence. A source scan found no migration that needs existing test users or business transactions. The initial schema migration inserts the fixed settings singleton with `ON CONFLICT DO NOTHING`; this is schema initialization, not a fixture dependency. `supabase/config.toml` currently enables seeding and references missing `supabase/seed.sql`.

The current local Supabase stack may contain test state and is named `supabase_db_jewel-sales-hub`. Existing CHG-00/03 scripts use `db reset --local`; CHG-10 verification must not run them against that stack. The Cloud project's actual migration history, schema, Auth users, SMTP, domain, and secrets have not been inspected in this work.

`manage-profile` requires an active administrator before it can invite or activate accounts, so it cannot create the first administrator. It already creates employee Auth invitations and inactive profiles with server-side service credentials, while a database trigger blocks activation until Auth confirms the email. Cloud recovery and provisioning flags remain disabled until configuration is verified.

## Goals / Non-Goals

**Goals:**

- Rebuild all installable migrations twice in a throwaway Supabase stack and compare schema signatures without touching the existing local stack.
- Make seed behavior explicit, inventory migration versions/dependencies, and verify there is no dependency on synthetic local business rows.
- Provide a one-time, operator-only first-admin runbook that links a Supabase Auth identity to an inactive profile, activates it only after email verification, blocks duplicates, and can resume safely after partial failure.
- Prepare a Cloud runbook for the exact development project ref, history comparison, dry run, configuration inventory, acceptance checks, and stop conditions.

**Non-Goals:**

- Reading or changing Supabase Cloud in this Change, applying remote migrations, deploying Edge Functions, changing Cloud secrets, or touching the legacy project.
- Resetting the existing local Supabase stack or deleting local business/test data.
- Enabling production sales, email recovery, or employee provisioning; approving tax rules or production configuration.

## Decisions

### Isolated clean rebuild and migration inventory

- Run the full migration sequence in a disposable local Supabase work directory with a unique `project_id`, isolated Docker project and non-conflicting ports. Copy only the required config, migration files and SQL assertions. Build twice, compare the resulting schema signature, and check all 15 versions in order. Tear down only containers/volumes bearing that throwaway project identity. Refuse to start if the chosen work directory or Docker project resolves to the existing local stack.
- Keep `20261020120000_chg00_anonymous_containment.sql` documented as legacy-only; it is not in the installable migration sequence.
- Disable `[db.seed]` while `supabase/seed.sql` is absent. Do not add default commercial or account data. Auth identities and business rows belong in isolated test fixtures created for the specific scenario.
- Inventory the ordered migration chain as follows:

  | Order | Version | Scope / dependency |
  |---:|---|---|
  | 1–2 | `20261021041426`, `20261021043648` | CHG-00 containment baseline and function default revocations |
  | 3 | `20261022000000` | CHG-03/06 domain schema and integrity constraints |
  | 4–11 | `20261022190000`, `20261022191000`, `20261022193000`, `20261022200000`, `20261022200500`, `20261022201000`, `20261022202000`, `20261022210000` | CHG-04/05 Auth profiles, RLS/grants, guards and provisioning compensation; depends on the domain schema |
  | 12–13 | `20261022220000`, `20261022221000` | CHG-07 atomic business operations and stock correction; depends on Auth/RLS and integrity constraints |
  | 14–15 | `20261022230000`, `20261022231000` | CHG-08 audit, annulment and expense operations; depends on atomic operations |

- Check each migration's preconditions and the final schema, grants, RLS, functions and migration history. The fixed settings singleton is an explicit schema default; the clean rebuild must prove it does not rely on rows from the existing local database.

### First-admin bootstrap

- Choose a manual, one-time trusted operator procedure using Supabase Dashboard Auth invitation and SQL Editor, rather than a public bootstrap endpoint or a permanent service-role credential in an application. The Dashboard/SQL Editor is the privileged context; no service-role key is placed in frontend code, build variables, or a committed file.
- First verify the approved project and that `public.user_profiles` is empty. Invite the owner's individually controlled email through Supabase Auth. In one SQL transaction, take a fixed transaction-scoped advisory lock, verify the Auth UUID exists and there are no profiles, then insert a profile with role `admin` and `active = false`. Unique profile constraints plus the lock make repeated or concurrent bootstrap attempts fail closed.
- After the invitee follows the verified Auth link, run a second guarded SQL transaction. Confirm the same Auth UUID has `email_confirmed_at`, the matching profile is still inactive, and no administrator has already been activated; then set `active = true`. The existing `user_profiles_require_confirmed_identity` trigger remains authoritative.
- If profile insertion fails after Auth invitation, leave the pending identity in Auth and resume using that same UUID after inspecting the cause; do not send a second invite blindly. If activation fails, leave the profile inactive and retry only after the email and identity checks pass. Any unexpected profile, duplicate, or identity state stops the procedure for owner review. Once activated, the empty-profile precondition prevents reusing bootstrap; all later account administration goes through the existing `manage-profile` flow.
- Test the exact invitation, profile link, activation, duplicate/concurrent attempt, and failure/retry paths using synthetic identities in the disposable local stack and local Mailpit. Keep Cloud recovery/provisioning flags false throughout these tests and until SMTP/redirect verification is separately complete.

### Cloud preflight and configuration

- Document these commands with the approved ref literal, but do not execute them as part of CHG-10:

  ```powershell
  supabase link --project-ref qazjfofpfcwopcefupjl
  supabase migration list --linked
  supabase db push --dry-run --linked
  ```

- `link` selects the project for subsequent CLI operations; `migration list` compares local and linked histories; `db push --dry-run` previews pending migrations without applying them. Supabase documents the `--dry-run` flag and the explicit `--project-ref` link flow in its [CLI reference](https://supabase.com/docs/reference/cli) and [local development workflow](https://supabase.com/docs/guides/local-development/cli-workflows). Treat even read-only remote inspection as requiring the owner's separate authorization. Never use `db reset --linked`, `migration repair`, or a real `db push` under this Change.
- Stop if the ref is not exact, remote history is absent or unexpected, versions diverge, a dry run includes an unreviewed migration, the remote has unknown drift/data, or the operator cannot establish a safe backup and recovery plan. Do not infer that the new Cloud project is empty from the local repo.
- Record two disjoint environments: Cloud development uses only its own URL, publishable key, test identities, exact HTTPS site origin and redirect allowlist; production remains a separate future environment with separate secrets and domain. Keep `ACCOUNT_PROVISIONING_ENABLED=false`, `ACCOUNT_RECOVERY_ENABLED=false`, `VITE_ACCOUNT_PROVISIONING_ENABLED=false` and `VITE_ACCOUNT_RECOVERY_ENABLED=false` until their independent gates pass.
- Configuration inventory for the readiness report:
  - Frontend build: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, plus the two `VITE_ACCOUNT_*_ENABLED` flags. Only the publishable key may be included in a browser bundle.
  - Edge Functions: confirm platform-provided `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`; keep the service-role value server-only. Configure `APP_PUBLIC_ORIGIN`, exact comma-separated `APP_ALLOWED_ORIGINS`, and both account flags as secrets/settings. `manage-profile` requires JWT verification; `username-login` and `username-recovery` have gateway JWT verification disabled and must retain their in-function validation and rate-limit controls.
  - Supabase Auth dashboard: disable public signup and anonymous sign-in; set the exact HTTPS Site URL and only required redirect paths, including `/reset-password` and the approved invitation flow.
  - SMTP: verify provider, host, port, username, secret password, sender email/name, DNS authentication and delivery before sending real Cloud invitations or recovery mail. Do not commit these values or print them in evidence.
  - Still owner-supplied: approved development HTTPS domain/redirect URLs, SMTP provider and sender, per-employee recovery mailbox policy, and confirmation of project emptiness/history. Production values are explicitly out of scope.

### Readiness acceptance

- Keep the report's verdict at **not ready for Cloud deployment** until the migration preflight, bootstrap, Auth/RLS/Edge configuration, post-deployment checks, backup/recovery decision and owner approvals are evidenced.
- The future post-deployment checklist covers anon/employee/admin/revoked RLS probes; Auth invite/login/recovery and revocation; cross-session cache isolation; transaction rollback/concurrency/idempotency; immutable audit and annulment reconciliation; Edge Function JWT/CORS/secrets; and no privileged key in client bundles.
- Sales remain blocked until an owner approves tax rate, tax-included pricing, calculation and rounding rules. Local fixtures using zero tax do not qualify as approval.

## Risks / Trade-offs

- [A test command attaches to or resets the existing local stack] → use a generated work directory and distinct Docker project/ports; validate every target before starting and never reuse `db reset --local` from the current project.
- [A partial first-admin invitation leaves an unlinked Auth user] → use a two-phase inactive-profile procedure with a recorded Auth UUID and explicit resume/cleanup instructions; never retry by creating another identity automatically.
- [Dashboard SQL bypasses application RLS] → limit the runbook to the named owner/operator, review exact SQL and UUID before execution, use transaction guards, keep the profile inactive until email confirmation, and capture a non-secret audit record.
- [The Cloud project's actual state differs from the clean-project assumption] → require explicit ref confirmation and read-only history/preflight after approval; stop on any unknown object, migration, data or drift.
- [A successful dry run is mistaken for approval or deployment] → clearly separate preparation, remote authorization, applying migrations, deploying Functions, and post-deployment acceptance as different gates.
- [SMTP/domain gaps block first-admin invitation and recovery] → keep recovery/provisioning disabled and require verified email delivery and exact redirects before opening those flows.
- [No approved tax policy] → retain the sales block even if infrastructure and security checks pass.

## Migration Plan

1. Implement and run the isolated full-chain rebuild and SQL contract checks; disable the missing seed reference; capture migration inventory and clean-rebuild evidence.
2. Add the operator runbook and local-only bootstrap harness; verify invitation, activation, duplicate refusal, partial failure and safe resume with synthetic Auth/Mailpit data.
3. Update the Cloud readiness report with exact inspection commands, configuration inventory, checks and unresolved decisions. No Cloud command is executed in this Change.
4. Before any later remote operation, obtain separate owner authorization naming the exact project and operation. If migration history or dry-run output is unexpected, stop and revise the plan; do not reset or repair remote history.
5. After a separately authorized deployment, run the post-deployment checklist and keep sales/recovery/provisioning disabled until their specific business and email gates pass.

## Open Questions

- Owner must provide the development HTTPS origin, exact redirect paths, SMTP provider/sender, and employee recovery mailbox policy before those Cloud settings can be verified.
- The linked Cloud project's emptiness and migration history remain unknown until a separately authorized read-only inspection.
- Tax and rounding policy remain owner decisions; sales cannot be enabled by this Change.
