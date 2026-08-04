# Offline Auth Specification

**Capability**: offline-auth — offline roster export and verifier computation
**Status**: Active
**Last Updated**: 2026-08-04

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
| `issuedAt` | Int64 | `IDateTimeProvider.UtcNow.ToUnixTimeMilliseconds()` |
| `expiresAt` | Int64 | `issuedAt + TTL days` in ms, where TTL = `GetOfflineRosterTtlDaysAsync()` (default `35`) |
| `formatVersion` | int | Always `3` |
| `storeId` | Guid | Matches the requested storeId |

(Previously: `expiresAt` hardcoded `issuedAt + 35 days`; `formatVersion` always `2`; clock read directly.)

#### Scenario: Bundle structure correct
- GIVEN a successful export
- THEN `formatVersion == 3`, `bundleId` is a valid non-empty GUID string
- AND `expiresAt - issuedAt == TTL * 86400 * 1000` for the configured TTL
- AND `storeId` matches the request parameter

### R5: Per-User Data Shape (MUST)

Each `OfflineRosterUserDto` MUST contain: `Id`, `Login`, `FullName`, `IsActive`, `Roles` (list of `StoreModuleFeaturesDto`), `FeatureIds`, `StoreModuleIds`, `IsSuperAdmin`, `IsOwnerAdmin`, `IsReSeller`, `SelectedStoreId`, `Verifier` (Hash, Salt, Iterations), `WrappedDek`, `WrapSalt`, `WrapIv`, `PaymentDueDate`, `IsInTrial`, `PaymentStatus`, `WrapIterations`.

(Previously: no billing snapshot fields, no `WrapIterations`.)

#### Scenario: Shape matches /me output
- GIVEN a store user
- WHEN the roster is exported
- THEN the user's `Roles`, `FeatureIds`, `StoreModuleIds`, and role booleans match what `/me` would return for that user in that store

#### Scenario: Wrap fields populated in version 3
- GIVEN a store with at least one user after encryption backend
- WHEN the roster is exported with FormatVersion=3
- THEN every `OfflineRosterUserDto` has non-empty `WrappedDek`, `WrapSalt`, `WrapIv`, and `WrapIterations == 210000`

#### Scenario: Billing snapshot populated per user
- GIVEN a `Vencido` store with an active paid module
- WHEN the roster is exported
- THEN every user carries `PaymentStatus == "Vencido"`, `PaymentDueDate` non-null, `IsInTrial == false`
- AND a `NoAplica` store carries `PaymentStatus == "NoAplica"`, `PaymentDueDate == null`, `IsInTrial == false`

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

### R10: DEK Derivation — HKDF (MUST)

The system MUST derive a deterministic 32-byte DEK per store via `HKDF.DeriveKey(SHA256, UTF8(masterSecret), 32, salt: null, info: UTF8(storeId.D))`. The master secret MUST be configured via `StoreEncryption:MasterSecret` (following `Jwt:SecretKey` pattern). Empty/whitespace secret MUST throw `ArgumentException`.

| Parameter | Value |
|-----------|-------|
| Algorithm | `HKDF.DeriveKey` (SHA256) |
| IKM | UTF-8 bytes of `StoreEncryption:MasterSecret` |
| Salt | `null` |
| Info | UTF-8 bytes of `storeId.ToString("D")` |
| Output | 32 bytes |

#### Scenario: Deterministic per store
- GIVEN a configured `StoreEncryption:MasterSecret`
- WHEN `GetDek(storeId)` is called twice with the same storeId
- THEN both calls return identical 32-byte arrays

#### Scenario: Different per store
- GIVEN two distinct store IDs
- WHEN `GetDek` is called for each
- THEN the two DEKs differ (no collision)

#### Scenario: Known-answer HKDF match
- GIVEN a known master secret and storeId
- WHEN `GetDek` is called
- THEN the result equals an independent `HKDF.DeriveKey(...)` computation

### R11: DEK Wrapping — PBKDF2 KEK + AES-GCM (MUST)

The system MUST wrap a DEK per user using PBKDF2-derived KEK and AES-GCM-128. The WrappedDek layout MUST be `Base64(ciphertext ‖ tag)`.

| Step | Detail |
|------|--------|
| KEK | `Rfc2898DeriveBytes.Pbkdf2(UTF8(storedPasswordHash), wrapSalt, 210000, SHA256, 32)` |
| WrapSalt | 16 random bytes (fresh per call) |
| WrapIv | 12 random bytes (fresh per call) |
| AEAD | `AesGcm(kek, 16).Encrypt(iv, dek, ciphertext, tag)` |
| Output | `WrappedDek=Base64(ciphertext ‖ tag)`, `WrapSalt=Base64(salt)`, `WrapIv=Base64(iv)` |

#### Scenario: Round-trip unwrap
- GIVEN a known stored password hash and a random 32-byte DEK
- WHEN `WrapDek(hash, dek)` is called
- THEN the output fields are valid Base64, salt is 16 bytes, iv is 12 bytes, wrapped is 48 bytes (32+16)
- AND reconstructing the KEK with the same PBKDF2 params and decrypting returns the original DEK

#### Scenario: Distinct salt/IV per call
- GIVEN the same stored password hash and same DEK
- WHEN `WrapDek` is called twice
- THEN `WrapSalt`, `WrapIv`, and `WrappedDek` all differ between calls

### R12: Handler DEK Integration (MUST)

The handler MUST load the DEK once per export (`IStoreDataKeyProvider.GetDek(storeId)`) and wrap it per user (`IStoreKeyWrapService.WrapDek(user.Password, dek)`) inside the existing user loop.

#### Scenario: DEK loaded once
- GIVEN a store with N users
- WHEN the handler processes the export
- THEN `IStoreDataKeyProvider.GetDek` is called exactly once (not per user)

#### Scenario: Wrap per user
- GIVEN a store with N users
- WHEN the handler processes the export
- THEN `IStoreKeyWrapService.WrapDek` is called exactly N times — once per user with that user's `User.Password` and the shared DEK

### R13: Bundle FormatVersion Bump (MUST)

The system MUST set `OfflineRosterDto.FormatVersion = 3` (up from `2`).

(Previously: `FormatVersion = 2`.)

#### Scenario: Version 3 bundle
- GIVEN a successful export
- WHEN the handler returns the roster
- THEN `FormatVersion == 3`

### R14: Billing Gate on Exported Modules (MUST)

The handler MUST apply `StoreBillingUtils.FilterForBilling` to the store's module list before building `storeModuleIds`, with NO reimplementation of the `PriceIncluded` rule. The single filtered assignment MUST feed both `GetStoreRoleFeaturesByUserIdAsync` and `GetAllowedFeatureIdsForUserAsync`.

#### Scenario: Vencido store exports only PriceIncluded modules
- GIVEN a `Vencido` store with one free module and one paid module
- WHEN the roster is exported
- THEN `storeModuleIds` contains only the `PriceIncluded` module id

#### Scenario: AlDia store exports all modules
- GIVEN an `AlDia` store with free and paid modules
- WHEN the roster is exported
- THEN `storeModuleIds` contains every module id unchanged

#### Scenario: NoAplica store exports all modules
- GIVEN a `NoAplica` store (never started billing)
- WHEN the roster is exported
- THEN `storeModuleIds` contains every module id unchanged

### R15: Configurable Bundle TTL (MUST)

`ISystemConfigurationRepository` MUST expose `GetOfflineRosterTtlDaysAsync()` returning `Task<int>`; the implementation MUST fall back to `35` when no row exists. A new `SystemConfigurationType` entry with a seed row MUST be added following the `GetDueSoonDaysAsync` pattern. The handler MUST compute `expiresAt` from this TTL via `IDateTimeProvider`.

#### Scenario: Configured TTL applied
- GIVEN a config row value `7`
- WHEN the roster is exported at a pinned time
- THEN `expiresAt == issuedAt + 7 * 86400 * 1000`

#### Scenario: Default TTL when unset
- GIVEN no config row exists
- WHEN `GetOfflineRosterTtlDaysAsync()` is called
- THEN it returns `35` (behavior identical to today)

### R16: WrapIterations Surfaced from Service (MUST)

`WrappedDekResult` MUST carry `Iterations` populated by the wrap service from the single iteration constant it actually used — no second constant copy. The handler MUST copy that value to `OfflineRosterUserDto.WrapIterations`.

#### Scenario: Handler emits service-reported iterations
- GIVEN a successful export with wrap service reporting 210000 iterations
- WHEN the handler builds the DTO
- THEN `WrapIterations` equals the service-reported value, not a re-read literal

### R17: DEK Recoverability — E2E Proof (MUST)

The E2E suite MUST prove a wrapped DEK is recoverable from wire fields only: reconstruct the KEK from `storedHash = Base64(SHA256(UTF8(password)))` + `WrapSalt` + `WrapIterations`, unwrap `WrappedDek` (`ciphertext‖tag` split), and assert the recovered bytes byte-equal `IStoreDataKeyProvider.GetDek(storeId)`.

#### Scenario: Recovered DEK byte-equals GetDek
- GIVEN a store user with password `"Password123"`
- WHEN the exported bundle is unwrapped using only wire fields
- THEN the recovered 32 bytes equal `GetDek(storeId)` byte for byte

#### Scenario: Raw password fails decryption
- GIVEN the same export
- WHEN the KEK is derived from the raw password instead of the stored hash
- THEN `AesGcm.Decrypt` throws `AuthenticationTagMismatchException`

### R18: DEK KAT Vector + Interop Test (MUST)

The system MUST commit `docs/contracts/offline-roster-dek-kat.json` (with provenance metadata: `dotnet-backend`, backend commit SHA, .NET version) and `StoreKeyWrapInteropTests` MUST read the vector and unwrap it using documented parameters ONLY — it MUST NOT call `WrapDek`. A companion assertion MUST pin HKDF: `HKDF.DeriveKey` over the vector's master secret and storeId reproduces `expectedDek`.

#### Scenario: Interop test green from committed vector
- GIVEN the committed KAT JSON
- WHEN the interop test derives KEK from `storedPasswordHash + wrapSalt + iterations` and unwraps
- THEN the result equals `expectedDek` without any `WrapDek` call

#### Scenario: Iteration drift fails the test
- GIVEN the interop test is run with a one-off iteration change (e.g. 210001)
- WHEN the KEK is derived with the drifted count
- THEN the test FAILS, proving the vector guards parameter drift

### R19: Online Endpoints Regression (MUST)

The billing gate, TTL, and DEK interop changes MUST NOT alter online behavior: `POST /login`, `GET /auth/me`, and session logic remain unchanged.

#### Scenario: Online auth suite stays green
- GIVEN the existing auth-session and auth-http test suites
- WHEN the offline-roster changes are applied
- THEN all online auth tests pass unchanged with zero edits to those paths

## Verification Criteria

- [x] All 7 E2E scenarios pass — `ExportOfflineRosterTests` 7/7: SuperAdmin full bundle, OwnerAdmin own store (200), OwnerAdmin foreign store (400), empty store (`SuperAdmin_empty_store_returns_empty_users`), nonexistent store (`SuperAdmin_nonexistent_store_returns_empty_users`), plain user denied (403), DEK stability across exports
- [x] OfflineVerifierService unit tests pass (reproducibility, fresh salt) — 2/2 passing
- [x] Handler unit tests pass (4 cases: auth deny, ownership deny, success shape, verifier per user) — 4/4 passing
- [x] Existing suite passes unchanged — 251 tests pass, ZERO regressions
- [x] `expiresAt - issuedAt` equals exactly 35 days in ms — verified in handler unit test
- [x] `bundleId` is a new GUID per request — verified in handler unit test
- [x] `OfflineVerifierService` registered in DI — `AddScoped<IOfflineVerifierService, OfflineVerifierService>()` in Program.cs
- [x] StoreKeyWrapService unit tests pass (round-trip unwrap, distinct salt/IV) — 2/2 passing
- [x] StoreDataKeyProvider unit tests pass (determinism, per-store uniqueness, 32-byte output, empty/whitespace secret throws) — 5/5 passing. NO known-answer test exists — gap tracked by T-A1 (`backend-test-and-debt-closure` adds `GetDek_known_answer_matches_independent_vector`)
- [x] Handler returns `FormatVersion == 2` with non-empty wrap fields per user — verified in handler test
- [x] DEK loaded exactly once per export (not per user) — verified via mock
- [x] E2E `SuperAdmin_export_twice_DEK_stability` asserts wrap fields non-empty and `WrappedDek` differs between exports (proving fresh salt/IV) — it does NOT unwrap the DEKs for byte comparison; the unwrap assertion (dek₁ == dek₂, 32B) is added by T-A2 (`backend-test-and-debt-closure`)
- [x] `dotnet test backend/src/SMCA.sln` green — full suite 619/619 (Domain 22, Application 313 incl. 3 KAT interop, E2E 284 incl. 15 roster tests); build exit 0, 0 errors (8 pre-existing NU1902/NU1903 warnings)
- [x] E2E gate cases green — Vencido exports only PriceIncluded; AlDia / NoAplica export all modules (unit + E2E)
- [x] E2E unwrap green — recovered DEK byte-equals `GetDek(storeId)`; raw password throws `AuthenticationTagMismatchException`
- [x] KAT interop + HKDF pin green — `StoreKeyWrapInteropTests` reads `docs/contracts/offline-roster-dek-kat.json`, no `WrapDek` re-wrap; iteration drift (210001) fails

## Related Specifications

- **auth-session** — existing online auth sessions (untouched by this change)
- **management-users** — existing store user management (extended by new repository method)
- **at-rest-encryption-backend** — per-user DEK wrapping (delta extending this spec)

## Implementation Status

- **Spec**: Active (this document, includes at-rest-encryption-backend delta + offline-roster-billing-and-dek-interop-backend delta)
- **Design**: See `openspec/changes/archive/2026-07-29-offline-auth-backend/design.md` (base) + `openspec/changes/archive/2026-07-29-at-rest-encryption-backend/design.md` (delta) + `openspec/changes/archive/2026-08-04-offline-roster-billing-and-dek-interop-backend/design.md` (delta)
- **Implementation**: Base offline-auth complete (15/15 tasks). At-rest encryption — 12/12 tasks complete. Billing gate / TTL / DEK interop — 23/23 tasks complete (working tree, uncommitted — HEAD `d784a048`).
- **Verification**: Base — PASS (R7 covered by `SuperAdmin_empty_store_returns_empty_users`, R8 by `SuperAdmin_nonexistent_store_returns_empty_users`). At-rest encryption — PASS (15/15 scenarios compliant, 510/510 tests pass). Billing gate / TTL / DEK interop — PASS (9/9 requirements, 16/16 scenarios, 619/619 tests).
- **Archive**: Base at `openspec/changes/archive/2026-07-29-offline-auth-backend/`. At-rest encryption at `openspec/changes/archive/2026-07-29-at-rest-encryption-backend/`. Billing gate / TTL / DEK interop at `openspec/changes/archive/2026-08-04-offline-roster-billing-and-dek-interop-backend/`.
