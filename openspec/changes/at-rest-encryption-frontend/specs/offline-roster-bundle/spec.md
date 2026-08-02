# Delta for offline-roster-bundle

## ADDED Requirements

### Requirement: Bundle carries optional per-user wrap fields; formatVersion stays a plain number
`OfflineRosterBundle` MUST accept three additional optional per-user fields — `wrappedDek`, `wrapSalt`, `wrapIv` — mirroring the backend's `OfflineRosterUserDto`. `formatVersion` MUST remain typed as `number`, NOT narrowed to a `1 | 2` union: the bundle is deserialized with an unchecked cast, and narrowing would silently mistype a future `formatVersion: 3` bundle as a known value. Shape validation MUST continue to accept a bundle with the three wrap fields absent or empty.

#### Scenario: v1 bundle without wrap fields is still a valid shape
- GIVEN a stored bundle with `formatVersion: 1` and no `wrappedDek`/`wrapSalt`/`wrapIv` on any user
- WHEN the bundle shape is validated
- THEN it is accepted as valid, exactly as before this change

#### Scenario: v2 bundle with wrap fields is a valid shape
- GIVEN a stored bundle with `formatVersion: 2` and every user carrying non-empty `wrappedDek`/`wrapSalt`/`wrapIv`
- WHEN the bundle shape is validated
- THEN it is accepted as valid

### Requirement: getRawRoster() — expiry-ignoring raw bundle read
The system MUST expose `getRawRoster()`, returning the shape-guarded stored bundle regardless of `expiresAt`, or `null` if absent/corrupt/malformed. It MUST never throw and MUST NOT take a `now` parameter. `getRoster()`'s existing contract (null past `expiresAt`) MUST be preserved unchanged, defined as `getRawRoster()` plus one expiry comparison.

#### Scenario: Raw read ignores expiry
- GIVEN a stored bundle whose `expiresAt` is in the past
- WHEN `getRawRoster()` is called
- THEN the bundle is returned (not null)
- AND `getRoster()` called on the same stored bytes still returns null

#### Scenario: No stored bundle
- GIVEN no bundle is stored
- WHEN `getRawRoster()` is called
- THEN it returns null and does not throw

### Requirement: isEncryptionProvisioned() — device-level encryption mode predicate
The system MUST expose `isEncryptionProvisioned()`, true if and only if `getRawRoster()` returns a non-null bundle with `formatVersion >= 2` AND at least one user entry carries a non-empty `wrappedDek`. This predicate MUST NOT honor `expiresAt` — an expired v2 bundle still means the on-disk data is ciphertext. It MUST NOT call `getRoster()`.

#### Scenario: Expired v2 bundle is still encryption-provisioned
- GIVEN a stored v2 bundle with wrap fields whose `expiresAt` has passed
- WHEN `isEncryptionProvisioned()` is called
- THEN it returns true

#### Scenario: v1 bundle is not encryption-provisioned
- GIVEN a stored bundle with `formatVersion: 1`
- WHEN `isEncryptionProvisioned()` is called
- THEN it returns false

#### Scenario: No bundle at all is not encryption-provisioned
- GIVEN no roster has ever been imported on this device
- WHEN `isEncryptionProvisioned()` is called
- THEN it returns false
