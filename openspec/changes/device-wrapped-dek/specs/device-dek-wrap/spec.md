# device-dek-wrap Specification

## Purpose

A single Data Encryption Key (DEK) per device, recoverable in two independent
halves: a non-extractable WebCrypto `CryptoKey` that lives ONLY in IndexedDB,
and a local wrap table (device-key-wrapped ciphertext plus per-user password
wraps) that lives in `localStorage`. Gives every device — roster-provisioned
or not — a DEK once its first login completes, recovered silently on reload
when the device-key half works, and shared identically by every user of that
device. Owns the once-per-device DEK-source decision and its safe,
non-blocking handling of a later disagreement.

## Requirements

### Requirement: A non-extractable device key, and a local wrap table, together form the device wrap
The system MUST generate, at most once per device, a non-extractable
AES-GCM `CryptoKey`, persisted ONLY in IndexedDB, and use it to wrap the
device's DEK. The wrapped-DEK ciphertext itself, and every per-user password
wrap, MUST be persisted in a local wrap table in `localStorage` — NEVER in
IndexedDB, so that the recovery material survives an IndexedDB failure or
eviction. The raw device-key bytes MUST NEVER be exported or leave WebCrypto.

#### Scenario: Device key and wrap table established once, reused after
- GIVEN no device key and no local wrap table exist yet on this device
- WHEN the first login on this device completes
- THEN a non-extractable device key is persisted in IndexedDB and a wrapped-DEK entry is persisted in the local wrap table
- AND a subsequent login/reload reuses both, neither is regenerated

### Requirement: The DEK source is decided once per device
On a device with no existing local wrap table, the first successful login
MUST establish this device's DEK by unwrapping the logging-in user's roster
wrap if one exists (v2 roster, wrap fields present for that login), or
otherwise by generating 32 fresh random bytes. This decision MUST happen
exactly once per device and MUST NOT be revisited by later logins.

#### Scenario: First boot, no roster, no prior DEK — mints a local DEK
- GIVEN no roster has ever been imported and no local wrap table exists
- WHEN the first login on this device succeeds
- THEN a fresh 32-byte DEK is generated, wrapped under the new device key, and wrapped under this user's password
- AND `getDek()` is non-null afterward

#### Scenario: First boot, roster carries this user's wrap — reuses it as the device DEK
- GIVEN a v2 roster with a wrap entry for the logging-in user, and no local wrap table yet
- WHEN login succeeds
- THEN the device DEK equals the roster-unwrapped bytes
- AND a device-key wrap of those same bytes is persisted

### Requirement: A working device-key wrap serves every subsequent login and reload on that device
Once a device-key wrap exists AND the device key itself is usable, it MUST
be the primary DEK source: recovered silently (no password) on any reload
with a valid session, and reused — not re-derived, not re-minted — by any
other user's successful login on that same device, including a user absent
from the roster.

#### Scenario: Reload with a valid token and no password recovers the DEK
- GIVEN a device already holding a working device-key wrap
- WHEN the app reloads with a valid session token
- THEN `getDek()` is non-null with no password prompt and no redirect to `/login?unlock=1`

#### Scenario: A second user on an already-provisioned device shares the same DEK
- GIVEN device A already holds a working device-key wrap from user A's login
- WHEN user B logs in successfully on that same device
- THEN `getDek()` after user B's login equals the exact same bytes as user A's DEK
- AND no second device key is created; user B's own password wrap is added to the local wrap table

#### Scenario: A user absent from the roster still ends up with a DEK, via a working device-key wrap
- GIVEN a device already holds a working device-key wrap
- AND the logging-in user has no wrap entry in the roster and no prior password wrap on this device
- WHEN that user's login succeeds
- THEN it resolves without error and `getDek()` is non-null — closing the previously-uncaught `MissingDataKeyError` gap for this, the common case

### Requirement: Password wraps stay synchronized with the device DEK
A password change, while the DEK is in memory, MUST re-wrap the CURRENT
device DEK under the new password before the session's DEK is cleared,
REPLACING (not adding to) this user's entry in the local wrap table. A login
whose stored password wrap no longer matches the credentials used (changed
elsewhere), on a device that already holds a device DEK, MUST succeed by
recovering the DEK (from the device-key wrap, or from any other still-valid
wrap in the table) and MUST regenerate that user's password wrap, rather
than failing.

#### Scenario: Password change re-wraps the current DEK
- GIVEN a user with a DEK in memory changes their password successfully
- WHEN the re-wrap step runs, strictly before the subsequent logout clears the DEK
- THEN this user's entry in the local wrap table now holds a wrap of the SAME DEK under the new password, replacing the old entry
- AND the device-key wrap is unchanged

#### Scenario: Out-of-band password change recovers via the device DEK
- GIVEN the password was changed on another device, leaving a stale roster/table wrap here
- AND this device already holds a device DEK (device-key wrap or another valid entry)
- WHEN this user logs in here
- THEN login succeeds by recovering the already-established device DEK
- AND a fresh password wrap is regenerated for this user under the credentials just used

### Requirement: A disagreeing roster DEK is detected and recorded, never adopted, and never blocks the login
If a roster's unwrapped DEK for a user differs from this device's
already-established DEK, the system MUST NOT overwrite the device DEK and
MUST NOT re-encrypt existing data — the existing device DEK MUST remain in
memory and the login MUST proceed and succeed normally. The system MUST
durably record that a disagreement was detected, for a later reconciliation
change to consume. Reconciling the two DEKs (re-keying) is explicitly
deferred to a follow-up change; this requirement covers detection and safe
refusal to swap only.

#### Scenario: Conflicting roster DEK is recorded, not adopted, login proceeds
- GIVEN a device DEK already established
- AND a roster arrives whose wrap for this user unwraps to DIFFERENT bytes
- WHEN this user logs in
- THEN the device DEK is NOT replaced and existing ciphertext remains readable under it
- AND the login succeeds, with the disagreement durably recorded for later reconciliation

### Requirement: Device-key/IndexedDB failure degrades to a password prompt, never fabricates a key and never crashes
If IndexedDB is unavailable, the persisted device key cannot be read, or
unwrapping the device-key wrap fails, the system MUST NOT crash and MUST NOT
invent a DEK from nothing. It MUST still resolve a DEK for the current login
from whatever this device CAN recover: this login's own password wrap in the
local table, the roster wrap, or — if this device has never held any wrap at
all — a freshly minted local DEK. The device MUST NOT fall back to being
unprovisioned/plaintext merely because the device-key half is broken; the
only user-visible consequence MUST be losing the password-free reload.

#### Scenario: IndexedDB unavailable on a device with no prior state — DEK still minted, not auto-recoverable later
- GIVEN IndexedDB is unavailable and this device has never held a local wrap table entry
- AND no roster wrap exists for the logging-in user
- WHEN a first login succeeds
- THEN a local DEK is minted and password-wrapped into the local table, `getDek()` is non-null
- AND the next reload requires this user's password again — the device-key half never existed to recover it silently

#### Scenario: Device key destroyed after prior provisioning — this user's password recovers it
- GIVEN the device key is gone but this login's own password wrap already exists in the local wrap table
- WHEN login is attempted with the correct password
- THEN it succeeds and recovers the exact same DEK bytes as before
- AND a fresh device-key wrap is written if IndexedDB is available again

#### Scenario: No recoverable wrap anywhere for this login — refused cleanly, not an uncaught crash
- GIVEN this device's local wrap table holds no entry for this login, its device key is unusable, and the roster has no entry for this login either
- WHEN this user attempts to log in
- THEN login is refused with a distinguishable error — narrower than, and never an uncaught crash unlike, today's `MissingDataKeyError`
