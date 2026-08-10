# Delta for entity-at-rest-encryption

## MODIFIED Requirements

### Requirement: Encryption absence is a permanent mode only while this device has never completed a login
(Previously: "Encryption absence is a permanent, first-class mode — never an
error" — treated "no roster imported" alone as sufficient for permanent
plaintext, on every device. Revised per design §4/§5: the local device-wrap
table lives in `localStorage`, not IndexedDB, so a completed login writes a
password wrap into it regardless of whether IndexedDB itself works.)

`encryptEntity` MUST return plaintext unchanged, without throwing, ONLY when
BOTH the roster-based predicate (`isEncryptionProvisioned()`) AND the
device-level predicate (`hasDeviceDekWrap()`, reading the local device-wrap
table) are false — i.e. no roster has ever been imported AND no login has
ever completed on this device. Once EITHER becomes true, `encryptEntity`
MUST NOT fall back to plaintext merely for lack of a roster: with a DEK in
memory it MUST encrypt; without one it MUST throw `MissingDataKeyError`
(unchanged ordering, see "encryptEntity — DEK checked before roster state").
IndexedDB being unavailable does NOT keep a device in this passthrough mode
once a login has completed — it only removes the password-free auto-recovery
convenience (`device-dek-wrap`), never the fact that the device now holds a
DEK.

#### Scenario: Pre-first-login device still returns plaintext, never throws
- GIVEN no roster has ever been imported and no login has ever completed on this device
- WHEN `encryptEntity(json)` is called
- THEN it returns `json` unchanged and does not throw

#### Scenario: Any device, after its first completed login, no longer passes through for lack of a roster
- GIVEN a login has completed at least once on this device (roster-based or locally minted DEK), with no roster ever imported
- AND no DEK is set in memory this session
- WHEN `encryptEntity(json)` is called
- THEN it throws `MissingDataKeyError` — it does NOT return plaintext

#### Scenario: Bootstrapped device with no roster encrypts when the DEK is in memory
- GIVEN this device has completed a login and a DEK is set in memory (device wrap or freshly minted)
- AND no roster has ever been imported
- WHEN `encryptEntity(json)` is called
- THEN the result starts with `enc:v1:`
