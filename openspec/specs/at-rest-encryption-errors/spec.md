# at-rest-encryption-errors Specification

## Purpose

The error taxonomy for at-rest encryption — where each error is raised,
whether it reaches the user, and its exact Spanish copy — with special
attention to the one path that must fail loudly: a DEK-unwrap failure on
the online login path.

## Requirements

### Requirement: DekUnwrapError on the offline path maps to a login-form error
`DekUnwrapError` raised inside `authenticateOffline` (AES-GCM tag rejection, parameter drift, or a corrupt bundle — the offline verifier has already passed, so the password is confirmed correct) MUST be caught by the existing offline error-id dispatcher and mapped to `AUTH.UNLOCK_FAILED`, rendered on the login form.

#### Scenario: Offline unwrap failure shows the unlock-failed message
- GIVEN a provisioned device whose wrap parameters no longer match the roster's password
- WHEN offline login is attempted with the correct offline credentials
- THEN the login form shows `AUTH.UNLOCK_FAILED`
- AND the user is not authenticated

### Requirement: DekUnwrapError on the online path MUST fail the login, not be swallowed
A `DekUnwrapError` raised during the DEK unwrap inside `auth-store.login` (which runs after successful `/me` hydration) MUST cause the login call to reject/rethrow. It MUST NOT be silently caught and treated as a successful login. Swallowing it would authenticate the user with `needsUnlock` permanently true on this device, causing an infinite `authLoader` → `/login` → "successful" login → `authLoader` loop.

#### Scenario: Online unwrap failure fails the login call
- GIVEN a v2 roster entry for this user wrapped under a different (older) password
- WHEN online `login(login, password)` is called with credentials that pass the server-side check
- THEN the `login` call rejects with a `DekUnwrapError`-named error
- AND the user is not left authenticated in a state where `needsUnlock` is permanently true

#### Scenario: Online unwrap failure surfaces the same unlock-failed message
- GIVEN the online path's `login` call rejects with `DekUnwrapError`
- WHEN the login form's catch handler processes it
- THEN it renders `AUTH.UNLOCK_FAILED`, the same message id as the offline path

### Requirement: A device/roster DEK conflict is not a user-visible error
Detecting that a roster's DEK disagrees with this device's already-established DEK (`device-dek-wrap`) MUST NOT raise any exception that reaches the login caller and MUST NOT map to any i18n key or banner. It is a silently and durably recorded, non-blocking condition — deliberately different from every other entry in this capability's error taxonomy, all of which surface via `DekUnwrapError`/`AUTH.UNLOCK_FAILED`. Refusing the login on a conflict is explicitly rejected: the device's data stays readable under its own DEK, and blocking login would make that data inaccessible for no gain.

#### Scenario: Conflict detection produces no user-visible error
- GIVEN a device DEK already established, and a roster wrap that unwraps to different bytes
- WHEN login is attempted
- THEN the login call resolves successfully with no thrown error and no i18n message rendered

### Requirement: Device-key/IndexedDB failure surfaces as DekUnwrapError only when no wrap can be recovered for this login
Per the device-wrap failure taxonomy: when the device key is missing/unusable or its wrap's ciphertext is corrupt, unwrapping simply falls back to any OTHER wrap this device holds for the logging-in user (their own entry in the local wrap table, or the roster). A `DekUnwrapError` (mapped to the existing `AUTH.UNLOCK_FAILED` copy) MUST be raised ONLY when NEITHER the local wrap table NOR the roster holds any wrap recoverable for this specific login. IndexedDB being unavailable on a device that has never held any wrap MUST NOT raise any error at all — a local DEK is still minted and password-wrapped into the local table; the only user-visible consequence is a password prompt on every future reload instead of silent recovery.

#### Scenario: First-ever login with IndexedDB unavailable — no error, DEK still minted
- GIVEN this device has never held a local wrap-table entry, and IndexedDB is unavailable
- AND no roster wrap exists for this user (local-mint path)
- WHEN login is attempted
- THEN it succeeds with no error shown, and `getDek()` is non-null afterward

#### Scenario: No recoverable wrap anywhere for this login — DekUnwrapError
- GIVEN this device's local wrap table holds entries for OTHER logins only, its device key is unusable, and no roster wrap exists for this login
- WHEN login is attempted
- THEN it rejects with a `DekUnwrapError`-named error and the form renders `AUTH.UNLOCK_FAILED`

### Requirement: MissingDataKeyError is a programming-error guard, not a user-visible error
`MissingDataKeyError` MUST NOT be assigned an i18n message and MUST NOT reach a user-facing banner in normal operation — the unlock gate (`dek-lifecycle-and-unlock-gate`) is responsible for preventing any data screen from being reached while a device is provisioned-but-locked.

#### Scenario: No i18n key exists for MissingDataKeyError
- GIVEN the i18n dictionary
- WHEN searched for a key mapped from `MissingDataKeyError`
- THEN none exists

### Requirement: Corrupt ciphertext with a valid DEK degrades like today's corrupt-JSON path
A GCM authentication failure inside `decryptEntity` (tampered or corrupted stored ciphertext, DEK otherwise valid) MUST propagate out of `decryptEntity` uncaught by this capability, letting each entity's existing corrupt-JSON handling (swallow + auto-init) apply exactly as it does for unparsable plaintext today.

#### Scenario: Tampered ciphertext degrades like corrupt JSON
- GIVEN a stored `enc:v1:` value whose bytes have been tampered with
- AND the correct DEK is set in memory
- WHEN the owning service performs its normal read
- THEN it degrades identically to today's corrupt-JSON auto-init path (no new error surface introduced by this change)

### Requirement: The unlock banner and failure copy are the exact ratified Spanish strings
When `/login` is reached with `?unlock=1`, the login form MUST render the `AUTH.UNLOCK_REQUIRED` banner. On a `DekUnwrapError` from either login path, the form MUST render `AUTH.UNLOCK_FAILED`. Both keys MUST use exactly the ratified copy, matching this repo's single-locale (Rioplatense Spanish) convention.

| Key | Copy |
|---|---|
| `AUTH.UNLOCK_REQUIRED` | "Ingresá tu contraseña para desbloquear los datos de este dispositivo." |
| `AUTH.UNLOCK_FAILED` | "No se pudieron desbloquear los datos de este dispositivo. Si cambiaste tu contraseña, pedí una nueva activación." |

#### Scenario: ?unlock=1 renders the unlock-required banner
- GIVEN the user navigates to `/login?unlock=1`
- WHEN the login form renders
- THEN it displays exactly the `AUTH.UNLOCK_REQUIRED` copy above

#### Scenario: A DekUnwrapError renders the unlock-failed banner
- GIVEN either login path rejects with a `DekUnwrapError`-named error
- WHEN the login form's error handler runs
- THEN it displays exactly the `AUTH.UNLOCK_FAILED` copy above

## Verification Status

- Source change: `at-rest-encryption-frontend` (archived 2026-08-02).
- Verify verdict: BLOCKED overridden by the orchestrator. All 5
  requirements in this capability verified true against code (offline and
  online dispatch confirmed, `MissingDataKeyError` confirmed unmapped, exact
  Spanish copy confirmed verbatim). The blocking CRITICAL belongs to the
  sibling `dek-lifecycle-and-unlock-gate` capability's KAT-fixture
  provenance, not to this capability. See this change's archive report for
  the full override rationale.
