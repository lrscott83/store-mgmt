# Delta for Offline Auth — At-Rest Encryption Backend

## ADDED Requirements

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

The system MUST set `OfflineRosterDto.FormatVersion = 2` (up from `1`).

#### Scenario: Version 2 bundle
- GIVEN a successful export
- WHEN the handler returns the roster
- THEN `FormatVersion == 2`

## MODIFIED Requirements

### R4: Bundle Metadata (previously FormatVersion=1)

Update the `formatVersion` row in the Bundle Metadata table:

| Field | Type | Rule |
|-------|------|------|
| `formatVersion` | int | Always `2` |

#### Scenario: Updated bundle structure
- GIVEN a successful export
- THEN `formatVersion == 2`, `bundleId` is a valid non-empty GUID string
- AND `expiresAt - issuedAt == 35 * 86400 * 1000`
- AND `storeId` matches the request parameter

### R5: Per-User Data Shape (previously without wrap fields)

Add three fields to the per-user DTO:

| Field | Type | Default | Serialization |
|-------|------|---------|---------------|
| `WrappedDek` | string | `""` | `wrappedDek` |
| `WrapSalt` | string | `""` | `wrapSalt` |
| `WrapIv` | string | `""` | `wrapIv` |

#### Scenario: Wrap fields populated in version 2
- GIVEN a store with at least one user
- WHEN the roster is exported with FormatVersion=2
- THEN every `OfflineRosterUserDto` has non-empty `WrappedDek`, `WrapSalt`, `WrapIv`

## Known Implementation Mismatches

These path/name deviations from `docs/plans/2026-07-25-at-rest-encryption-backend-plan.md` MUST be followed during apply:

| # | Plan says | Actual code |
|---|-----------|-------------|
| M1 | `Management/ExportOfflineRosterTests.cs` | `Users/ExportOfflineRosterTests.cs` |
| M2 | `_verifier` field in handler | `_offlineVerifierService` field |
| M3 | `query.StoreId` in handler tests | `_storeId` class-level field |
| M4 | FormatVersion = 1 var | Literal `1` on `OfflineRosterDto` init |
| M5 | DI at "line 57" | New services at line 60 (after L58-59) |
| M6 | — | All 4 existing handler tests need new mock params |
| M7 | Test asserts `.Be(1)` | Update to `.Be(2)` in handler + E2E tests |