# Delta for auth-login-e2e

Delta for change `login-wrapped-dek`: new E2E coverage for the
login-delivered wrapped DEK. Purely additive — new files only; existing E2E
tests and support files MUST NOT be modified.

## ADDED Requirements

### Requirement: E2E — StoreUser and OwnerAdmin receive byte-compatible wraps

The suite MUST include a new `AuthLoginDekWrapTests` class in a NEW file
`backend/src/SMCA.WebApi.E2ETests/Auth/AuthLoginDekWrapTests.cs` with
`[Fact]`s proving a StoreUser and an OwnerAdmin each receive HTTP 200 with
non-empty `wrappedDek`/`wrapSalt`/`wrapIv`, and that a LOCAL `UnwrapDek`
helper (PBKDF2 + AES-GCM) in the new file recovers bytes byte-equal to
`IStoreDataKeyProvider.GetDek(storeId)`. The new file MUST define its own
unwrap helper and response DTO — `ExportOfflineRosterTests.cs` and
`TestDtos.cs` MUST NOT be modified.

#### Scenario: StoreUser login wrap equals the roster DEK

- GIVEN a StoreUser seeded via AuthzSeed.SeedStoreUserAsync (SelectedStoreId and pre-hash set)
- WHEN login returns HTTP 200
- THEN the three fields are non-empty and unwrap to GetDek(storeId) bytes

#### Scenario: OwnerAdmin login wrap equals the roster DEK

- GIVEN an OwnerAdmin with a resolvable store DEK
- WHEN login returns HTTP 200
- THEN the three fields are non-empty and unwrap to GetDek bytes

### Requirement: E2E — first-login backfill delivers the wrap

The suite MUST include a `[Fact]` seeding a user WITHOUT a pre-hash,
logging in, and asserting the response wrap fields are non-empty AND the
persisted `OfflinePasswordPreHash` is non-null.

#### Scenario: First login backfills and wraps in one request

- GIVEN a StoreUser seeded without OfflinePasswordPreHash
- WHEN login succeeds
- THEN the response wrap fields are non-empty and the DB pre-hash is non-null

### Requirement: E2E — empty fields on no store; no key on failed logins

The suite MUST include `[Fact]`s asserting a SuperAdmin login returns HTTP
200 with all three wrap fields empty, invalid credentials return 401, and
an inactive-store login returns 403 — both failures with no AuthDto.

#### Scenario: SuperAdmin gets empty wrap fields

- GIVEN a SuperAdmin seeded without SelectedStoreId
- WHEN login returns HTTP 200
- THEN wrappedDek/wrapSalt/wrapIv are all empty

#### Scenario: Failed logins deliver no key

- GIVEN invalid credentials or a deactivated store
- WHEN login is attempted
- THEN the response is 401 or 403 with no AuthDto data

### Requirement: E2E — cleanup removes the seeded graph

Each new `[Fact]` MUST clean up via `AuthzSeed.CleanupStoreGraphAsync` /
`CleanupTenantCascadeAsync`, matching existing Auth E2E conventions.

#### Scenario: Store graph rows are removed after each test

- GIVEN any new AuthLoginDekWrapTests `[Fact]` completes
- WHEN cleanup runs the AuthzSeed cleanup helper
- THEN Store, StoreUser, Owner, and User rows are removed in FK-safe order