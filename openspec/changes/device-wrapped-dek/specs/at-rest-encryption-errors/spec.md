# Delta for at-rest-encryption-errors

## ADDED Requirements

### Requirement: A device/roster DEK conflict is not a user-visible error
Detecting that a roster's DEK disagrees with this device's already-established
DEK (`device-dek-wrap`) MUST NOT raise any exception that reaches the login
caller and MUST NOT map to any i18n key or banner. It is a silently and
durably recorded, non-blocking condition — deliberately different from every
other entry in this capability's error taxonomy, all of which surface via
`DekUnwrapError`/`AUTH.UNLOCK_FAILED`. Refusing the login on a conflict is
explicitly rejected: the device's data stays readable under its own DEK, and
blocking login would make that data inaccessible for no gain.

#### Scenario: Conflict detection produces no user-visible error
- GIVEN a device DEK already established, and a roster wrap that unwraps to different bytes
- WHEN login is attempted
- THEN the login call resolves successfully with no thrown error and no i18n message rendered

### Requirement: Device-key/IndexedDB failure surfaces as DekUnwrapError only when no wrap can be recovered for this login
Per the device-wrap failure taxonomy: when the device key is missing/unusable
or its wrap's ciphertext is corrupt, unwrapping simply falls back to any
OTHER wrap this device holds for the logging-in user (their own entry in the
local wrap table, or the roster). A `DekUnwrapError` (mapped to the existing
`AUTH.UNLOCK_FAILED` copy) MUST be raised ONLY when NEITHER the local wrap
table NOR the roster holds any wrap recoverable for this specific login.
IndexedDB being unavailable on a device that has never held any wrap MUST
NOT raise any error at all — a local DEK is still minted and password-wrapped
into the local table; the only user-visible consequence is a password prompt
on every future reload instead of silent recovery.

#### Scenario: First-ever login with IndexedDB unavailable — no error, DEK still minted
- GIVEN this device has never held a local wrap-table entry, and IndexedDB is unavailable
- AND no roster wrap exists for this user (local-mint path)
- WHEN login is attempted
- THEN it succeeds with no error shown, and `getDek()` is non-null afterward

#### Scenario: No recoverable wrap anywhere for this login — DekUnwrapError
- GIVEN this device's local wrap table holds entries for OTHER logins only, its device key is unusable, and no roster wrap exists for this login
- WHEN login is attempted
- THEN it rejects with a `DekUnwrapError`-named error and the form renders `AUTH.UNLOCK_FAILED`
