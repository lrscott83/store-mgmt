# Delta for Offline Auth — Billing Gate, TTL & DEK Interop (Backend)

Extends `openspec/specs/offline-auth/spec.md` (base, R1–R13). Frontend follow-up (reading `formatVersion: 3`, billing fields, `wrapIterations`) is a NON-GOAL of this change — owned by `at-rest-encryption-frontend`.

## MODIFIED Requirements

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

### R13: Bundle FormatVersion Bump (MUST)

The system MUST set `OfflineRosterDto.FormatVersion = 3` (up from `2`).

(Previously: `FormatVersion = 2`.)

#### Scenario: Version 3 bundle
- GIVEN a successful export
- WHEN the handler returns the roster
- THEN `FormatVersion == 3`

## ADDED Requirements

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

- [ ] `dotnet test backend/src/SMCA.sln` green
- [ ] E2E gate cases: Vencido / AlDia / NoAplica
- [ ] E2E unwrap: byte-equals `GetDek`; raw-password negative case
- [ ] KAT interop + HKDF pin green (no re-wrap)
