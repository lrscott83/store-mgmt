# Verification Report: offline-password-verifier

**Change**: offline-password-verifier
**Branch**: feat/offline-password-verifier (9 commits, main..HEAD)
**Mode**: static (no `dotnet` executed by this agent — build/test evidence supplied by the user, taken as-is per instructions)
**Verdict**: PASS WITH WARNINGS

## Completed Work Evidence (user-supplied, not re-run)

- `dotnet ef migrations add "Add-OfflinePasswordPreHash-RefreshTokens-And-DueSoonDays"` → committed `7d76ef1`
- `dotnet build backend/src/SMCA.sln` → 0 errors, 72 warnings
- `dotnet test backend/src/Application.Tests` → 318 passed, 0 failed
- `dotnet test backend/src/SMCA.WebApi.E2ETests` → 305 passed, 0 failed
- `npx turbo run test --force` (frontend) → 179 files / 2375 tests, 0 cached, 0 failed

## Task Completeness

Phases 1–8 of `tasks.md`: all checked items verified against code, all correct. Two items remain unchecked:

- `1.7` (EF migration) — code shows it is in fact done: `7d76ef1` adds `backend/src/Infrastructure/Migrations/20260806024450_Add-OfflinePasswordPreHash-RefreshTokens-And-DueSoonDays.{cs,Designer.cs}` plus a matching `ApplicationDbContextModelSnapshot.cs` update.
- `9.2` (user verification of build/test) — user-supplied evidence above confirms this happened.

**WARNING**: `tasks.md` still shows `1.7` and `9.2` as `[ ]` even though both are complete per the migration commit and the user's reported green build/test run. Documentation drift only — no code impact — but should be checked off before `sdd-archive` copies `tasks.md` into the archive record.

## Requirement-by-Requirement Compliance

### R20 — pre-hash persisted at every plaintext choke point
- `CreateOwnerService.cs:42` — `user.OfflinePasswordPreHash = _preHashProtector.Protect(password, user.Id);` before `AddAsync` (`:43`). PASS.
- `CreateStoreUserCommand.cs:67` — same, before `AddAsync` (`:68`). PASS.
- `CreateReSellerCommand.cs:70` — same, before `AddAsync` (`:71`). PASS.
- `UpdateUserPasswordCommand.cs:66-68` — `user.OfflinePasswordPreHash` set at `:66`, `user.Password` at `:67`, `UpdateAsync(user)` at `:68` — set happens before the `Update()` attach call, so the NoTracking trap does not apply (`CLAUDE.md`'s documented gotcha). PASS.

### R21 — login backfill, D3
- `AuthenticationService.cs:53-66` — guarded by `if (user.OfflinePasswordPreHash is null)` (`:53`), placed after successful `VerifyPassword` (`:47-51`) and before the reseller/owner/store branches (`:68+`), wrapped in `try/catch` + `LogWarning` (`:55-65`). PASS.
- `UserRepository.cs:99-104` — `SetOfflinePasswordPreHashIfNullAsync` issues `_users.IgnoreQueryFilters().Where(u => u.Id == userId && u.OfflinePasswordPreHash == null).ExecuteUpdateAsync(...)` — matches D3's conditional single-column UPDATE exactly, bypasses the change tracker (no `SaveChanges` needed, no NoTracking violation). PASS.
- Failed login never writes (verified by code path: backfill code is unreachable unless `VerifyPassword` already returned true at `:47`). PASS.
- Existing non-null pre-hash never recomputed (guarded by the `is null` check). PASS.

### R22 — encrypted at rest
- `OfflinePreHashProtector.cs:15-20` — `HKDF.DeriveKey(HashAlgorithmName.SHA256, UTF8(masterSecret), 32, salt: null, info: UTF8("offline-password-prehash-v1"))`. PASS, exact match.
- `Protect` (`:22-46`): plaintext = `Base64(SHA256(UTF8(password)))` (`:26`), AES-256-GCM (`AesGcm(_key, TagBytes=16)`, `NonceBytes=12`), AAD = `UTF8(userId.ToString("D"))` (`:28`), envelope = `0x01 ‖ nonce ‖ ct ‖ tag` then Base64 (`:39-45`). PASS, exact match to R22/D1.
- `Unprotect` (`:48-67`) — null-safe (`:50-51`), decrypts with the same AAD. PASS.
- `Program.cs:65-66` — registered `AddScoped<IOfflinePreHashProtector>`, same `StoreEncryption:MasterSecret` config key as `IStoreDataKeyProvider` (`:63-64`). PASS.
- `UserEntityTypeConfiguration.cs:30` — `varchar(256)` nullable; the `HasData(admin)` seed (`:42-46`) is left with no explicit pre-hash property set → stays `null`, and the migration's `UpdateData` (`Add-OfflinePasswordPreHash-....cs`) explicitly sets it to `null` for that row rather than a hardcoded value. PASS — no password oracle shipped.
- Export never serializes it — `OfflineRosterUserDto.cs` has no field named `OfflinePasswordPreHash`, only `Verifier`/wrap fields. PASS.

### R5 / R12 — export handler null-safety
- `ExportOfflineRosterQuery.cs:118-120` — `preHash = _preHashProtector.Unprotect(su.User.OfflinePasswordPreHash, su.UserId)`; `verifier`/`wrapped` computed only `if (preHash is not null)`. PASS.
- `:122-148` — user is always added to `rosterUsers`, `Verifier` is `null` when `verifier is null` else populated (`:135-140`), wrap fields fall back to `string.Empty`/`0` via `?? string.Empty` / `?? 0` (`:141-147`). User is never skipped. PASS.
- `ExportOfflineRosterQueryHandlerTests.cs` — new `Handle_NullPreHash_EmitsNullVerifierAndSkipsCreateVerifierAndWrapDek` test asserts `Verifier` null, wrap fields empty/zero, and `CreateVerifier`/`WrapDek` `Times.Never`. Covers R5/R12's negative scenario directly.
- `DEK loaded once`: `GetDek` called once outside the loop (`:96`), confirmed by existing test `Handle_...` (unchanged assertion, `mocks.StoreDataKeyProvider.Verify(..., Times.Once)` pre-existing, not modified in this diff beyond the new null-prehash test).

### R18 / D6 — KAT vector, both stacks
- `docs/contracts/offline-roster-dek-kat.json` — field renamed `storedPasswordHash` → `passwordPreHash` (value unchanged: `AIxwOS46v70PpHu8LtlqqZvUnhWXJ/y6Dy5qvrOp1gE=`), `_header.backendCommitSha` = `176a98d382979c6fc27a2db4e63a6b627e3ce8d5` matching the actual WU3 commit in `git log`. PASS.
- `StoreKeyWrapInteropTests.cs:90-100` — new `PasswordPreHash_independently_reproduces_from_password` asserts `SHA256.HashData(UTF8(v.Password))` Base64 equals `v.PasswordPreHash`, independent of `WrapDek`. PASS.
- `dek-unwrap.kat.test.ts:37-40` — new `sha256Base64(kat.password)` assertion equals `kat.passwordPreHash`, reads the same committed backend file via `readFileSync` 8 levels up. PASS. Old placeholder fixture `__tests__/__fixtures__/dek-kat.json` confirmed deleted (`find` returns nothing).

### E2E authorization (checked hardest)
- `git diff main...HEAD --stat -- backend/src/SMCA.WebApi.E2ETests/` → exactly 3 files: `ExportOfflineRosterTests.cs`, `Infrastructure/DbTestHelpers.cs`, `Infrastructure/AuthzSeed.cs`. No other E2E file touched. PASS.
- `ExportOfflineRosterTests.cs` diff (both hunks, `:253-263` and `:531-541` region) — only the key-material read line changed (`Select(u => u.Password)` → `Select(u => u.OfflinePasswordPreHash)` + `Unprotect`), zero assertion lines touched. PASS.
- `SeedStoreUserAsync`/`SeedStoreUserWithFeatureAsync` diff — only adds `preHashProtector.Protect(...)` before `db.Set<User>().Add(user)`, matching the exact authorized scope. PASS.
- `DbTestHelpers.cs` / `AuthzSeed.cs` diffs — same pattern at each `User.Create` seed site (`SeedSuperAdminAsync`, `SeedInactiveUserAsync`, and the 4 `AuthzSeed` sites). No assertions touched. PASS.
- `SuperAdmin_export_rawPassword_throwsAuthenticationTagMismatch` — extracted both versions from `git show main:...` and HEAD and diffed byte-for-byte: **identical**. PASS, confirmed with a direct diff, not inference.

### Migration (`7d76ef1`)
- `Up()`: `AddColumn<string>("OfflinePasswordPreHash", ...)`, `CreateTable("RefreshTokens", ...)`, `InsertData("SystemConfiguration", ... "DueSoonDays", "5")`, `UpdateData(..., "OfflinePasswordPreHash", value: null)` for the seeded admin row, two `CreateIndex`. No `DropColumn`/`DropTable`/narrowing `AlterColumn` in `Up()`. PASS — purely additive.
- `Down()` contains the expected drops for rollback — this is correct and does not violate the additive-`Up()` requirement.
- `RefreshTokens` table: confirmed pre-existing `Domain.Entities.Authentication.RefreshToken.cs` already existed on `main` (`git log` shows it added in commit `42deff4`, unrelated to this change) but had never been migrated — this migration is the first to create its table. Genuine pre-existing drift, correctly swept in.
- `DueSoonDays`: confirmed `SystemConfigurationEntityTypeConfiguration.cs:35-36` already has `HasData` for `SystemConfigurationType.DueSoonDays` (Id 4) on `main`, and `SMCA.WebApi.E2ETests/Infrastructure/BillingConfigSeed.cs:19` already documents "has no migration row today — it resolves via [HasData]" — confirms this was a genuine pre-existing drift, not invented scope creep.
- Migration name `Add-OfflinePasswordPreHash-RefreshTokens-And-DueSoonDays` accurately reflects all three additions. PASS.

### NoTracking gotcha (CLAUDE.md) — swept across every write site
- 3 create sites (`CreateOwnerService`, `CreateStoreUserCommand`, `CreateReSellerCommand`): entity is `Added` via `User.Create` + `AddAsync` — tracked, no `Update()` needed. Correct.
- `UpdateUserPasswordCommand`: query-then-mutate, but `UpdateAsync(user)` called at `:68` after mutation (`:66-67`) — attaches correctly. Correct.
- Login backfill: uses `ExecuteUpdateAsync`, bypasses the change tracker entirely — the NoTracking trap does not apply by construction. Correct.
No violation found anywhere in the diff.

### Frontend delta scope (D7)
- `git diff --stat` on `frontend-react/` confirms exactly: `roster-types.ts` (+9/-line), `dek-unwrap.ts` (comment-only, `:10-12`), `dek-unwrap.kat.test.ts` (repointed + new assertion), `__fixtures__/dek-kat.json` (deleted), new `offline-auth-service.verifier-null.test.ts`, and `roster-types.test.ts` (+2 v3-null-verifier cases, task 8.7 "unplanned but spec-completeness"). Nothing else.
- `offline-auth-service.ts` — confirmed zero diff (`git diff --stat` empty for that path) and its existing `!user.verifier` typeof guard (`:106-109`) is what makes the new null-verifier test pass without any code change. Matches D7's claim exactly.
- `roster-serializer.ts`, `roster-store.ts`, `roster-http-service.ts`, `offline-crypto.ts` — all confirmed zero diff.
- offline-auth-mode delta requirement ("null verifier degrades to `OfflineVerifierError`, never wrong password") — directly covered by the two new test cases in `offline-auth-service.verifier-null.test.ts:48-60`.
- offline-roster-bundle delta requirement ("v3 bundle with null verifier is valid shape") — directly covered by `roster-types.test.ts:64-76`.

## Findings

**CRITICAL**: none.

**WARNING**:
1. `openspec/changes/offline-password-verifier/tasks.md` items `1.7` and `9.2` remain unchecked (`[ ]`) despite being verifiably complete (migration committed as `7d76ef1`; user-reported `dotnet build`/`dotnet test` all green). Purely a documentation-sync issue — fix before `sdd-archive` so the archived task list reflects reality.

**SUGGESTION**: none beyond the above.

## Spec Compliance Matrix

| Requirement | Status | Evidence |
|---|---|---|
| R3 (PBKDF2 off pre-hash, not Password) | PASS | `OfflineVerifierServiceTests.cs` renamed to `preHash`, `ExportOfflineRosterQuery.cs:119` feeds decrypted pre-hash |
| R5 (nullable Verifier, user not skipped) | PASS | `ExportOfflineRosterQuery.cs:122-148`, `OfflineRosterUserDto.cs:18` |
| R11 (WrapDek only when pre-hash present) | PASS | `ExportOfflineRosterQuery.cs:120`, `StoreKeyWrapServiceTests.cs` renamed |
| R12 (conditional Wrap/CreateVerifier, DEK once) | PASS | `:96,118-120`; new handler test `Times.Never` |
| R17 (E2E DEK recoverability from pre-hash) | PASS | `ExportOfflineRosterTests.cs:253-263,533-541` byte-diffed |
| R18 (KAT vector + interop, both stacks) | PASS | `StoreKeyWrapInteropTests.cs:90-100`, `dek-unwrap.kat.test.ts:37-40` |
| R20 (persisted at 4 choke points) | PASS | 4 write sites read + confirmed |
| R21 (login backfill, guarded, self-persisting) | PASS | `AuthenticationService.cs:53-66`, `UserRepository.cs:99-104` |
| R22 (encrypted at rest, HKDF+AES-GCM) | PASS | `OfflinePreHashProtector.cs` full read |
| R23 (documented behavior, no code) | PASS (non-binding) | No compensating code required, none added |
| offline-auth-mode: null verifier → OfflineVerifierError | PASS | `offline-auth-service.verifier-null.test.ts` |
| offline-roster-bundle: v3 null verifier valid shape | PASS | `roster-types.test.ts:64-76` |
| offline-roster-bundle: genuine cross-stack KAT | PASS | both interop tests read the same committed JSON |
| E2E authorization scope (CLAUDE.md rule) | PASS | 3 files only, zero assertions changed, negative control byte-identical |

## Final Verdict

**PASS WITH WARNINGS** — one WARNING (tasks.md checkbox staleness on `1.7`/`9.2`), zero CRITICAL findings. Implementation matches spec, design, and the E2E authorization exhaustively and precisely at every `file:line` inspected.

---

**Archive-time note (2026-08-06)**: the WARNING above is resolved. `tasks.md` items `1.7` and `9.2` were checked off `[x]` in the working copy prior to this archive run (confirmed by direct read of `openspec/changes/offline-password-verifier/tasks.md` at archive time) and the archived copy of `tasks.md` in this same folder reflects that. No code was touched to resolve this WARNING — pure documentation sync, exactly as prescribed.
