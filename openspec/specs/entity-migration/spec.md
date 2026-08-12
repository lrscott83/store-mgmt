# entity-migration Specification

## Purpose

The eager, one-time pass that converts already-stored plaintext business
data to ciphertext on a device the moment it becomes encryption-provisioned
and unlocked, so cold (rarely-read) data does not sit in plaintext
indefinitely under the illusion of protection.

## Requirements

### Requirement: Migration runs only when a DEK is present in memory and never blocks login
`runEntityMigration()` MUST derive its guard from the SAME source as its store scope (below): the in-memory DEK's own store id. It MUST return immediately, touching none of the six entity keys, when that store id is absent (no DEK set this session). It MUST be invoked after a successful DEK acquisition on any of the three points defined in `dek-lifecycle-and-unlock-gate` (both login paths and the startup device-key recovery), wrapped so any failure inside it is swallowed and never propagates to the caller — the worst outcome is "still plaintext," never "cannot log in."

#### Scenario: No DEK in memory — no-op
- GIVEN no DEK is set in memory, regardless of roster state
- WHEN `runEntityMigration()` is called
- THEN none of the six entity keys is read or written

#### Scenario: A failure inside migration does not fail login
- GIVEN a device where migration will throw partway through
- WHEN login completes and triggers migration
- THEN the login call still resolves successfully

### Requirement: Migration is byte-preserving and never routes through service write seams
The pass MUST read each of the six entity keys with a raw `getItem`, and if the value is present and does not already carry the `enc:v1:` marker, re-write it via `encryptEntity` alone. It MUST NOT call `JSON.parse` and MUST NOT call any of the six services' `setXLocalStorage` write methods (those methods apply business-data transforms unrelated to encryption).

#### Scenario: Migrated value decrypts to the identical original string
- GIVEN a plaintext value stored at a business-entity key
- WHEN migration converts it
- THEN decrypting the new stored value with the DEK returns the exact original string, byte-for-byte

### Requirement: Migration is scoped to the in-memory DEK's own store, not the active store
The pass MUST use the in-memory DEK's own store id (`getDekStoreId()`, set whenever the DEK was acquired, whichever of the three sources produced it — this is the SAME value the guard above tests for absence) to scope which entity keys it touches — NOT the current user's `selectedStoreId`, and NOT a roster-only lookup (`getRawRoster().storeId`) that would be absent on a locally-minted-DEK device.

#### Scenario: Active store differs from the DEK's store — foreign store untouched
- GIVEN the in-memory DEK belongs to store A
- AND the current user's `selectedStoreId` is store B
- WHEN migration runs
- THEN only store A's entity keys are read or written; store B's are untouched

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

## Verification Status

- Source change: `at-rest-encryption-frontend` (archived 2026-08-02).
- Verify verdict: BLOCKED overridden by the orchestrator. All 5
  requirements verified true against code (guard confirmed with a real
  `getItem`/`setItem` spy, byte-preserving confirmed by module import
  graph, store-scoping confirmed by grep — zero `user` references in the
  module, idempotency + partial-failure isolation both pinned by tests
  using real `Storage.prototype` spies). The unprovisioned-guard
  requirement's wording was corrected after the initial verify run
  (commit `951f509`) to clarify that the guard's own roster-key read does
  not violate the "touches none of the six entity keys" guarantee; the
  text above is the corrected version. The blocking CRITICAL belongs to
  the sibling `dek-lifecycle-and-unlock-gate` capability's KAT-fixture
  provenance, not to this capability. See this change's archive report
  for the full override rationale.
