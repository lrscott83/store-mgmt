# Design: offline-password-verifier

## Technical Approach

One nullable, **encrypted-at-rest** column `User.OfflinePasswordPreHash` holds `Base64(SHA256(UTF8(password)))` — the exact convention the frontend already derives at `offline-crypto.ts:85` and `dek-unwrap.ts:48`. Captured at the five plaintext choke points; the export decrypts it once and feeds the *same string* to both `CreateVerifier` and `WrapDek`, replacing `su.User.Password` at `ExportOfflineRosterQuery.cs:115-116`. No crypto signature changes (`OfflineVerifierService.cs:13`, `StoreKeyWrapService.cs:15` untouched) — only the argument.

## Architecture Decisions

### D1 — Column key material, AEAD, and where encrypt/decrypt lives

| Question | Choice | Rejected | Rationale |
|---|---|---|---|
| Key | Purpose-separated column key: `HKDF.DeriveKey(SHA256, UTF8(masterSecret), 32, salt: null, info: UTF8("offline-password-prehash-v1"))` | `StoreDataKeyProvider.GetDek(storeId)` (`StoreDataKeyProvider.cs:17-21`) | A `User` has no stable single store. SuperAdmin/ReSeller rows have no `StoreUser`; `SelectedStoreId` is **mutable** (`SetMyStoreCommand.cs:54`), so store-keying would silently make the column undecryptable after a store switch. Same master secret (`Program.cs:63-64`, `appsettings.json:94-95`), same HKDF primitive as `StoreDataKeyProvider.cs:20`, different `info` label → key separation without inventing a key source. |
| AEAD | AES-256-GCM, 12-byte nonce, 16-byte tag, AAD = `UTF8(userId.ToString("D"))` | AES-CBC; no AAD | Identical primitive and sizes to `StoreKeyWrapService.cs:11,13,30-31`. AAD binds the ciphertext to its row — a column copied onto another user fails to decrypt. `user.Id` is client-generated before persist (`CreateOwnerService.cs:39` uses `user.Id` at `:44` pre-save), so it is available at every write site. |
| Envelope | Single column: `Base64( 0x01 ‖ nonce[12] ‖ ct ‖ tag[16] )` → 73 bytes → 100 chars. Column `varchar(256)` nullable. | Three columns (value/nonce/version) | One column keeps the migration minimal and the leading version byte enables rotation with no schema change. 256 leaves headroom. |
| Placement | New `IOfflinePreHashProtector` / `OfflinePreHashProtector` in `Application/Abstractions/Authentication/` + `Application/Services/Authentication/`, ctor takes the master secret exactly like `StoreDataKeyProvider.cs:11-15`, registered next to `Program.cs:63-64`. | **EF value converter**; repository-level | The repo has **zero** `HasConversion`/`ValueConverter` occurrences (verified by grep) — a converter would be a brand-new Infrastructure pattern. It would also decrypt on *every* `User` read, including the 1000-row list queries (`UserRepository.cs:33,42,53`), and converters cannot see sibling properties, so the AAD binding would be impossible. The existing pattern is: crypto = an `Application` service behind an `Abstractions/Authentication` interface, wired in `Program.cs`. |

API — derivation and encryption are **fused** so no write site can persist a bare pre-hash by accident:

```csharp
string  Protect(string password, Guid userId);      // SHA256 -> Base64 -> AES-GCM -> envelope
string? Unprotect(string? envelope, Guid userId);   // null in -> null out
```

### D2 — The `NoTracking` trap, per write site

`ApplicationDbContext.cs:45` sets `QueryTrackingBehavior.NoTracking` globally. `GenericRepository.UpdateAsync` (`:39-43`) is what attaches — it sets whole-entity `EntityState.Modified`.

| Write site | Shape | Needs `Update()`? | Saved by |
|---|---|---|---|
| `CreateOwnerService.cs:38-40` | `User.Create` → `AddAsync` | **No** — tracked as `Added` | `RegisterCommand.cs:122` / `CreateOwnerCommand.cs:64` |
| `CreateStoreUserCommand.cs:60-64` | same `Added` shape | **No** | `:75` |
| `CreateReSellerCommand.cs:65-67` | same `Added` shape | **No** | `:76` |
| `UpdateUserPasswordCommand.cs:63` | query-then-mutate (`GetByIdAsync` → `FindAsync`, untracked) | **Already does it** at `:64` — set the new property *before* that line | `:65` |
| `AuthenticationService.cs:44` backfill | query-then-mutate | **Neither** — see D3 | itself |

### D3 — Backfill on login

Three verified facts force the shape:

1. **The login pipeline never calls `SaveChanges`.** `AuthenticationService` has no unit of work (ctor `:19-27`); `LoginCommandHandler.Handle` (`LoginCommand.cs:41-73`) never saves; `UnitOfWorkBehaviour.Handle` short-circuits unconditionally because `IsQuery()` hard-returns `true` (`UnitOfWorkBehaviour.cs:20-21, 36-40`). The backfill must persist itself.
2. **`UpdateAsync` would be unsafe here.** It marks the whole entity `Modified` from a stale `NoTracking` snapshot loaded by `GetByLoginWithRelatedAsync` (`UserRepository.cs:83-97`) — a concurrent admin password change (`UpdateUserPasswordCommand.cs:63`) or `SetMyStore` racing a login would be clobbered.
3. Idempotence must be atomic, not read-then-write.

**Choice**: a new `IUserRepository` method issuing a conditional single-column UPDATE (EF Core 8.0.1, `Infrastructure.csproj:10`):

```csharp
_users.IgnoreQueryFilters()
      .Where(u => u.Id == userId && u.OfflinePasswordPreHash == null)
      .ExecuteUpdateAsync(s => s.SetProperty(u => u.OfflinePasswordPreHash, envelope), ct);
```

- `IgnoreQueryFilters()` is **required** — login is anonymous; the read at `UserRepository.cs:95` already does it.
- `WHERE ... IS NULL` is the authoritative race guard: under concurrent logins the second updates 0 rows. Either ciphertext decrypts to the same plaintext, so a lost update is harmless.
- `ExecuteUpdate` emits SQL immediately and bypasses the change tracker — the `NoTracking` trap does not apply and no `SaveChanges` is needed.
- **New pattern caveat**: zero `ExecuteUpdateAsync` occurrences today (verified by grep). Justified because the existing pattern is both unsafe (2) and unsaved (1) on this path.

**Guard**: cheap in-memory `if (user.OfflinePasswordPreHash is null)` first (avoids a DB roundtrip on every login), then the conditional UPDATE.

**Placement**: inside `AuthenticationService.IsValidUserAsync`, immediately after the successful `VerifyPassword` at `:44`, **before** the reseller/owner/store branches (`:50-75`). `IsValidUserAsync` returns only a `Guid` (`LoginCommand.cs:45`), so `LoginCommandHandler` has no `User` and would need a second query. Running before the activity branches is correct: the pre-hash attests *password correctness*; the roster carries `IsActive` separately (`ExportOfflineRosterQuery.cs:123`).

**Failure isolation**: wrap in `try/catch` + `LogWarning`. A backfill failure must never turn a valid login into a 500 (`LoginCommand.cs:67-72`).

### D4 — Export shape: null verifier, user NOT skipped

```csharp
var preHash  = _preHashProtector.Unprotect(su.User.OfflinePasswordPreHash, su.UserId);
var verifier = preHash is null ? null : _offlineVerifierService.CreateVerifier(preHash);
var wrapped  = preHash is null ? null : _storeKeyWrapService.WrapDek(preHash, dek);
// Verifier = verifier is null ? null : new OfflineVerifierDto { ... }
// WrappedDek/WrapSalt/WrapIv = wrapped?.X ?? string.Empty;  WrapIterations = wrapped?.Iterations ?? 0
```

**Emit the user with `Verifier: null` + empty wrap fields; do not skip.**

- Skipping breaks the whole point: an absent user hits `offline-auth-service.ts:97-103` → `OfflineUserNotFoundError`, which that file documents at `:99-102` as "rejected like a wrong password" — the exact misdiagnosis this change removes.
- The roster is also the offline **authorization** source (`ExportOfflineRosterQuery.cs:124-126`); dropping the row would silently strip a real user from the store.
- The frontend already represents this: `roster-types.ts:31-33` types wrap fields optional, and `offline-auth-service.ts:127` gates on `user.wrappedDek && user.wrapSalt && user.wrapIv` — empty strings fall through to "no DEK", today's v1 behavior. `roster-serializer.ts` is JSON-transparent (`:63` stringify / `:118` parse) and represents `null` losslessly — **no serializer change**.

### D5 — Migration

Additive: one nullable `character varying(256)` column on `Users`, named per `20260804125006_Add-OfflineRosterTtlDays`.

**No backfill SQL is possible, and this is stated deliberately.** The value requires the plaintext password, which the database has never held — `CreateOwnerService.cs:38`, `CreateStoreUserCommand.cs:60` and `CreateReSellerCommand.cs:65` all hash before persisting, and Argon2id is not invertible. Every existing row starts `NULL` and is filled by D3 on next login. Contrast `20260728194358_Backfill-PaymentStartDate-Null` + `PaymentStartDateBackfill.cs`, whose input *was* derivable from existing data.

The `HasData`-seeded admin (`UserEntityTypeConfiguration.cs:40-44`) must stay `NULL` — a hardcoded pre-hash would ship a password oracle in source.

**Run these yourself (this phase runs no `dotnet`):**

```bash
dotnet ef migrations add "Add-OfflinePasswordPreHash" \
  --project backend/src/Infrastructure/Infrastructure.csproj \
  --startup-project backend/src/SMCA.WebApi/SMCA.WebApi.csproj \
  --output-dir Migrations
dotnet build backend/src/SMCA.sln
dotnet test backend/src/Application.Tests/Application.Tests.csproj
dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj
```

⚠️ NOT VERIFIED: the exact `--project/--startup-project` paths (inferred from the solution layout, not executed), and whether EF regenerates the `HasData` seed row in the migration because the entity gained a property.

### D6 — One KAT vector, both sides

Adopt `docs/contracts/offline-roster-dek-kat.json` as the single source. **All crypto values stay** — the vector is already correct under the new semantics; only the field name lied.

| Side | Change | Path resolution |
|---|---|---|
| Vector | `storedPasswordHash` → `passwordPreHash` (`:3`, value `AIxwOS46v70PpHu8LtlqqZvUnhWXJ/y6Dy5qvrOp1gE=` unchanged — orchestrator-verified as `Base64(SHA256("Password123"))`); bump `_header.backendCommitSha` (`:13`) | — |
| .NET | `StoreKeyWrapInteropTests.cs`: rename `KatVector.StoredPasswordHash` (`:26`) and its 2 uses (`:56`, `:97`). **Add** `Convert.ToBase64String(SHA256.HashData(Encoding.UTF8.GetBytes(v.Password))).Should().Be(v.PasswordPreHash)` — this assertion is what makes the vector cross-stack instead of self-referential. | Unchanged: `AppContext.BaseDirectory` (`:39`) works because `Application.Tests.csproj:34-35` links the file into output. |
| TypeScript | `dek-unwrap.kat.test.ts`: repoint the fixture (`:6`), `kat.expectedDekBase64` → `kat.expectedDek` (`:20`). Delete `__tests__/__fixtures__/dek-kat.json`. | `readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../'.repeat(8), 'docs/contracts/offline-roster-dek-kat.json'))` — 8 levels from `__tests__` reaches the repo root. **Not** a static import: Vitest's Vite root is `apps/web-store-pos` (`vitest.config.ts` sets no `root`/`server.fs.allow`), so an import 8 levels above it risks `fs.strict` denial. ⚠️ NOT VERIFIED that a static import is actually denied — `readFileSync` sidesteps the question. |

The proof already exists in the test body: `:14` calls `unwrapDek(kat.password, ...)`, which internally computes `sha256Base64(password)` (`dek-unwrap.ts:48`) → exactly `passwordPreHash` → the same KEK as .NET's `Encoding.UTF8.GetBytes(v.PasswordPreHash)` (`StoreKeyWrapInteropTests.cs:56`). It becomes a cross-stack proof only once both sides read the same bytes.

### D7 — Frontend delta (small, 4 files + 1 new test)

| File | Change | Size |
|---|---|---|
| `roster-types.ts:24` | `verifier: OfflineVerifier \| null` | 1 line |
| `dek-unwrap.ts:10-12` | Comment only — the claim "matches `Encoding.UTF8.GetBytes(su.User.Password)`" is now false; it matches the decrypted `User.OfflinePasswordPreHash` | comment |
| `__tests__/dek-unwrap.kat.test.ts` | Repoint + field rename (D6) | ~4 lines |
| `__tests__/__fixtures__/dek-kat.json` | Delete | — |
| new sibling test | `verifier: null` → `OfflineVerifierError` | new file |

`offline-auth-service.ts`: **zero changes** — the `!user.verifier` guard at `:106` already short-circuits; it just never receives a `null` today. `roster-serializer.ts`, `offline-crypto.ts`, `roster-store.ts`, `roster-http-service.ts`: zero changes.

## Data Flow

```
 register / create-user / create-reseller / change-password / login-success
             │  plaintext password (only place it exists)
             ▼
   Protect(password, userId) = AESGCM( HKDF(master,"…prehash-v1"), Base64(SHA256(pw)), aad=userId )
             ▼
   User.OfflinePasswordPreHash  (varchar(256) NULL, ciphertext envelope)
             │
             ▼  Unprotect(...)  ── null ──► Verifier: null + empty wrap ──► OfflineVerifierError
        preHash (44-char Base64)
             ├──► CreateVerifier(preHash) ──► Verifier{Hash,Salt,Iterations}
             └──► WrapDek(preHash, dek)   ──► WrappedDek/WrapSalt/WrapIv/WrapIterations
                                   │  roster bundle (wire)
                                   ▼
   browser: sha256Base64(typed pw) ──► pbkdf2 ──► verify + unwrapDek   ✅ same bytes
```

## File Changes

| File | Action | Description |
|---|---|---|
| `Application/Abstractions/Authentication/IOfflinePreHashProtector.cs` | Create | `Protect`/`Unprotect` |
| `Application/Services/Authentication/OfflinePreHashProtector.cs` | Create | HKDF + AES-GCM envelope (D1) |
| `SMCA.WebApi/Program.cs:63-64` | Modify | Register alongside `StoreDataKeyProvider` |
| `Domain/Entities/Users/User.cs` | Modify | `public string? OfflinePasswordPreHash { get; set; }` |
| `Infrastructure/.../UserEntityTypeConfiguration.cs` | Modify | `.Property(x => x.OfflinePasswordPreHash).HasMaxLength(256)` |
| `Domain/Interfaces/Repositories/IUserRepository.cs` + `Infrastructure/.../UserRepository.cs` | Modify | `SetOfflinePasswordPreHashIfNullAsync` (D3) |
| `Infrastructure/Migrations/{ts}_Add-OfflinePasswordPreHash.*` | Create | Additive column + snapshot (D5) |
| `CreateOwnerService.cs:38`, `CreateStoreUserCommand.cs:60`, `CreateReSellerCommand.cs:65`, `UpdateUserPasswordCommand.cs:63` | Modify | `Protect(...)` before the existing persist call |
| `Application/Services/Authentication/AuthenticationService.cs:44` | Modify | Guarded, self-persisting, failure-isolated backfill |
| `ExportOfflineRosterQuery.cs:115-116,131-143` | Modify | Unprotect once; null → `Verifier: null` (D4) |
| `Application/Dtos/.../OfflineRosterUserDto.cs:18` | Modify | `OfflineVerifierDto? Verifier { get; set; }` (drop `= new()`) |
| `docs/contracts/offline-roster-dek-kat.json:3,13` | Modify | Field rename + commit SHA (D6) |
| `openspec/specs/offline-auth/spec.md` R3/R11/R12/R17 | Modify | Key material = persisted pre-hash; `Verifier` nullable |
| 4 frontend files + 1 new test | Modify/Create/Delete | D7 |

## Testing Strategy

| Layer | What | How |
|---|---|---|
| Unit (.NET) | `OfflinePreHashProtectorTests` — round-trip, wrong-`userId` AAD rejects, `null` passthrough, version byte pinned | New file, `Application.Tests/Services/Authentication/` |
| Unit (.NET) | `ExportOfflineRosterQueryHandlerTests` (~`:189-193` asserts `CreateVerifier(su.User.Password)`) → assert the unprotected pre-hash; **add** a null-pre-hash → `Verifier: null` case | Rewrite mock setups. Not E2E — free to change |
| Unit (.NET) | `OfflineVerifierServiceTests`, `StoreKeyWrapServiceTests` | Signatures unchanged; local-variable renames only |
| Interop (.NET) | `StoreKeyWrapInteropTests` + the new `SHA256(password) == passwordPreHash` assertion | D6 |
| Interop (TS) | `dek-unwrap.kat.test.ts` on the shared vector | D6 — `npx turbo run test --force` |
| Unit (TS) | `verifier: null` → `OfflineVerifierError` | New sibling test |
| E2E | Only authorized edits (below). **No assertion changes.** | — |

**E2E delta, strictly within the granted authorization:**

- `ExportOfflineRosterTests.cs:252-263` and `:530-541` — replace the DB read of `u.Password` with the constant `Convert.ToBase64String(SHA256.HashData(Encoding.UTF8.GetBytes("Password123")))`. This *strengthens* both tests: they stop validating the backend against itself and start validating it against the frontend's published convention.
- Seed helpers `SeedStoreUserAsync (:610-621)`, `SeedStoreUserWithFeatureAsync (:627-640)`, `DbTestHelpers.SeedSuperAdminAsync (:46-57)` / `SeedInactiveUserAsync (:59-71)`, `AuthzSeed (:30, :54, :76, :87)` — after `User.Create(...)`, set the pre-hash via `IOfflinePreHashProtector` resolved from `scope.ServiceProvider`, the same idiom as `ExportOfflineRosterTests.cs:543-544` resolving `IStoreDataKeyProvider`. **Not** via a locally-rebuilt config like `DbTestHelpers.CreateHasher() (:28-41)`: `StoreEncryption:MasterSecret` lives only in `SMCA.WebApi/appsettings.json:94-95` and is **absent** from `SMCA.WebApi.E2ETests/appsettings.Tests.json`.
- `SuperAdmin_export_rawPassword_throwsAuthenticationTagMismatch (:558-587)` — **completely untouched**, and it stays both green and meaningful: `UnwrapDek("Password123", …) (:577)` derives the KEK from raw plaintext, still ≠ `Base64(SHA256("Password123"))`. It stays green *only because* its seed helper now sets a pre-hash — without one, `WrappedDek` is `""`, so `Convert.FromBase64String("")` makes `wrapped[..^16]` at `:601` throw `ArgumentOutOfRangeException` instead. **That is precisely why the seed-helper authorization was necessary.**
- `SuperAdmin_export_roster_returns_full_bundle (:34)`, which asserts non-empty `Verifier.Hash`/`WrappedDek` at `:64-72`, goes green unchanged for the same reason.
- Anything beyond this list: **stop and ask.**

## Migration / Rollout

Additive column, `NULL` for every existing row. Deploy order: migration → API. Users get offline access on their next online login. Devices lose nothing — every roster exported since Argon2id is already unusable. Rollback: revert commits + down-migration drops the column.

## Open Questions

- [ ] **Login persists nothing today.** `LoginCommandHandler` adds a `RefreshToken (:58)` that no `SaveChanges` ever commits (`UnitOfWorkBehaviour.cs:36-40` always short-circuits; grep found 0 `RefreshToken` references under `SMCA.WebApi.E2ETests`). Either refresh tokens are silently not persisted — a pre-existing bug outside this scope — or a save happens somewhere I did not find. D3 does not depend on the answer (it self-persists), but you should know.
- [ ] **Key rotation.** Rotating `StoreEncryption:MasterSecret` invalidates every stored pre-hash with no re-derivation path (the plaintext is gone); recovery is "everyone re-logs in". Same failure mode as today's DEK. Recommendation: the leading version byte is enough — no extra column.
- [ ] **AAD = userId** assumes user ids are never reassigned. ⚠️ NOT VERIFIED — I did not audit for a user-id remap operation.
