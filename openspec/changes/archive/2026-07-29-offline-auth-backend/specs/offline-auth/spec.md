# Offline Auth Specification (Delta — New Domain)

**Change**: offline-auth-backend
**Origin**: SDD proposal `sdd/offline-auth-backend/proposal`
**Status**: **Superseded** — merged into the main spec
**Last Updated**: 2026-07-31

> **Supersession note**: This delta was authored against the original FormatVersion-1 contract and is retained for audit. The **source of truth** is the main spec at `openspec/specs/offline-auth/spec.md`, which already carries the evolved contract: `FormatVersion = 2` + DEK wrapping (R10–R13, merged from the `at-rest-encryption-backend` delta in commit `42deff4b`). This file is kept in sync below for archive coherence, but future readers MUST use the main spec.

## Purpose

Export per-store user rosters with PBKDF2 offline verifiers and anti-replay bundle metadata via `GET /api/v1/storeusers/{storeId}/offline-roster`, enabling devices to authenticate users offline without the API.

## Requirements

### R1: Endpoint Contract (MUST)

The system MUST expose `GET /api/v1/storeusers/{storeId}/offline-roster` returning `ResponseResult<OfflineRosterDto>`.

#### Scenario: Successful export
- GIVEN a valid `storeId` and authorized caller
- WHEN the endpoint is called
- THEN status is 200 with body of type `ResponseResult<OfflineRosterDto>`

### R2: Authorization Scope (MUST)

The handler MUST restrict access to SuperAdmin (any store) and OwnerAdmin (stores they own). The class-level `[HasPermission(StoreRoleFeatures.UsersAdmin)]` is a coarse gate; the handler MUST further narrow via `IHttpContextService` + `IStoreRepository`.

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
| Password input | UTF-8 bytes of `User.Password` (the stored Base64 SHA256 hash) |

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
| `formatVersion` | int | Always `2` (bumped from `1` by commit `42deff4b`) |
| `storeId` | Guid | Matches the requested storeId |

#### Scenario: Bundle structure correct
- GIVEN a successful export
- THEN `formatVersion == 2`, `bundleId` is a valid non-empty GUID string
- AND `expiresAt - issuedAt == 35 * 86400 * 1000`
- AND `storeId` matches the request parameter

### R5: Per-User Data Shape (MUST)

Each `OfflineRosterUserDto` MUST contain: `Id`, `Login`, `FullName`, `IsActive`, `Roles` (list of `StoreModuleFeaturesDto`), `FeatureIds`, `StoreModuleIds`, `IsSuperAdmin`, `IsOwnerAdmin`, `IsReSeller`, `SelectedStoreId`, `Verifier` (Hash, Salt, Iterations), `WrappedDek`, `WrapSalt`, `WrapIv`.

#### Scenario: Shape matches /me output
- GIVEN a store user
- WHEN the roster is exported
- THEN the user's `Roles`, `FeatureIds`, `StoreModuleIds`, and role booleans match what `/me` would return for that user in that store

#### Scenario: Wrap fields populated in version 2
- GIVEN a store with at least one user
- WHEN the roster is exported with FormatVersion=2
- THEN every `OfflineRosterUserDto` has non-empty `WrappedDek`, `WrapSalt`, `WrapIv`

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

### R10: DEK Derivation — HKDF (MUST) — added by commit `42deff4b`

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

### R11: DEK Wrapping — PBKDF2 KEK + AES-GCM (MUST) — added by commit `42deff4b`

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

### R12: Handler DEK Integration (MUST) — added by commit `42deff4b`

The handler MUST load the DEK once per export (`IStoreDataKeyProvider.GetDek(storeId)`) and wrap it per user (`IStoreKeyWrapService.WrapDek(user.Password, dek)`) inside the existing user loop.

#### Scenario: DEK loaded once
- GIVEN a store with N users
- WHEN the handler processes the export
- THEN `IStoreDataKeyProvider.GetDek` is called exactly once (not per user)

#### Scenario: Wrap per user
- GIVEN a store with N users
- WHEN the handler processes the export
- THEN `IStoreKeyWrapService.WrapDek` is called exactly N times — once per user with that user's `User.Password` and the shared DEK

### R13: Bundle FormatVersion Bump (MUST) — added by commit `42deff4b`

The system MUST set `OfflineRosterDto.FormatVersion = 2` (up from `1`).

#### Scenario: Version 2 bundle
- GIVEN a successful export
- WHEN the handler returns the roster
- THEN `FormatVersion == 2`

## Archive Status

- **Merged into main spec**: `openspec/specs/offline-auth/spec.md` (updated in commit `42deff4b` — R4/R5 modified, R10–R13 added).
- **This delta is superseded** and retained for audit trail only.
- **Evolution source**: `openspec/changes/archive/2026-07-29-at-rest-encryption-backend/` (delta spec + design for the DEK-wrapping evolution).
