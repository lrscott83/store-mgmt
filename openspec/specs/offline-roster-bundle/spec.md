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

## Verification Status

- Source change: `offline-auth-frontend` (archived 2026-07-29).
- Verify verdict: PASS WITH WARNINGS, 0 CRITICAL. All requirements in this
  capability are covered by dedicated, non-mocked-crypto tests (KAT vectors,
  round-trip, anti-replay, purity guard). See the archived verify report for
  detail.
