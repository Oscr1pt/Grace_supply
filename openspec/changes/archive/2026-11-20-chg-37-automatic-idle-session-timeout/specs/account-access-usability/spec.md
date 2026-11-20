## ADDED Requirements

### Requirement: Accessible idle-expiry warning and continuation

The system MUST show an accessible modal warning after 115 idle minutes, with a live remaining-time value and the action «Continuar sesión». The warning MUST NOT itself count as activity. Trusted activity or explicit continuation before expiry MUST reset the tab-local idle deadline and close the warning. The message MUST explain that unsubmitted changes may be lost when the session expires.

#### Scenario: Continue before expiry

- **WHEN** the user chooses «Continuar sesión» before the deadline
- **THEN** the tab records fresh activity, closes the warning, and preserves the verified session without requesting credentials.

#### Scenario: Idle expiry notice

- **WHEN** the tab expires and reaches login
- **THEN** login shows «Tu sesión se cerró por inactividad. Inicia sesión nuevamente» and does not imply that server-side JWT revocation was confirmed.
