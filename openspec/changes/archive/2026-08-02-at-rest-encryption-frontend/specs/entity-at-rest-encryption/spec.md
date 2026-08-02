# entity-at-rest-encryption Specification

## Purpose

The `enc:v1:` ciphertext envelope for the six business entities (products,
product-categories, inventory-entries, orders, expenses, saleCredits) and
the uniform seam contract that applies it at every `localStorage` read/write
boundary. Owns the permanent plaintext-passthrough guarantee that keeps
optional encryption free on devices that never import a roster.

## Requirements

### Requirement: Encryption absence is a permanent, first-class mode — never an error
On a device that is not encryption-provisioned (no roster, or `formatVersion < 2`), `encryptEntity` MUST return its input unchanged and MUST NOT throw. Login, reads, and writes on such a device MUST behave exactly as before this change. This is a standing hard constraint (offline-auth and at-rest encryption are strictly optional); no requirement in this capability may be satisfied at the cost of it.

#### Scenario: Unprovisioned device writes plaintext, never throws
- GIVEN no roster has ever been imported on this device
- WHEN `encryptEntity(json)` is called
- THEN it returns `json` unchanged
- AND no error is raised

#### Scenario: v1-roster device writes plaintext, never throws
- GIVEN a stored roster with `formatVersion: 1`
- WHEN `encryptEntity(json)` is called
- THEN it returns `json` unchanged

### Requirement: encryptEntity — DEK checked before roster state
`encryptEntity(plaintext)` MUST, in order: (1) if a DEK is present in memory, return `ENTITY_ENVELOPE_PREFIX + base64(iv‖ciphertext‖tag)` with a fresh random 12-byte iv; (2) else if `isEncryptionProvisioned()` is false, return the plaintext unchanged; (3) else throw `MissingDataKeyError`. Step 1 MUST be evaluated first so provisioning state is read from storage only on the locked path.

#### Scenario: DEK present encrypts
- GIVEN a DEK is set in memory
- WHEN `encryptEntity('[{"a":1}]')` is called
- THEN the result starts with `enc:v1:`
- AND decrypting it with the same DEK returns the original string

#### Scenario: Provisioned but locked throws
- GIVEN `isEncryptionProvisioned()` is true and no DEK is set in memory
- WHEN `encryptEntity(json)` is called
- THEN `MissingDataKeyError` is thrown

### Requirement: decryptEntity — permanent marker-based passthrough
`decryptEntity(stored)` MUST: return `null` for `null` input; return `stored` unchanged if it does not start with `ENTITY_ENVELOPE_PREFIX`; otherwise decrypt using the in-memory DEK, throwing `MissingDataKeyError` if none is set. The unmarked passthrough MUST be permanent — never removed or time-boxed — so a partially migrated device (some keys ciphertext, some plaintext) is always readable with no special case.

#### Scenario: Null passes through
- WHEN `decryptEntity(null)` is called
- THEN it returns `null`

#### Scenario: Unmarked value passes through unchanged
- GIVEN a stored value `'[{"a":1}]'` with no `enc:v1:` marker
- WHEN `decryptEntity` is called on it
- THEN the identical string is returned, no decryption attempted

#### Scenario: Marked value with no DEK throws
- GIVEN a stored value starting with `enc:v1:`
- AND no DEK is set in memory
- WHEN `decryptEntity` is called on it
- THEN `MissingDataKeyError` is thrown

#### Scenario: Marked value with the correct DEK round-trips
- GIVEN a value written by `encryptEntity` under a known DEK
- WHEN `decryptEntity` is called with that same DEK in memory
- THEN the original plaintext string is returned exactly

### Requirement: Seam boundary applies uniformly across all six entities
Every read of a business-entity storage key (products, product-categories, inventory-entries, orders, expenses, saleCredits) MUST pass the raw stored value through `decryptEntity` before any sentinel comparison, `||` fallback, or `JSON.parse`. Every write MUST pass the serialized value through `encryptEntity` immediately before storage. No entity MAY apply decryption after a sentinel check or before a different transform than another entity.

#### Scenario: Ciphertext marker present on a provisioned+unlocked write, for each of the six entities
- GIVEN a v2 roster is provisioned and a DEK is set
- WHEN any of the six entities is written to `localStorage`
- THEN the raw stored value for that key starts with `enc:v1:`
- AND reading it back through the owning service returns the original object unchanged (Map/date revival intact)

#### Scenario: Plaintext mode leaves the raw value untouched, for each of the six entities
- GIVEN no roster is provisioned
- WHEN any of the six entities is written to `localStorage`
- THEN the raw stored value is plain JSON, identical to pre-change behavior

### Requirement: A provisioned-but-locked read never destroys existing ciphertext
On a device that is encryption-provisioned with no DEK in memory, an attempt to read an entity that already holds ciphertext MUST NOT result in that key being overwritten with an empty auto-initialized container. The read MUST fail (via `MissingDataKeyError` or an equivalent propagated failure) rather than silently discard the user's data.

#### Scenario: Locked read does not wipe stored ciphertext
- GIVEN a provisioned device with existing `enc:v1:` data at a storage key
- AND no DEK is set in memory
- WHEN the owning service performs its normal read
- THEN the stored ciphertext at that key is unchanged after the read attempt
- AND no empty container is written to that key
