# Offline Auth Specification

**Capability**: offline-auth — offline roster export and verifier computation
**Status**: Active
**Last Updated**: 2026-08-06

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
| Password input | UTF-8 bytes of the persisted `User.OfflinePasswordPreHash` (`Base64(SHA256(UTF8(password)))`) |

(Previously: "UTF-8 bytes of `User.Password` (stored Base64 SHA256 hash)" —
true only under the pre-Argon2id legacy format, where `User.Password` and
`Base64(SHA256(password))` happened to be the same string. Never true since
the Argon2id migration. Corrected by `offline-password-verifier`, archived
2026-08-06.)

#### Scenario: Deterministic with known salt
- GIVEN a fixed persisted `OfflinePasswordPreHash` and known salt
- WHEN `CreateVerifier` is called
- THEN output Hash equals `Pbkdf2(UTF8(preHash), salt, 210000, SHA256, 32)` in Base64

#### Scenario: Fresh salt per invocation
- GIVEN the same persisted pre-hash
- WHEN `CreateVerifier` is called twice
- THEN the two salts differ and the two hashes differ

#### Scenario: Verifier is never derived from User.Password
- GIVEN a user whose `User.Password` (Argon2id PHC string) and
  `User.OfflinePasswordPreHash` are both set
- WHEN the roster is exported
- THEN the emitted `Verifier.Hash` matches a PBKDF2 derivation seeded from
  `OfflinePasswordPreHash`, and does NOT match one seeded from `User.Password`

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

Each `OfflineRosterUserDto` MUST contain: `Id`, `Login`, `FullName`, `IsActive`, `Roles` (list of `StoreModuleFeaturesDto`), `FeatureIds`, `StoreModuleIds`, `IsSuperAdmin`, `IsOwnerAdmin`, `IsReSeller`, `SelectedStoreId`, `Verifier` (nullable: Hash, Salt, Iterations), `WrappedDek`, `WrapSalt`, `WrapIv`, `PaymentDueDate`, `IsInTrial`, `PaymentStatus`, `WrapIterations`.

(Previously: no billing snapshot fields, no `WrapIterations`. Also
previously: `Verifier` was non-nullable, defaulting to `new()` with empty
strings/zero when nothing had been computed for the user. This made a
"no offline access yet" user indistinguishable, on the wire, from a user
with an all-empty verifier — the frontend's `typeof` guard could not tell
them apart and misrouted the case into "wrong password". Corrected by
`offline-password-verifier`, archived 2026-08-06.)

#### Scenario: Shape matches /me output
- GIVEN a store user
- WHEN the roster is exported
- THEN the user's `Roles`, `FeatureIds`, `StoreModuleIds`, and role booleans match what `/me` would return for that user in that store

#### Scenario: User with a persisted pre-hash exports a populated verifier and wrap
- GIVEN a store user whose `User.OfflinePasswordPreHash` is non-null
- WHEN the roster is exported
- THEN `Verifier` is non-null with non-empty `Hash`/`Salt` and `Iterations == 210000`
- AND `WrappedDek`, `WrapSalt`, `WrapIv` are non-empty and `WrapIterations == 210000`

#### Scenario: User without a persisted pre-hash exports a null verifier and empty wrap fields
- GIVEN a store user whose `User.OfflinePasswordPreHash` is null (never logged in or set a
  password since this change shipped)
- WHEN the roster is exported
- THEN `Verifier` is `null`
- AND `WrappedDek`, `WrapSalt`, `WrapIv` are empty strings and `WrapIterations == 0`
- AND `IStoreKeyWrapService.WrapDek` is NOT invoked for that user

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

The system MUST wrap a DEK per user using PBKDF2-derived KEK and AES-GCM-128, ONLY when the user has a persisted pre-hash. The WrappedDek layout MUST be `Base64(ciphertext ‖ tag)`.

| Step | Detail |
|------|--------|
| KEK | `Rfc2898DeriveBytes.Pbkdf2(UTF8(offlinePasswordPreHash), wrapSalt, 210000, SHA256, 32)` |
| WrapSalt | 16 random bytes (fresh per call) |
| WrapIv | 12 random bytes (fresh per call) |
| AEAD | `AesGcm(kek, 16).Encrypt(iv, dek, ciphertext, tag)` |
| Output | `WrappedDek=Base64(ciphertext ‖ tag)`, `WrapSalt=Base64(salt)`, `WrapIv=Base64(iv)` |

(Previously: KEK input was `UTF8(su.User.Password)` — the Argon2id PHC
string, or the legacy raw-SHA256 hash pre-migration. `IStoreKeyWrapService`
was called unconditionally for every user; it is now called only when a
pre-hash is available — see R12. Corrected by `offline-password-verifier`,
archived 2026-08-06.)

#### Scenario: Round-trip unwrap
- GIVEN a known persisted pre-hash and a random 32-byte DEK
- WHEN `WrapDek(preHash, dek)` is called
- THEN the output fields are valid Base64, salt is 16 bytes, iv is 12 bytes, wrapped is 48 bytes (32+16)
- AND reconstructing the KEK with the same PBKDF2 params and decrypting returns the original DEK

#### Scenario: Distinct salt/IV per call
- GIVEN the same persisted pre-hash and same DEK
- WHEN `WrapDek` is called twice
- THEN `WrapSalt`, `WrapIv`, and `WrappedDek` all differ between calls

#### Scenario: Raw plaintext password does not reproduce the KEK
- GIVEN a wrapped DEK produced from a user's persisted pre-hash
- WHEN the KEK is instead derived from the user's raw plaintext password (not its SHA-256 pre-hash)
- THEN `AesGcm.Decrypt` throws `AuthenticationTagMismatchException`

### R12: Handler DEK Integration (MUST)

The handler MUST load the DEK once per export (`IStoreDataKeyProvider.GetDek(storeId)`). For each user with a non-null `OfflinePasswordPreHash`, it MUST wrap the DEK (`IStoreKeyWrapService.WrapDek(user.OfflinePasswordPreHash, dek)`) inside the existing user loop and populate `Verifier`/wrap fields. For each user with a null `OfflinePasswordPreHash`, it MUST NOT call `CreateVerifier` or `WrapDek`, and MUST emit `Verifier: null` with empty wrap fields (R5).

(Previously: `IOfflineVerifierService.CreateVerifier` and
`IStoreKeyWrapService.WrapDek` were called unconditionally for every user,
keyed on `user.Password`. Corrected by `offline-password-verifier`, archived
2026-08-06.)

#### Scenario: DEK loaded once
- GIVEN a store with N users
- WHEN the handler processes the export
- THEN `IStoreDataKeyProvider.GetDek` is called exactly once (not per user)

#### Scenario: Wrap only for users with a pre-hash
- GIVEN a store with N users, of which M have a non-null `OfflinePasswordPreHash`
- WHEN the handler processes the export
- THEN `IStoreKeyWrapService.WrapDek` is called exactly M times — once per such user with that user's `OfflinePasswordPreHash` and the shared DEK
- AND `IOfflineVerifierService.CreateVerifier` is called exactly M times, never for a user with a null pre-hash

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

The E2E suite MUST prove a wrapped DEK is recoverable from wire fields plus the persisted pre-hash: reconstruct the KEK from `preHash = User.OfflinePasswordPreHash` (decrypted) + `WrapSalt` + `WrapIterations`, unwrap `WrappedDek` (`ciphertext‖tag` split), and assert the recovered bytes byte-equal `IStoreDataKeyProvider.GetDek(storeId)`.

(Previously: described the reconstruction input as
`storedHash = Base64(SHA256(UTF8(password)))` read directly off `User.Password`
— which was the correct formula only under the pre-Argon2id legacy format.
The E2E test code (`ExportOfflineRosterTests.cs:252-263`, `:530-541`) has
always read `User.Password` verbatim and fed it to a local `UnwrapDek`
helper that mirrors `StoreKeyWrapService` line for line — so it validated
the backend against itself and never caught this defect. Under this
change, the two tests' key-material read changes from `User.Password` to
`User.OfflinePasswordPreHash` — their assertions are unchanged. Corrected by
`offline-password-verifier`, archived 2026-08-06.)

#### Scenario: Recovered DEK byte-equals GetDek
- GIVEN a store user with password `"Password123"` (whose `OfflinePasswordPreHash` was persisted at seed/login time)
- WHEN the exported bundle is unwrapped using the persisted pre-hash plus wire fields only
- THEN the recovered 32 bytes equal `GetDek(storeId)` byte for byte

#### Scenario: Raw password fails decryption
- GIVEN the same export
- WHEN the KEK is derived from the raw plaintext password instead of the persisted pre-hash
- THEN `AesGcm.Decrypt` throws `AuthenticationTagMismatchException`
- (This is the existing, unmodified test `SuperAdmin_export_rawPassword_throwsAuthenticationTagMismatch`, `ExportOfflineRosterTests.cs:558-587` — it never read a stored hash from the DB to begin with, so it requires no code change and remains the negative control.)

### R18: DEK KAT Vector + Interop Test (MUST)

The system MUST commit `docs/contracts/offline-roster-dek-kat.json` (with provenance metadata: `dotnet-backend`, backend commit SHA, .NET version) and `StoreKeyWrapInteropTests` MUST read the vector and unwrap it using documented parameters ONLY — it MUST NOT call `WrapDek`. A companion assertion MUST pin HKDF: `HKDF.DeriveKey` over the vector's master secret and storeId reproduces `expectedDek`. The vector's pre-hash field MUST additionally be asserted, independently, to equal `Base64(SHA256(UTF8(vector.password)))` — the permanent guard against this exact class of drift recurring.

(Previously: the vector's `storedPasswordHash` field held
`Base64(SHA256("Password123"))` under a name that implied "the value stored
in `User.Password`" — accurate pre-Argon2id, misleading after. The literal
Base64 value is verified correct and unchanged for the new convention (it
already equals `Base64(SHA256("Password123"))`); only the field's name and
semantic label were stale and have been corrected to reflect that it is the
persisted pre-hash, not the stored Argon2id hash. Corrected by
`offline-password-verifier`, archived 2026-08-06.)

#### Scenario: Interop test green from committed vector
- GIVEN the committed KAT JSON
- WHEN the interop test derives KEK from `preHash + wrapSalt + iterations` and unwraps
- THEN the result equals `expectedDek` without any `WrapDek` call

#### Scenario: Iteration drift fails the test
- GIVEN the interop test is run with a one-off iteration change (e.g. 210001)
- WHEN the KEK is derived with the drifted count
- THEN the test FAILS, proving the vector guards parameter drift

#### Scenario: Vector's pre-hash formula is self-verified
- GIVEN the committed KAT JSON's `password` and pre-hash fields
- WHEN the interop test independently computes `Base64(SHA256(UTF8(vector.password)))`
- THEN it equals the vector's persisted pre-hash field exactly

### R19: Online Endpoints Regression (MUST)

The billing gate, TTL, and DEK interop changes MUST NOT alter online behavior: `POST /login`, `GET /auth/me`, and session logic remain unchanged.

#### Scenario: Online auth suite stays green
- GIVEN the existing auth-session and auth-http test suites
- WHEN the offline-roster changes are applied
- THEN all online auth tests pass unchanged with zero edits to those paths

### R20: OfflinePasswordPreHash Persisted At Every Plaintext Choke Point (MUST)

The system MUST add a nullable `User.OfflinePasswordPreHash` column and compute `Base64(SHA256(UTF8(password)))` from it at every site where plaintext is available at the moment of writing `User.Password`:

| Site | File:Line |
|------|-----------|
| Owner creation (self-registration and admin-created) | `CreateOwnerService.cs:38` |
| Store-user creation | `CreateStoreUserCommand.cs:60` |
| Reseller creation | `CreateReSellerCommand.cs:65` |
| Password change (self-service and admin-driven) | `UpdateUserPasswordCommand.cs:63` |

#### Scenario: Owner creation persists a pre-hash
- GIVEN a new owner is created (via self-registration or admin-created)
- WHEN `CreateOwnerService.CreateOwnerAsync` completes
- THEN `User.OfflinePasswordPreHash` equals `Base64(SHA256(UTF8(password)))` for the password supplied

#### Scenario: Store-user creation persists a pre-hash
- GIVEN a new store user is created
- WHEN `CreateStoreUserCommandHandler.Handle` completes
- THEN `User.OfflinePasswordPreHash` equals `Base64(SHA256(UTF8(password)))` for the password supplied

#### Scenario: Reseller creation persists a pre-hash
- GIVEN a new reseller user is created
- WHEN `CreateReSellerCommandHandler.Handle` completes
- THEN `User.OfflinePasswordPreHash` equals `Base64(SHA256(UTF8(password)))` for the password supplied

#### Scenario: Password change replaces the pre-hash
- GIVEN an existing user changes their password (self-service or admin-driven)
- WHEN `UpdateUserPasswordCommandHandler.Handle` completes successfully
- THEN `User.OfflinePasswordPreHash` equals `Base64(SHA256(UTF8(newPassword)))`, replacing whatever value (or null) was there before

### R21: Backfill Pre-Hash On Successful Login When Missing (MUST)

On a successful password verification (`AuthenticationService.cs:44`), if `User.OfflinePasswordPreHash` is null, the system MUST compute and persist it from the plaintext password just verified, without requiring the user to change their password. If it is already non-null, login MUST NOT recompute or overwrite it.

(Implementation note: `ApplicationDbContext` is `QueryTrackingBehavior.NoTracking`
by default (`ApplicationDbContext.cs:45`). The login pipeline also never calls
`SaveChanges` — `UnitOfWorkBehaviour.Handle` short-circuits unconditionally
because `IsQuery()` hard-returns `true` (`UnitOfWorkBehaviour.cs:20-21,36-40`).
The shipped implementation persists the backfill via a conditional single-column
`ExecuteUpdateAsync` (`WHERE Id = userId AND OfflinePasswordPreHash IS NULL`),
which bypasses the change tracker and the unsaved-UoW problem in one move, and
doubles as the race guard against concurrent logins.)

#### Scenario: First successful login after this change backfills the pre-hash
- GIVEN a user with `OfflinePasswordPreHash == null` and a valid password
- WHEN they successfully log in via `POST /login`
- THEN `User.OfflinePasswordPreHash` is persisted as `Base64(SHA256(UTF8(password)))`

#### Scenario: Login does not overwrite an existing pre-hash
- GIVEN a user with a non-null `OfflinePasswordPreHash`
- WHEN they successfully log in
- THEN `User.OfflinePasswordPreHash` is unchanged

#### Scenario: Failed login never writes a pre-hash
- GIVEN a user with `OfflinePasswordPreHash == null`
- WHEN they submit an incorrect password
- THEN `User.OfflinePasswordPreHash` remains null

### R22: OfflinePasswordPreHash Encrypted At Rest (MUST)

`User.OfflinePasswordPreHash` MUST be stored as ciphertext, encrypted using the same `StoreEncryption:MasterSecret` / key-derivation precedent as `StoreDataKeyProvider` (`Program.cs:64`). It MUST be decrypted only server-side, at the point of deriving verifier/KEK material. It MUST NOT be returned by any API response in either its ciphertext or its decrypted pre-hash form — the only externally observable artifacts derived from it are the roster's `Verifier` (Hash/Salt/Iterations) and wrap fields (`WrappedDek`/`WrapSalt`/`WrapIv`/`WrapIterations`), which are themselves one-way PBKDF2/AES-GCM derivations, not the pre-hash itself.

#### Scenario: Column holds ciphertext, not the plaintext pre-hash
- GIVEN a user with a persisted `OfflinePasswordPreHash`
- WHEN the raw database column value is inspected
- THEN it does not equal `Base64(SHA256(UTF8(password)))` in cleartext — it is ciphertext requiring the master secret to decrypt

#### Scenario: Export response never serializes the pre-hash
- GIVEN a successful roster export
- WHEN the response body is inspected
- THEN no field contains `User.OfflinePasswordPreHash` verbatim, encrypted or decrypted — only the derived `Verifier`/wrap fields appear

### R23: Password Change Invalidates Previously Exported Rosters (MUST — documented, accepted behavior)

Because a roster's `Verifier`/wrap fields are derived from the pre-hash at export time, and R20 requires the pre-hash to be replaced on password change, a roster exported before a password change MUST fail to validate against the new password once imported on a device. This is accepted, intended behavior — not a defect — and requires no compensating code; it is a direct consequence of R20 + R11/R12.

#### Scenario: Roster exported before a password change stops validating
- GIVEN a roster was exported for a user with password `"OldPass1"`
- AND that user's password is subsequently changed to `"NewPass1"`
- WHEN the previously exported roster's `Verifier` is checked against `"NewPass1"` using `verifyOfflinePassword`
- THEN it returns false (the PBKDF2 output does not match)

#### Scenario: A fresh export after the change validates against the new password
- GIVEN the same user has changed their password to `"NewPass1"`
- WHEN an admin re-exports the roster
- THEN the newly exported `Verifier` validates `"NewPass1"` and no longer validates `"OldPass1"`

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
- [x] R3/R5/R11/R12/R17/R18 corrected to derive verifier/KEK material from the persisted `User.OfflinePasswordPreHash`, not `User.Password` — `Application.Tests` 318/318, `SMCA.WebApi.E2ETests` 305/305
- [x] KAT vector's `passwordPreHash` field independently asserted equal to `Base64(SHA256(UTF8(vector.password)))` on both .NET (`StoreKeyWrapInteropTests`) and TypeScript (`dek-unwrap.kat.test.ts`)
- [x] `ExportOfflineRosterQuery` never skips a user with a null pre-hash — emits `Verifier: null` and empty wrap fields, verified by `Handle_NullPreHash_EmitsNullVerifierAndSkipsCreateVerifierAndWrapDek`
- [x] No existing E2E assertion changed — `git diff --stat` on `SMCA.WebApi.E2ETests/` shows exactly 3 authorized files (`ExportOfflineRosterTests.cs`, `DbTestHelpers.cs`, `AuthzSeed.cs`); `SuperAdmin_export_rawPassword_throwsAuthenticationTagMismatch` byte-diffed identical

## Related Specifications

- **auth-session** — existing online auth sessions (untouched by this change)
- **management-users** — existing store user management (extended by new repository method)
- **at-rest-encryption-backend** — per-user DEK wrapping (delta extending this spec)

## Implementation Status

- **Spec**: Active (this document, includes at-rest-encryption-backend delta + offline-roster-billing-and-dek-interop-backend delta + offline-password-verifier delta correcting R3/R5/R11/R12/R17/R18 and adding R20-R23)
- **Design**: See `openspec/changes/archive/2026-07-29-offline-auth-backend/design.md` (base) + `openspec/changes/archive/2026-07-29-at-rest-encryption-backend/design.md` (delta) + `openspec/changes/archive/2026-08-04-offline-roster-billing-and-dek-interop-backend/design.md` (delta) + `openspec/changes/archive/2026-08-06-offline-password-verifier/design.md` (delta)
- **Implementation**: Base offline-auth complete (15/15 tasks). At-rest encryption — 12/12 tasks complete. Billing gate / TTL / DEK interop — 23/23 tasks complete. `offline-password-verifier` — complete, branch `feat/offline-password-verifier`, 9 commits (`274e85b`..`7d76ef1`), pushed, commits-only delivery (no PR).
- **Verification**: Base — PASS (R7 covered by `SuperAdmin_empty_store_returns_empty_users`, R8 by `SuperAdmin_nonexistent_store_returns_empty_users`). At-rest encryption — PASS (15/15 scenarios compliant, 510/510 tests pass). Billing gate / TTL / DEK interop — PASS (9/9 requirements, 16/16 scenarios, 619/619 tests). `offline-password-verifier` — PASS WITH WARNINGS (0 CRITICAL, 1 doc-drift WARNING resolved at archive time); `Application.Tests` 318/318, `SMCA.WebApi.E2ETests` 305/305, frontend `npx turbo run test --force` 2375/2375.
- **Archive**: Base at `openspec/changes/archive/2026-07-29-offline-auth-backend/`. At-rest encryption at `openspec/changes/archive/2026-07-29-at-rest-encryption-backend/`. Billing gate / TTL / DEK interop at `openspec/changes/archive/2026-08-04-offline-roster-billing-and-dek-interop-backend/`. `offline-password-verifier` at `openspec/changes/archive/2026-08-06-offline-password-verifier/`.
