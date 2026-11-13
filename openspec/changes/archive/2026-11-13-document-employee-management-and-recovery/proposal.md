# Proposal

## Why

The employee management redesign and the revoked-account recovery hotfix were delivered after CHG-21 and CHG-22 had already been archived. Their canonical specifications cover the surrounding access controls but omit several observable UI and recovery behaviors, leaving the published implementation without a complete current contract.

## What Changes

- Refine the employee administration contract to document the compact table, name/username search, account-state filters, details modal, and context-sensitive activation/revocation.
- Refine administrative recovery behavior for private links, HTTP 409 on inactive or Auth-blocked accounts, reactivation before retry, and separation from password-link errors.
- Record that password recovery does not activate accounts or change roles/permissions, and that the public email recovery flow is disabled by the current production configuration.
- Record publication and verification evidence in this follow-up’s historical design notes. No application code, database, or production configuration changes are included.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `account-access-usability`: document contextual activation/revocation and the current disabled state of public email recovery.
- `secure-user-creation-editing`: document the compact employee administration interface and administrator-assisted password recovery behavior.

## Impact

Documentation only: delta specs for the two existing capabilities, this proposal, design, and tasks. CHG-21 and CHG-22 archive contents remain unchanged; no application code, APIs, database objects, Cloud configuration, or user data are modified.
