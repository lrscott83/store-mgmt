# auth-login-wrapped-dek Specification

## Purpose

Login response (AuthDto) delivers the store DEK wrapped with the user's
password pre-hash to ANY authenticated user — no admin permission —
byte-compatible with the offline-roster wrap and empty-on-failure.
Encryption becomes independent of authentication mode.

## Requirements

### Requirement: Login delivers the wrapped store DEK to any authenticated user

The login response MUST include `wrappedDek`/`wrapSalt`/`wrapIv` (wire
`wrappedDek`/`wrapSalt`/`wrapIv`, default `""`) for every authenticated
user regardless of admin permission, wrapping
`IStoreDataKeyProvider.GetDek(SelectedStoreId)` via
`IStoreKeyWrapService.WrapDek`. The roster export MUST remain unchanged.

#### Scenario: StoreUser login receives a non-empty wrap

- GIVEN an authenticated StoreUser with SelectedStoreId and a stored pre-hash
- WHEN login succeeds
- THEN all three fields are non-empty and unwrap to GetDek(storeId) bytes

#### Scenario: No admin permission is required

- GIVEN an authenticated user without any admin role
- WHEN login succeeds
- THEN the three wrap fields are non-empty

### Requirement: Wrap input is the decrypted stored pre-hash (roster parity)

The KEK input MUST be the pre-hash decrypted from the stored
`OfflinePasswordPreHash` envelope via `IOfflinePreHashProtector.Unprotect`
— NEVER `User.Password` (Argon2id PHC). The delivered wrap MUST be
byte-compatible with the same user's offline-roster wrap.

#### Scenario: Login wrap is byte-compatible with the roster wrap

- GIVEN a user with a stored pre-hash envelope and SelectedStoreId
- WHEN login and roster wraps are computed for the same user
- THEN both unwrap with the same pre-hash to identical DEK bytes

### Requirement: Wrap is computed after the pre-hash backfill

The wrap MUST be produced after the `OfflinePasswordPreHash` backfill so a
first login whose envelope was just created also receives the key.

#### Scenario: First login receives the key

- GIVEN a user with no stored pre-hash before login
- WHEN login succeeds and the backfill runs
- THEN the response carries non-empty wrap fields from the fresh envelope

### Requirement: Wrap failures degrade to empty fields; login never fails

Any failure — null re-queried user, null pre-hash, `SelectedStoreId ==
Guid.Empty`, Unprotect/WrapDek throwing — MUST yield all three fields empty
and MUST NOT fail the login (HTTP 200). Register and Refresh responses MUST
keep the fields empty.

#### Scenario: SuperAdmin receives empty fields

- GIVEN a SuperAdmin with SelectedStoreId Guid.Empty
- WHEN login succeeds
- THEN all three fields are empty and the response is HTTP 200

#### Scenario: Corrupt envelope degrades to empty

- GIVEN a stored envelope whose Unprotect throws
- WHEN login succeeds
- THEN all three fields are empty and the response is HTTP 200

#### Scenario: Register and Refresh deliver no wrap

- GIVEN a successful register or refresh call
- THEN the AuthDto wrap fields are empty