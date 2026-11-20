# Proposal

## Why

The CHG-36 receipt-policy cutoff is already in effect, but the protected production pipeline currently treats every release as an initial activation and rejects that historical cutoff. Future frontend releases need to preserve the exact cutoff so historical receipts retain the correct policy without weakening Supabase bundle checks.

## What Changes

- Store the approved receipt-policy cutoff and activation state in versioned source.
- Permit established releases to reuse the exact historical cutoff without a future-date requirement.
- Require explicit activation mode and a future versioned cutoff when a new policy is first activated.
- Reject operator-supplied cutoff overrides and keep all existing Supabase key, URL, bundle, probe, and Wrangler gates mandatory.

## Capabilities

### Modified Capabilities

- `cloud-deployment-readiness`: define safe receipt-policy cutoff handling for production builds and deployments.

## Impact

Production build guard, build/deploy scripts, pipeline regression tests, and this OpenSpec capability. No receipt behavior, database, Supabase Cloud, or authentication logic changes.
