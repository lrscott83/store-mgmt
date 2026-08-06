# Delta for Offline Auth — Password Verifier / DEK Wrap Key-Material Fix

Extends `openspec/specs/offline-auth/spec.md` (base, R1–R19). Corrects R3, R5,
R11, R12, R17, R18 — all five currently key the verifier/KEK derivation off
`User.Password` (the Argon2id PHC string) or describe the stale legacy
raw-SHA256 shape, which the frontend (`offline-crypto.ts:81-88`,
`dek-unwrap.ts:46-62`) has never derived from. Resolves the contradiction
with `openspec/specs/offline-roster-bundle/spec.md:13-18` — the pre-hash
convention (`Base64(SHA256(password))`) documented there was already
correct; the backend was wrong, not the frontend spec.

## MODIFIED Requirements

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
the Argon2id migration.)

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

### R5: Per-User Data Shape (MUST)

Each `OfflineRosterUserDto` MUST contain: `Id`, `Login`, `FullName`, `IsActive`, `Roles` (list of `StoreModuleFeaturesDto`), `FeatureIds`, `StoreModuleIds`, `IsSuperAdmin`, `IsOwnerAdmin`, `IsReSeller`, `SelectedStoreId`, `Verifier` (nullable: Hash, Salt, Iterations), `WrappedDek`, `WrapSalt`, `WrapIv`, `PaymentDueDate`, `IsInTrial`, `PaymentStatus`, `WrapIterations`.

(Previously: `Verifier` was non-nullable, defaulting to `new()` with empty
strings/zero when nothing had been computed for the user. This made a
"no offline access yet" user indistinguishable, on the wire, from a user
with an all-empty verifier — the frontend's `typeof` guard could not tell
them apart and misrouted the case into "wrong password".)

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
pre-hash is available — see R12.)

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
keyed on `user.Password`.)

#### Scenario: DEK loaded once
- GIVEN a store with N users
- WHEN the handler processes the export
- THEN `IStoreDataKeyProvider.GetDek` is called exactly once (not per user)

#### Scenario: Wrap only for users with a pre-hash
- GIVEN a store with N users, of which M have a non-null `OfflinePasswordPreHash`
- WHEN the handler processes the export
- THEN `IStoreKeyWrapService.WrapDek` is called exactly M times — once per such user with that user's `OfflinePasswordPreHash` and the shared DEK
- AND `IOfflineVerifierService.CreateVerifier` is called exactly M times, never for a user with a null pre-hash

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
`User.OfflinePasswordPreHash` — their assertions are unchanged.)

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
semantic label are stale and MUST be corrected to reflect that it is the
persisted pre-hash, not the stored Argon2id hash.)

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

## ADDED Requirements

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

## Known Implementation Notes (non-binding, for design phase)

- `ApplicationDbContext` is `QueryTrackingBehavior.NoTracking` by default
  (`ApplicationDbContext.cs:45`). Persisting `OfflinePasswordPreHash` via a
  query-then-mutate flow (R21's backfill path, which loads the user through
  `GetByLoginWithRelatedAsync`) requires an explicit `UpdateAsync`/attach —
  a bare `SaveChangesAsync()` after mutating a queried entity silently
  writes nothing. `UpdateUserPasswordCommand.cs:64` is the existing pattern
  to follow.
- The KAT JSON's stale field name (`storedPasswordHash`) SHOULD be renamed
  to reflect pre-hash semantics; the exact identifier is a design-phase
  decision, not a spec-level one — the literal Base64 value itself is
  already correct and unchanged (R18).

## E2E Authorization Scope (2026-08-06, do not exceed)

The following existing E2E test changes are authorized, and ONLY these:

| Test | File:Line | Authorized change |
|------|-----------|--------------------|
| `SuperAdmin_export_twice_DEK_stability` | `ExportOfflineRosterTests.cs:262-263` | The key-material read line only: select `OfflinePasswordPreHash` (decrypted) instead of `Password` |
| `SuperAdmin_export_unwrappedDek_byteEqualsGetDek` | `ExportOfflineRosterTests.cs:541` | Same — key-material read line only |
| `SeedStoreUserAsync` | `ExportOfflineRosterTests.cs:610` | Persist a pre-hash alongside the seeded Argon2id password, exactly as a production write site does |
| `SeedStoreUserWithFeatureAsync` | `ExportOfflineRosterTests.cs:627` | Same |
| Equivalents in `DbTestHelpers` and `AuthzSeed` | — | Same seeding parity |

No assertion in any of these tests changes. `SuperAdmin_export_rawPassword_throwsAuthenticationTagMismatch` (`ExportOfflineRosterTests.cs:558-587`) is left completely untouched — it never read a stored hash from the DB, so it requires no change and remains the negative control proving raw-password derivation fails. No other existing E2E test may be modified without separately asking the user, per `CLAUDE.md`'s E2E rule.

## Verification Criteria

- [ ] `dotnet test backend/src/SMCA.sln` green
- [ ] `OfflineVerifierServiceTests` / `StoreKeyWrapServiceTests` updated for the new pre-hash input (not E2E, free to change)
- [ ] `ExportOfflineRosterQueryHandlerTests` updated for conditional `CreateVerifier`/`WrapDek` calls (null pre-hash → not called)
- [ ] The three authorized E2E tests pass with assertions unchanged
- [ ] No other E2E test file is touched
- [ ] KAT interop test asserts `preHash == Base64(SHA256(UTF8(password)))` in addition to the existing unwrap-and-compare assertion
