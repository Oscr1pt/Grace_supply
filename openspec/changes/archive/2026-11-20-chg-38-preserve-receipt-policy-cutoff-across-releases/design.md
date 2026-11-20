# Design

## Context

CHG-36's approved cutoff is `2026-11-18T03:18:00.000Z`. Existing lifecycle scripts require a future cutoff at every prebuild, postbuild, and publish gate. The pipeline also accepts the operator's timestamp as its own approval value.

## Goals / Non-Goals

**Goals:** preserve the exact versioned historical cutoff in later releases; require explicit, future-dated activation for a newly approved policy; keep all Supabase and deployment guards intact.

**Non-Goals:** change receipt policy, rewrite historical sales, alter authentication, or modify production.

## Decisions

- Keep the cutoff and whether first activation is pending together in a versioned release module. The current entry is the approved historical cutoff with activation complete.
- Established releases select the versioned cutoff by default and do not compare it to the current time. Any supplied timestamp argument is rejected; environment values must equal the versioned source.
- A future policy Change must version its new cutoff and set activation pending. The release requires the explicit `--activate-receipt-policy` switch and rejects an expired cutoff at build and again immediately before publish. After first activation, that Change records activation as complete for subsequent releases.
- Keep the existing exact Supabase URL/key validation, auth chunk inspection, flags, privileged-secret scan, compiled artifact probe, Wrangler dry-run, and explicit `--publish` gate in the same order.
- Regression tests use a synthetic pending-release record to test initial activation without changing the current historical value.

## Risks / Trade-offs

The versioned activation state must be updated as part of the Change that introduces a new policy. This is deliberately reviewable in Git rather than inferred from arbitrary command-line input. A failed first activation remains pending and cannot silently become an established release.
