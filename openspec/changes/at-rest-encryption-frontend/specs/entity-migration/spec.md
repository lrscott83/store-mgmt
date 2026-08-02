# entity-migration Specification

## Purpose

The eager, one-time pass that converts already-stored plaintext business
data to ciphertext on a device the moment it becomes encryption-provisioned
and unlocked, so cold (rarely-read) data does not sit in plaintext
indefinitely under the illusion of protection.

## Requirements

### Requirement: Migration runs only when provisioned and never blocks login
`runEntityMigration()` MUST return immediately, performing no reads or writes, when `isEncryptionProvisioned()` is false. It MUST be invoked after a successful DEK unwrap on both login paths, wrapped so that any failure inside it is swallowed and never propagates to the caller — the worst outcome is "still plaintext," never "cannot log in."

#### Scenario: Unprovisioned device — no-op
- GIVEN `isEncryptionProvisioned()` is false
- WHEN `runEntityMigration()` is called
- THEN no `localStorage` key is read or written

#### Scenario: A failure inside migration does not fail login
- GIVEN a provisioned device where migration will throw partway through
- WHEN login completes and triggers migration
- THEN the login call still resolves successfully

### Requirement: Migration is byte-preserving and never routes through service write seams
The pass MUST read each of the six entity keys with a raw `getItem`, and if the value is present and does not already carry the `enc:v1:` marker, re-write it via `encryptEntity` alone. It MUST NOT call `JSON.parse` and MUST NOT call any of the six services' `setXLocalStorage` write methods (those methods apply business-data transforms unrelated to encryption).

#### Scenario: Migrated value decrypts to the identical original string
- GIVEN a plaintext value stored at a business-entity key
- WHEN migration converts it
- THEN decrypting the new stored value with the DEK returns the exact original string, byte-for-byte

### Requirement: Migration is scoped to the roster's store, not the active store
The pass MUST use `getRawRoster().storeId` to scope which entity keys it touches, NOT the current user's `selectedStoreId`. This prevents a super-admin whose active store differs from the roster's store from having a foreign store's data encrypted under a DEK that does not belong to it.

#### Scenario: Active store differs from roster store — foreign store untouched
- GIVEN a v2 roster scoped to store A
- AND the current user's `selectedStoreId` is store B
- WHEN migration runs
- THEN only store A's entity keys are read or written
- AND store B's entity keys are untouched

### Requirement: Migration is idempotent and skips absent keys
Running migration any number of times MUST produce the same end state as running it once. A key already carrying the `enc:v1:` marker MUST be left untouched. A key with no stored value MUST be skipped — migration MUST NOT create a key the user never wrote to.

#### Scenario: Running migration twice is a no-op the second time
- GIVEN migration has already converted all six keys
- WHEN `runEntityMigration()` is called again
- THEN no `setItem` call occurs for any of the six keys

#### Scenario: Untouched entity stays absent
- GIVEN a user has never written to the `expenses` key
- WHEN migration runs
- THEN the `expenses` key remains absent afterward (not created as an empty encrypted container)

### Requirement: Partial failure and interruption are per-key isolated
A failure converting one key (quota exceeded, storage error) MUST NOT prevent the remaining keys from being attempted. Because `setItem` is atomic per key, a failed conversion MUST leave that key's prior plaintext value intact and readable via the permanent passthrough; the next successful unlock retries it.

#### Scenario: One key fails, the rest still convert
- GIVEN migration will throw while converting the third of six keys
- WHEN `runEntityMigration()` runs
- THEN the other five keys are converted
- AND the third key's original plaintext value is unchanged and still readable

#### Scenario: Interrupted pass leaves a mixed but fully readable device
- GIVEN migration is interrupted after converting some keys but not others
- WHEN any of the six entities is subsequently read
- THEN both the already-converted and not-yet-converted keys return their correct data with no error
