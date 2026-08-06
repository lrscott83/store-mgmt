# offline-roster-bundle Specification

## Purpose

Bundle schema, verifier parameters, the encrypted container round-trip,
device-local persistence with expiry/anti-replay guards, and the
`isRosterProvisioned()` mode predicate that `offline-auth-mode` reads. This
capability is purely mechanical storage/crypto — it does not decide *when*
offline auth is used, only whether the device currently has a usable roster.

## Requirements

### Requirement: Verifier parameters are pinned by known-answer vectors
The offline verifier MUST use PBKDF2-HMAC-SHA256, 210000 iterations, a
16-byte Base64 salt, a 32-byte Base64 derived key, with PBKDF2 input equal to
the UTF-8 bytes of `Base64(SHA256(password))`. These constants MUST be
covered by fixed known-answer test vectors so any drift (frontend or
backend) fails a test, not a user's login.

#### Scenario: SHA-256 known-answer vector
- GIVEN the input string `"test"`
- WHEN `sha256Base64` is computed
- THEN the result equals `n4bQgYhMfWWaL+qgxVrQFaO/TxsrC4Is0V1sFbDwCgg=`

#### Scenario: Verifier accepts only the matching password
- GIVEN a verifier derived from a fixed salt, 210000 iterations, and password `"secret"`
- WHEN verification runs with `"secret"`
- THEN it returns true
- WHEN verification runs with `"wrong"`
- THEN it returns false

### Requirement: Bundle container round-trips losslessly
The bundle MUST serialize to a single-entry (`roster.json`) AES-encrypted
zip whose password is the concatenation `` `${master}${storeId}` `` (master
first). Deserializing with the correct master and storeId MUST reproduce
the original bundle exactly; a wrong master MUST raise `WrongPasswordError`;
a structurally invalid file MUST raise `CorruptFileError`.

#### Scenario: Round-trip preserves the bundle
- GIVEN a bundle serialized with master `"m"` and storeId `"s1"`
- WHEN it is deserialized with the same master and storeId
- THEN the resulting bundle deep-equals the original

#### Scenario: Wrong master is rejected
- GIVEN a bundle serialized with master `"m"`
- WHEN deserialization is attempted with master `"wrong"`
- THEN `WrongPasswordError` is raised and no bundle is returned

### Requirement: isRosterProvisioned() mode predicate
The system MUST expose `isRosterProvisioned()`, true if and only if a
stored bundle exists, is well-formed, and its `expiresAt` is strictly in the
future relative to the current time. An expired, absent, or corrupt stored
bundle MUST make this predicate false — it MUST NOT throw.

#### Scenario: Provisioned with a valid bundle
- GIVEN a stored bundle with `expiresAt` in the future
- WHEN `isRosterProvisioned()` is called
- THEN it returns true

#### Scenario: Expired bundle is not provisioned
- GIVEN a stored bundle whose `expiresAt` has passed
- WHEN `isRosterProvisioned()` is called
- THEN it returns false

### Requirement: Anti-replay on roster import
Importing a bundle MUST reject: (a) an `expiresAt` already in the past at
import time, (b) a `bundleId` matching the last successfully imported
bundle, or (c) an `issuedAt` less than or equal to the last imported
bundle's `issuedAt`. A strictly newer bundle (later `issuedAt`, new
`bundleId`) MUST replace the stored roster.

#### Scenario: Re-importing the same bundle is rejected
- GIVEN a bundle was already imported
- WHEN the identical bundle is imported again
- THEN `ReplayBundleError` is raised and storage is unchanged

#### Scenario: An older-issued bundle is rejected
- GIVEN a bundle with `issuedAt = 1000` was imported
- WHEN a different bundle with `issuedAt <= 1000` is imported
- THEN `ReplayBundleError` is raised

#### Scenario: Importing an already-expired bundle is rejected
- GIVEN a bundle whose `expiresAt` is already in the past
- WHEN it is imported
- THEN `ExpiredBundleError` is raised and nothing is persisted

### Requirement: Roster storage module has no top-level side effects
The module implementing roster storage MUST NOT read or write
`localStorage` (or any other side-effecting resource) at import time. It is
loaded via a dynamic `import()` on every login submission, including
submissions from users who never provisioned a device; any top-level side
effect would run unconditionally on every login and violate the
unprovisioned-device-unchanged invariant owned by `offline-auth-mode`.

#### Scenario: Importing the module performs no storage access
- GIVEN a `localStorage` spy is installed
- WHEN the roster storage module is imported (and no exported function is called)
- THEN zero reads and zero writes are recorded against the spy

### Requirement: Bundle carries optional per-user wrap fields; formatVersion stays a plain number
`OfflineRosterBundle` MUST accept three additional optional per-user fields — `wrappedDek`, `wrapSalt`, `wrapIv` — mirroring the backend's `OfflineRosterUserDto`. `formatVersion` MUST remain typed as `number`, NOT narrowed to a `1 | 2` union: the bundle is deserialized with an unchecked cast, and narrowing would silently mistype a future `formatVersion: 3` bundle as a known value. Shape validation MUST continue to accept a bundle with the three wrap fields absent or empty.

`OfflineRosterUser.verifier` MUST be typed `OfflineVerifier | null`, not the non-nullable `OfflineVerifier` it was before `formatVersion: 3`. Shape validation MUST additionally accept `verifier: null` on a `formatVersion: 3` bundle for a user with no server-side pre-hash yet (added by `offline-password-verifier`, archived 2026-08-06, corresponding to `offline-auth` R5).

#### Scenario: v1 bundle without wrap fields is still a valid shape
- GIVEN a stored bundle with `formatVersion: 1` and no `wrappedDek`/`wrapSalt`/`wrapIv` on any user
- WHEN the bundle shape is validated
- THEN it is accepted as valid, exactly as before this change

#### Scenario: v2 bundle with wrap fields is a valid shape
- GIVEN a stored bundle with `formatVersion: 2` and every user carrying non-empty `wrappedDek`/`wrapSalt`/`wrapIv`
- WHEN the bundle shape is validated
- THEN it is accepted as valid

#### Scenario: v3 bundle with a null verifier is a valid shape
- GIVEN a stored bundle with `formatVersion: 3` and one user whose `verifier` is `null`
- WHEN the bundle shape is validated
- THEN it is accepted as valid, and `verifier` remains `null` (not coerced to an empty object)

#### Scenario: v3 bundle with a populated verifier is still valid
- GIVEN a stored bundle with `formatVersion: 3` and every user carrying a non-null `verifier`
- WHEN the bundle shape is validated
- THEN it is accepted as valid, exactly as before this change

### Requirement: Genuine cross-stack DEK-wrap known-answer vector (replaces the placeholder)

The frontend KAT fixture consumed by `dek-unwrap.kat.test.ts`
(`__tests__/__fixtures__/dek-kat.json`) MUST be replaced with the literal
field values committed in `docs/contracts/offline-roster-dek-kat.json`
(provenance `dotnet-backend`) — it MUST NOT remain a `node-transcription`
placeholder that only proves the frontend's math is self-consistent. Both
`dek-unwrap.kat.test.ts` (frontend) and `StoreKeyWrapInteropTests` (backend,
`offline-auth` R18) MUST read their respective copy of the same committed
values. Each side MUST additionally, independently, assert that the
vector's persisted pre-hash field equals `Base64(SHA256(UTF8(vector.password)))`
computed by that stack's own primitives — a permanent, cross-stack guard
against the exact class of drift (backend and frontend agreeing on a wire
format but disagreeing on what feeds it) that caused this defect.

#### Scenario: Frontend KAT test unwraps the shared vector
- GIVEN the committed vector's `wrapSalt`, `wrapIv`, `wrappedDek`, `iterations`, and pre-hash field
- WHEN `unwrapDek` derives the KEK from the vector's pre-hash and decrypts `wrappedDek`
- THEN the recovered bytes equal the vector's `expectedDek` byte for byte

#### Scenario: Frontend independently verifies the pre-hash formula
- GIVEN the committed vector's `password` and pre-hash field
- WHEN the frontend computes `sha256Base64(vector.password)`
- THEN it equals the vector's pre-hash field exactly

#### Scenario: Backend independently verifies the same formula
- GIVEN the same committed vector, read on the backend side
- WHEN the backend computes `Base64(SHA256(UTF8(vector.password)))`
- THEN it equals the vector's pre-hash field exactly (cross-referenced with `offline-auth` R18's
  equivalent assertion — the same claim proven twice, once per stack, from the same file)

#### Scenario: A frontend-only regression in sha256Base64 fails this test without a live backend
- GIVEN a hypothetical change to `sha256Base64`'s encoding or digest step
- WHEN the KAT test runs
- THEN it fails locally, with no backend or network dependency required to catch the regression

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

## Verification Status

- Source change: `offline-auth-frontend` (archived 2026-07-29).
- Verify verdict: PASS WITH WARNINGS, 0 CRITICAL. All requirements in this
  capability are covered by dedicated, non-mocked-crypto tests (KAT vectors,
  round-trip, anti-replay, purity guard). See the archived verify report for
  detail.
- Source change (addendum): `at-rest-encryption-frontend` (archived
  2026-08-02) added the three "Bundle carries optional per-user wrap
  fields" / `getRawRoster()` / `isEncryptionProvisioned()` requirements
  above. Verify verdict: BLOCKED overridden by the orchestrator — see that
  change's archive report for the override rationale (WU3.3 backend-KAT
  provenance gap; not a code defect).
- Source change (addendum): `offline-password-verifier` (archived
  2026-08-06) widened "Bundle carries optional per-user wrap fields" to a
  nullable `verifier`, and added "Genuine cross-stack DEK-wrap known-answer
  vector" — closing the exact gap the previous addendum's override flagged
  (no cross-stack KAT vector had ever existed; `dek-kat.json` was a
  self-labelled `node-transcription` placeholder). Verify verdict: PASS
  WITH WARNINGS, 0 CRITICAL (1 unrelated doc-drift WARNING on `tasks.md`,
  resolved at archive time).
