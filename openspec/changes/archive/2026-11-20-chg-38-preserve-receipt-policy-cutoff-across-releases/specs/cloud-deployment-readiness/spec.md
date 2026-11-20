## ADDED Requirements

### Requirement: Production releases use the versioned receipt-policy cutoff

The production pipeline MUST use the exact UTC cutoff in versioned release configuration. Operator-provided timestamps MUST NOT approve or override that value.

#### Scenario: Established policy on a later release

- **WHEN** activation is complete and the versioned cutoff is historical
- **THEN** later builds retain that cutoff and do not require it to remain in the future.

#### Scenario: Operator attempts to change the cutoff

- **WHEN** a command-line or environment value is empty, invalid, or differs from the versioned cutoff
- **THEN** the pipeline stops before build or publication.

### Requirement: Initial receipt-policy activation is explicitly gated

A pending first activation MUST require explicit activation mode and a valid future UTC cutoff from versioned source. The pipeline MUST recheck the cutoff immediately before publication.

#### Scenario: First activation uses a future cutoff

- **WHEN** versioned source marks activation pending, the cutoff is valid and future-dated, and activation mode is selected
- **THEN** prebuild and postbuild validate it and the final publish gate confirms it remains future-dated.

#### Scenario: First activation lacks approval or the cutoff expired

- **WHEN** activation mode is absent, the cutoff is invalid, or it is no longer future-dated
- **THEN** the pipeline fails before Cloudflare publication.

### Requirement: Existing production guards remain mandatory

Cutoff validation MUST NOT bypass approved Supabase URL and full public-key checks, auth-chunk and flag validation, privileged-secret scanning, the compiled artifact probe, Wrangler dry-run, or explicit publication authorization.

#### Scenario: Any production guard fails

- **WHEN** Supabase configuration, bundle, compiled probe, or Wrangler dry-run validation fails
- **THEN** the pipeline stops without publication.
