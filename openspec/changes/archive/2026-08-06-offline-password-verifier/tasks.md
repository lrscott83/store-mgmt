# Tasks: offline-password-verifier

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~500-650 (crypto service + entity/migration + 5 write sites + export query + 5 backend test files + 6 authorized E2E seed edits + KAT rename + 5 frontend files) |
| 400-line budget risk | High |
| Chained PRs recommended | No — delivery is fixed commits-only on the current branch (no PR/chain splitting per task instructions) |
| Suggested split | Single branch, 5 work-unit commits (below) |
| Delivery strategy | commits-only (fixed by launch instructions, not ask-on-risk) |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units (commits, not PRs)

| Unit | Goal | Notes |
|------|------|-------|
| WU1 | Crypto protector + `User` column + migration prep + DI | Phase 1. Migration itself is BLOCKED ON USER (1.7). |
| WU2 | 4 write sites + login backfill | Phase 2-3. Depends on WU1. |
| WU3 | Export query/DTO + backend tests + KAT rename | Phase 4-5, 7. Depends on WU1-2. |
| WU4 | Authorized E2E seed-helper edits ONLY | Phase 6. Depends on WU1-3; touches only the exhaustive list. |
| WU5 | Frontend delta + tests | Phase 8. Independent of WU1-4 once `roster-types.ts` shape is agreed; run after backend so the KAT rename (7.1) is already committed. |

## Phase 1: Foundation — Crypto, Entity, Migration

- [x] 1.1 Create `IOfflinePreHashProtector` (`Application/Abstractions/Authentication/IOfflinePreHashProtector.cs`): `string Protect(string password, Guid userId)`, `string? Unprotect(string? envelope, Guid userId)`. → satisfies R20/R22.
- [x] 1.2 Create `OfflinePreHashProtector` (`Application/Services/Authentication/OfflinePreHashProtector.cs`), ctor `(string masterSecret)` mirroring `StoreDataKeyProvider.cs:11-15`. Key = `HKDF.DeriveKey(SHA256, UTF8(masterSecret), 32, salt: null, info: UTF8("offline-password-prehash-v1"))`. AES-256-GCM: 12-byte nonce, 16-byte tag, AAD = `UTF8(userId.ToString("D"))`, plaintext = `Base64(SHA256(UTF8(password)))`. Envelope = `Base64(0x01‖nonce‖ct‖tag)`. → R22.
- [x] 1.3 Register `IOfflinePreHashProtector` in `SMCA.WebApi/Program.cs` next to `IStoreDataKeyProvider` (`Program.cs:63-64`), same `StoreEncryption:MasterSecret` config key.
- [x] 1.4 `Domain/Entities/Users/User.cs` — add `public string? OfflinePasswordPreHash { get; set; }`.
- [x] 1.5 `UserEntityTypeConfiguration.cs` — `.Property(x => x.OfflinePasswordPreHash).HasMaxLength(256)`. Confirm the `HasData(admin)` seed (`:40-44`) is left with the column null — do not hardcode a value.
- [x] 1.6 Add `Task SetOfflinePasswordPreHashIfNullAsync(Guid userId, string envelope, CancellationToken ct)` to `IUserRepository.cs`; implement in `UserRepository.cs` per design D3: `_users.IgnoreQueryFilters().Where(u => u.Id == userId && u.OfflinePasswordPreHash == null).ExecuteUpdateAsync(s => s.SetProperty(u => u.OfflinePasswordPreHash, envelope), ct)`. First `ExecuteUpdateAsync` in this repo — read up before writing.
- [x] 1.7 **DONE by the user.** Scaffolded, reviewed and committed as `7d76ef1`, under the name `Add-OfflinePasswordPreHash-RefreshTokens-And-DueSoonDays`: the scaffold also picked up two pre-existing model changes that had never been migrated — the `RefreshTokens` table and a `DueSoonDays` `SystemConfiguration` row — so the name states them rather than hiding them. Purely additive; the "loss of data" warning EF printed comes from the `UpdateData … value: null` that sets the seeded admin's new column. Command run:
  ```
  dotnet ef migrations add "Add-OfflinePasswordPreHash" \
    --project backend/src/Infrastructure/Infrastructure.csproj \
    --startup-project backend/src/SMCA.WebApi/SMCA.WebApi.csproj \
    --output-dir Migrations
  ```
  Additive nullable `varchar(256)` column, filename convention like `20260804125006_Add-OfflineRosterTtlDays`. No backfill SQL is possible (plaintext unrecoverable). Verify the generated diff does not alter the `HasData(admin)` seed row unexpectedly (⚠️ NOT VERIFIED whether EF regenerates it for a new property).

## Phase 2: Write-Site Wiring (R20)

- [x] 2.1 `CreateOwnerService.cs:38` — inject `IOfflinePreHashProtector`; set `user.OfflinePasswordPreHash = _preHashProtector.Protect(password, user.Id)` after `User.Create` (`:39`), before `AddAsync` (`:40`).
- [x] 2.2 `CreateStoreUserCommand.cs:60` — same, before `AddAsync` (`:64`).
- [x] 2.3 `CreateReSellerCommand.cs:65` — same, before `AddAsync` (`:67`).
- [x] 2.4 `UpdateUserPasswordCommand.cs:63` — set `user.OfflinePasswordPreHash = _preHashProtector.Protect(request.NewPassword, user.Id)` immediately before the `user.Password = ...` line (`:63`), still before `UpdateAsync` (`:64`). All four are `Added`/already-`Update`d shapes — no extra tracking fix needed (D2).

## Phase 3: Login Backfill (R21, D3)

- [x] 3.1 `AuthenticationService.cs` — inject the new repo method + `IOfflinePreHashProtector`. After the successful `VerifyPassword` at `:44`, before the reseller/owner/store branches (`:50`): `if (user.OfflinePasswordPreHash is null)`, `try` compute+persist via `SetOfflinePasswordPreHashIfNullAsync`, `catch` + `LogWarning` — a backfill failure must never turn a valid login into a 500.
- [x] 3.2 Verify `IsValidUserAsync`'s existing signature for a `CancellationToken` before assuming one — check at apply time, add if absent. **Verified absent.** Left unchanged: it fans out to ~30 call sites in `AuthenticationServiceTests.cs`/`LoginCommandHandlerTests.cs` for no behavioral gain; the backfill uses `CancellationToken.None`.

## Phase 4: Export Query + DTO (R5, R11, R12, D4)

- [x] 4.1 `ExportOfflineRosterQuery.cs:115-116` — replace both `su.User.Password` reads with `var preHash = _preHashProtector.Unprotect(su.User.OfflinePasswordPreHash, su.UserId);` then call `CreateVerifier(preHash)`/`WrapDek(preHash, dek)` only when `preHash is not null`.
- [x] 4.2 `:131-143` — `Verifier = preHash is null ? null : new OfflineVerifierDto {...}`; `WrappedDek/WrapSalt/WrapIv = wrapped?.X ?? string.Empty`; `WrapIterations = wrapped?.Iterations ?? 0`. The user is still added to `rosterUsers` — never skipped.
- [x] 4.3 `OfflineRosterUserDto.cs:18` — `public OfflineVerifierDto? Verifier { get; set; }` (drop `= new()`).

## Phase 5: Backend Unit/Interop Tests (not E2E — free to change)

- [x] 5.1 New `Application.Tests/Services/Authentication/OfflinePreHashProtectorTests.cs`: round-trip, wrong-`userId` AAD rejects (`AuthenticationTagMismatchException`), `null` passthrough, version byte pinned.
- [x] 5.2 Rewrite `OfflineVerifierServiceTests.cs` for pre-hash input (signature unchanged).
- [x] 5.3 Rewrite `StoreKeyWrapServiceTests.cs` — same.
- [x] 5.4 Rewrite `ExportOfflineRosterQueryHandlerTests.cs` (mock setups near `:189-193`): assert unprotected pre-hash passed to `CreateVerifier`/`WrapDek`; add a null-pre-hash case asserting `Verifier: null` and neither service called.
- [x] 5.5 `StoreKeyWrapInteropTests.cs` — rename `KatVector.StoredPasswordHash` (`:26`) → `PasswordPreHash`, update the 2 uses (`:56`, `:97`); add `Fact` asserting `Convert.ToBase64String(SHA256.HashData(Encoding.UTF8.GetBytes(v.Password))).Should().Be(v.PasswordPreHash)` (R18).
- [x] 5.6 (unplanned, compile-fix) `AuthenticationServiceTests.cs` and `CreateOwnerServiceTests.cs` gained a required `IOfflinePreHashProtector` ctor param on the classes under test — both stubbed a `Mock<IOfflinePreHashProtector>`; `AuthenticationServiceTests.cs` also stubbed `SetOfflinePasswordPreHashIfNullAsync` since every test user starts with a null pre-hash.

## Phase 6: Authorized E2E Edits ONLY — exhaustive list, nothing beyond it

- [x] 6.1 `ExportOfflineRosterTests.cs:262-263` — key-material line only: read+decrypt `OfflinePasswordPreHash` (resolve `IOfflinePreHashProtector` from scope, same idiom as `:543-544`'s `IStoreDataKeyProvider`) instead of `Password`. No assertion changes.
- [x] 6.2 `ExportOfflineRosterTests.cs:541` — same edit.
- [x] 6.3 `SeedStoreUserAsync` (`:610`) — after `User.Create` (`:615`), resolve the protector and set `user.OfflinePasswordPreHash` before `db.Set<User>().Add(user)` (`:617`).
- [x] 6.4 `SeedStoreUserWithFeatureAsync` (`:627`) — same, before `:634`.
- [x] 6.5 `DbTestHelpers.SeedSuperAdminAsync` (`:46`) and `SeedInactiveUserAsync` (`:59`) — same pattern.
- [x] 6.6 `AuthzSeed.cs` — same pattern at each `User.Create` call site (`:30`, `:54`, `:76`, `:87`).
- [x] 6.7 Do NOT touch `SuperAdmin_export_rawPassword_throwsAuthenticationTagMismatch` (`:558-587`) — zero edits, including `:577`'s literal `"Password123"` — it is the negative control. **Confirmed untouched.**
- [x] 6.8 **STOP-AND-ASK**: any E2E file/line/assertion outside 6.1-6.7 that appears to need a change. Do not touch it — name it and ask the user first, per `CLAUDE.md`. **Nothing beyond the exhaustive list was needed** — `git diff --stat backend/src/SMCA.WebApi.E2ETests/` shows exactly the 3 authorized files.

## Phase 7: KAT Vector (R18, D6)

- [x] 7.1 `docs/contracts/offline-roster-dek-kat.json` — rename `storedPasswordHash` → `passwordPreHash` (`:3`, value unchanged, already equals `Base64(SHA256("Password123"))`); bump `_header.backendCommitSha` (`:13`) to the WU3 commit SHA once known. → `176a98d382979c6fc27a2db4e63a6b627e3ce8d5`.

## Phase 8: Frontend Delta (D7) — implementer runs `npx turbo run test --force` from `frontend-react/`

- [x] 8.1 `roster-types.ts:24` — `verifier: OfflineVerifier | null`.
- [x] 8.2 `dek-unwrap.ts:10-12` — fix stale comment: matches decrypted `User.OfflinePasswordPreHash`, not `User.Password`.
- [x] 8.3 `__tests__/dek-unwrap.kat.test.ts` — repoint import (`:6`) via `readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../'.repeat(8), 'docs/contracts/offline-roster-dek-kat.json'))`; `kat.expectedDekBase64` → `kat.expectedDek` (`:20`); add `sha256Base64(kat.password) === kat.passwordPreHash` assertion.
- [x] 8.4 Delete `__tests__/__fixtures__/dek-kat.json`.
- [x] 8.5 New sibling test (e.g. `offline-auth-service.verifier-null.test.ts`): a roster user with `verifier: null` throws `OfflineVerifierError`, never `OfflineInvalidPasswordError`.
- [x] 8.6 Run `npx turbo run test --force` from `frontend-react/`; confirm offline-* suites green. Cited results must come from this forced run, never a cached replay. → **179 files / 2375 tests passed, 0 cached, no type errors.**
- [x] 8.7 (unplanned, spec-completeness) `roster-types.test.ts` gained 2 cases for the offline-roster-bundle delta's "v3 bundle with a null verifier is a valid shape" MUST scenario, not otherwise exercised by any listed task.

## Phase 9: Spec Correction + Wrap-Up

- [x] 9.1 Note only — do not edit now: `openspec/specs/offline-auth/spec.md` R3/R5/R11/R12/R17/R18 corrections are already drafted in this change's delta specs; apply at `sdd-archive` time.
- [x] 9.2 **DONE — all green on the user's machine**: `dotnet build backend/src/SMCA.sln` 0 errors, `Application.Tests` 318/318, `SMCA.WebApi.E2ETests` 305/305, frontend `npx turbo run test --force` 2375 tests across 179 files with 0 cached. Original wording: after the user runs 1.7's migration plus `dotnet build backend/src/SMCA.sln`, `dotnet test backend/src/Application.Tests/Application.Tests.csproj`, `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj` and reports green, commit WU1-WU5 on `feat/offline-password-verifier`. **WU1-WU5 + 2 small follow-up commits (KAT SHA pin, ctor compile-fix) are already committed** on `feat/offline-password-verifier` — this task now only tracks the user's build/test verification. No push, no PR, no `Co-Authored-By` (honored).

## Out of Scope (recorded, no task)

- `LoginCommandHandler.cs:58`'s uncommitted `RefreshToken` — pre-existing possible bug, unrelated to this change.
- Master-secret rotation has no re-derivation path for `OfflinePasswordPreHash`; recovery is "everyone logs in online once" — same failure mode as the existing DEK. Not fixed here.
