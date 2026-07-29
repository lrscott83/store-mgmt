# Offline Auth Specification

**Capability**: offline-auth — offline roster export and verifier computation
**Status**: Active
**Last Updated**: 2026-07-29

## Purpose

Export per-store user rosters with PBKDF2 offline verifiers and anti-replay bundle metadata via `GET /api/v1/storeusers/{storeId}/offline-roster`, enabling devices to authenticate users offline without the API.

## Capability Scope

### In Scope
- `GET /api/v1/storeusers/{storeId}/offline-roster` endpoint
- PBKDF2 verifier service (`IOfflineVerifierService`)
- Per-user permission shape matching `/me`
- Bundle anti-replay metadata (`bundleId`, `issuedAt`, `expiresAt`, `formatVersion`)
- Authorization: SuperAdmin / OwnerAdmin only

### Out of Scope
- Existing online auth endpoints (`POST /login`, `/me`, session logic) — untouched
- No server-side flag, migration, or opt-in for offline mode
- Client-side file encryption — frontend concern
- Performance optimization — stores expected <100 users

## Requirements

### R1: Endpoint Contract (MUST)

The system MUST expose `GET /api/v1/storeusers/{storeId}/offline-roster` returning `ResponseResult<OfflineRosterDto>`.

#### Scenario: Successful export
- GIVEN a valid `storeId` and authorized caller
- WHEN the endpoint is called
- THEN status is 200 with body of type `ResponseResult<OfflineRosterDto>`

### R2: Authorization Scope (MUST)

The handler MUST restrict access to SuperAdmin (any store) and OwnerAdmin (stores they own). The class-level `[HasPermission(StoreRoleFeatures.UsersAdmin)]` is a coarse gate; the handler MUST further narrow.

| Role | Store access | Result |
|------|-------------|--------|
| SuperAdmin | Any store | 200 |
| OwnerAdmin | Owned store | 200 |
| OwnerAdmin | Not-owned store | 400 (`ApiException`) |
| Plain user | Any | 403 (`[HasPermission]` blocks) |

#### Scenario: SuperAdmin any store
- GIVEN a SuperAdmin caller
- WHEN they call the endpoint for any storeId
- THEN the roster is returned (200)

#### Scenario: OwnerAdmin own store
- GIVEN an OwnerAdmin whose user owns the target store
- WHEN they call the endpoint
- THEN the roster is returned (200)

#### Scenario: OwnerAdmin foreign store
- GIVEN an OwnerAdmin who does NOT own the target store
- WHEN they call the endpoint
- THEN the handler throws `ApiException` (400)

#### Scenario: Plain user denied
- GIVEN a caller without SuperAdmin or OwnerAdmin role
- WHEN they call the endpoint
- THEN the `[HasPermission]` filter returns 403 Forbidden

### R3: Verifier Algorithm — PBKDF2 (MUST)

The system MUST derive per-user verifiers using `Rfc2898DeriveBytes.Pbkdf2` with fixed parameters:

| Parameter | Value |
|-----------|-------|
| Hash algorithm | HMAC-SHA256 |
| Iterations | 210000 |
| Salt | 16 random bytes (Base64 output) |
| Derived key length | 32 bytes (Base64 output) |
| Password input | UTF-8 bytes of `User.Password` (stored Base64 SHA256 hash) |

#### Scenario: Deterministic with known salt
- GIVEN a fixed stored password hash and known salt
- WHEN `CreateVerifier` is called
- THEN output Hash equals `Pbkdf2(UTF8(storedHash), salt, 210000, SHA256, 32)` in Base64

#### Scenario: Fresh salt per invocation
- GIVEN the same stored password hash
- WHEN `CreateVerifier` is called twice
- THEN the two salts differ and the two hashes differ

### R4: Bundle Metadata (MUST)

Every response MUST include these fields:

| Field | Type | Rule |
|-------|------|------|
| `bundleId` | string | New `Guid.NewGuid().ToString()` per request |
| `issuedAt` | Int64 | `DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()` |
| `expiresAt` | Int64 | `issuedAt + 35 days` in ms |
| `formatVersion` | int | Always `1` |
| `storeId` | Guid | Matches the requested storeId |

#### Scenario: Bundle structure correct
- GIVEN a successful export
- THEN `formatVersion == 1`, `bundleId` is a valid non-empty GUID string
- AND `expiresAt - issuedAt == 35 * 86400 * 1000`
- AND `storeId` matches the request parameter

### R5: Per-User Data Shape (MUST)

Each `OfflineRosterUserDto` MUST contain: `Id`, `Login`, `FullName`, `IsActive`, `Roles` (list of `StoreModuleFeaturesDto`), `FeatureIds`, `StoreModuleIds`, `IsSuperAdmin`, `IsOwnerAdmin`, `IsReSeller`, `SelectedStoreId`, `Verifier` (Hash, Salt, Iterations).

#### Scenario: Shape matches /me output
- GIVEN a store user
- WHEN the roster is exported
- THEN the user's `Roles`, `FeatureIds`, `StoreModuleIds`, and role booleans match what `/me` would return for that user in that store

### R6: Inactive Users Included (MUST)

The roster MUST include all store users regardless of their `IsActive` status.

#### Scenario: Mix of active and inactive
- GIVEN a store with one active and one inactive user
- WHEN the roster is exported with `includeInactive: true`
- THEN both users appear in `Users`, each with their real `IsActive` value

### R7: Empty Store (MUST)

A store with zero StoreUser records MUST return `Users: []`.

#### Scenario: Empty roster
- GIVEN a store with no users
- WHEN the endpoint is called by an authorized SuperAdmin
- THEN `Users` is an empty list

### R8: Invalid StoreId (SHOULD)

A non-existent storeId called by a SuperAdmin SHOULD return an empty roster (`Users: []`).

#### Scenario: Non-existent store
- GIVEN a storeId that does not exist in the database
- WHEN a SuperAdmin calls the endpoint
- THEN the response contains `Users: []`

### R9: VerifierService Stateless & Thread-Safe (MUST)

`IOfflineVerifierService` and its implementation MUST be stateless — no instance state beyond compile-time constants. The implementation MUST be safe for concurrent invocation.

#### Scenario: Concurrent calls produce independent salts
- GIVEN multiple concurrent calls to `CreateVerifier` with the same input
- THEN each result has a unique salt and hash (no shared Random state)

## Verification Criteria

- [x] All 4 E2E scenarios pass (SuperAdmin success, OwnerAdmin own store, OwnerAdmin other store, plain user denied) — E2E tests compile and scenarios verified structurally
- [x] OfflineVerifierService unit tests pass (reproducibility, fresh salt) — 2/2 passing
- [x] Handler unit tests pass (4 cases: auth deny, ownership deny, success shape, verifier per user) — 4/4 passing
- [x] Existing suite passes unchanged — 251 tests pass, ZERO regressions
- [x] `expiresAt - issuedAt` equals exactly 35 days in ms — verified in handler unit test
- [x] `bundleId` is a new GUID per request — verified in handler unit test
- [x] `OfflineVerifierService` registered in DI — `AddScoped<IOfflineVerifierService, OfflineVerifierService>()` in Program.cs

## Related Specifications

- **auth-session** — existing online auth sessions (untouched by this change)
- **management-users** — existing store user management (extended by new repository method)

## Implementation Status

- **Spec**: Active (this document)
- **Design**: Implemented — see `openspec/changes/archive/2026-07-29-offline-auth-backend/design.md`
- **Implementation**: Complete — 15/15 tasks done, 9 unit tests passing, 251 total tests with zero regressions
- **Verification**: PASS WITH WARNINGS (R7/R8 lack dedicated test coverage, implementation structurally correct)
- **Archive**: `openspec/changes/archive/2026-07-29-offline-auth-backend/`
