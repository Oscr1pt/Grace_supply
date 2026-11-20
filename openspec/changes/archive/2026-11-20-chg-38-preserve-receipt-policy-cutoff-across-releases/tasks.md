# Tasks

## 1. Versioned policy release contract

- [x] 1.1 Add the approved cutoff and activation state as versioned source; verify that normal releases resolve to the unchanged CHG-36 cutoff.
- [x] 1.2 Add resolver coverage for established releases, explicit future activation, expired activation, invalid source values, and rejected operator overrides.

## 2. Protected build and deploy flow

- [x] 2.1 Update prebuild, postbuild, build, and deploy stages to use the versioned release contract; verify historical releases pass while activation mode remains future-gated.
- [x] 2.2 Preserve Supabase exact-key, auth-chunk, flag, bundle, compiled-probe, Wrangler dry-run, and explicit-publish gates; verify a bad key and a bypass attempt stop before publish.

## 3. Integrated verification

- [x] 3.1 Build and inspect a production artifact with the exact historical cutoff; verify the effective auth client configuration and all focused tests.
- [x] 3.2 Validate this Change with OpenSpec strict and run `git diff --check`.
