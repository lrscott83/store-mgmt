# Design: Login Delivers Wrapped DEK to Every Authenticated User

## Technical Approach

Inline roster-parity wrap in `LoginCommandHandler` (Approach 1 from exploration): after `AuthenticationService.IsValidUserAsync` (which runs the pre-hash backfill) and after the refresh-token `SaveChangesAsync`, re-query the user via `GetUserByIdIgnoreQueryFiltersAsync(userId.ToString())`, then `Unprotect(stored envelope)` → `GetDek(SelectedStoreId)` → `WrapDek(preHash, dek)`. `AuthDto` gains 3 trailing optional string params defaulting to `""`, so Register/Refresh construction sites compile unchanged. All failures degrade to empty fields; login never fails. Roster export untouched. Satisfies `auth-login-wrapped-dek` R1–R4 and `auth-login-e2e` R1–R4.

## Architecture Decisions

| Decision | Options | Tradeoff | Choice |
|---|---|---|---|
| Where wrap lives | (1) inline helper in handler (roster precedent); (2) new `ILoginDekWrapService`; (3) extend auth service result | (1) YAGNI, mirrors `ExportOfflineRosterQuery.cs:118-120`, same services ⇒ byte-parity; (2) abstraction for one call site; (3) widest blast radius, loaded entity still stale | **Inline helper** |
| Re-query source | `GetUserByIdIgnoreQueryFiltersAsync` vs `GetByLoginWithRelatedAsync` again | Login is AllowAnonymous — tenant filter would hide the user; `RefreshCommand.cs:61` precedent | **`GetUserByIdIgnoreQueryFiltersAsync(userId.ToString())`** — mandatory because `NoTracking` + `ExecuteUpdateAsync` leave the loaded entity's `OfflinePasswordPreHash` stale (CLAUDE.md gotcha) |
| KEK input | Decrypted stored `OfflinePasswordPreHash` vs `Base64(SHA256(password))` computed inline | Stored envelope = roster parity (R2); inline = byte-identical but bypasses the envelope the roster decrypts | **`Unprotect(user.OfflinePasswordPreHash, userId)`**, never `User.Password` (Argon2id PHC) |
| Degrade policy | Empty tuple vs throw into outer catch | Outer catch returns 500 — violates "login never fails" (R4) | **Helper try/catch → `LogWarning` + `("", "", "")`** |
| Guard order | Check `preHash null` / `Guid.Empty` explicitly | `Unprotect(null)` returns null; `GetDek(Guid.Empty)` derives a key matching nothing | **Guard user null, preHash null, `SelectedStoreId == Guid.Empty` → empty tuple** |
| AuthDto shape | 3 trailing optional `string` params `= ""` | Additive default keeps `RegisterCommand.cs:132` and `RefreshCommand.cs:85` compiling and wire-empty; matches `OfflineRosterUserDto` empty-string convention | **`string WrappedDek = "", string WrapSalt = "", string WrapIv = ""`** |
| E2E DTO/helper | Local DTO + local `UnwrapDek` vs reuse `TestDtos.AuthData`/`ExportOfflineRosterTests` | Spec R1 mandates the new file defines its own; existing files untouchable | **Local `LoginDekWrapData` + local `UnwrapDek` (PBKDF2+AES-GCM, 210_000 iters)** |
| First-login seed | Inline private helper in new file vs new support file | One test needs it; new file stays self-contained; support files untouched | **Inline `SeedStoreUserWithoutPreHashAsync`** (mirrors `AuthzSeed.SeedStoreUserAsync`, omits pre-hash line) |

## Data Flow

```
POST /api/v1/auth/login
  └─ IsValidUserAsync ── backfill preHash (ExecuteUpdateAsync) ── Result<Guid>
       └─ GenerateToken + RefreshToken; SaveChangesAsync
            └─ TryBuildLoginDekWrapAsync(userId):
                 GetUserByIdIgnoreQueryFiltersAsync ── fresh OfflinePasswordPreHash
                   → Unprotect(envelope, userId) → preHash?
                   → GetDek(SelectedStoreId) → dek
                   → WrapDek(preHash, dek) → (WrappedDek, WrapSalt, WrapIv)
                   └─ any null/throw ⇒ ("", "", "") + warning
            └─ new AuthDto(..., wrappedDek, wrapSalt, wrapIv)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `backend/src/Application/Dtos/Authentication/AuthDto.cs` | Modify | +3 optional trailing params (`string WrappedDek = "", string WrapSalt = "", string WrapIv = ""`) |
| `backend/src/Application/Features/Authentication/Commands/Login/LoginCommand.cs` | Modify | +4 ctor deps (`IUserRepository`, `IOfflinePreHashProtector`, `IStoreDataKeyProvider`, `IStoreKeyWrapService`); private `TryBuildLoginDekWrapAsync`; call after `SaveChangesAsync` (line 63), before `AuthDto` (line 65) |
| `backend/src/Application.Tests/Authentication/Commands/Login/LoginCommandHandlerTests.cs` | Modify | +4 mocks, ctor extension, +4 `[Fact]`s |
| `backend/src/SMCA.WebApi.E2ETests/Auth/AuthLoginDekWrapTests.cs` | Create | New E2E class (below) |
| `SMCA.WebApi/Program.cs`, `Infrastructure/DependencyInjection.cs` | — | No change — all 4 deps already registered (DI.cs:65, Program.cs:62-66) |

## Interfaces / Contracts

```csharp
// AuthDto — additive, trailing, defaulted
public sealed record AuthDto(string Login, string AuthToken, DateTime ExpiresIn,
    string? RefreshToken = null, DateTimeOffset? RefreshTokenExpiresAt = null,
    string WrappedDek = "", string WrapSalt = "", string WrapIv = "");

// Handler helper — private, returns empty on any degradation
private async Task<(string WrappedDek, string WrapSalt, string WrapIv)>
    TryBuildLoginDekWrapAsync(Guid userId, CancellationToken ct);
```

E2E file (new, namespace `SMCA.WebApi.E2ETests.Auth`, `[Collection("e2e")]`): private `LoginDekWrapData` DTO (Login/AuthToken/ExpiresIn/RefreshToken/RefreshTokenExpiresAt + WrappedDek/WrapSalt/WrapIv, all `string` = `""`), private static `UnwrapDek(storedPasswordHash, wrappedDek, wrapSalt, wrapIv)` with `const int KekIterations = 210_000` (mirrors `ExportOfflineRosterTests.UnwrapDek`), private `SeedStoreUserWithoutPreHashAsync` (mirrors `AuthzSeed.SeedStoreUserAsync` minus `OfflinePasswordPreHash`), reusing `AuthzSeed.StoreUserFixture`.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Populated wrap fields on success | `[Fact] Handle_WithValidCredentials_ShouldReturnWrappedDekFields` — mock repo returns user w/ preHash+SelectedStoreId; assert 3 fields |
| Unit | Wrap throw ⇒ success + empty | `[Fact] Handle_WhenWrapThrows_ShouldStillSucceedWithEmptyFields` — `Unprotect`/`WrapDek` throws; assert `Succeeded` + 3 empty |
| Unit | null preHash ⇒ empty | `[Fact] ...WhenRequeriedUserHasNullPreHash...` |
| Unit | `Guid.Empty` SelectedStoreId ⇒ empty | `[Fact] ...WhenSelectedStoreIdIsEmpty...` + verify `GetDek` never called |
| E2E | StoreUser byte-equality | `SeedStoreUserAsync` → login 200 → DB preHash via scope → `Unprotect` → `UnwrapDek` ≡ `GetDek(storeId)` |
| E2E | OwnerAdmin byte-equality | `SeedOwnerAdminAsync` → login 200 → same unwrap ≡ `GetDek(storeId)` |
| E2E | First-login backfill | seed w/o preHash → login → 3 fields non-empty + DB `OfflinePasswordPreHash` non-null |
| E2E | SuperAdmin empty | `SeedSuperAdminAsync` (no SelectedStoreId) → 200 + 3 empty |
| E2E | 401 / 403 no data | wrong password → 401; `StoreSeed.DeactivateStoreAsync` → 403 `Store.Inactive`; no AuthDto |
| E2E | Cleanup | `AuthzSeed.CleanupStoreGraphAsync(_factory, storeId, userIds...)` / `DbTestHelpers.CleanupUserAsync` in `finally` (per-fact) |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary.

## Migration / Rollout

No migration, no feature flag. Additive DTO params; handler wrap is opt-in per request. Rollback: remove 3 params + wrap block; delete new E2E file.

## Requirement → Design Map

- R1 (any user, no admin) → helper in login path; E2E StoreUser fact (plain role)
- R1/R2 (roster parity, stored preHash) → `Unprotect` envelope; byte-equality E2E
- R3 (after backfill) → call site after `IsValidUserAsync` + mandatory re-query; first-login E2E
- R4 (degrade; Register/Refresh empty) → guards + try/catch; default `""` params; unit facts
- e2e R1–R4 → new file facts + cleanup

## Open Questions

None blocking. Budget: prod+unit ~+120, E2E ~+260 ⇒ ~380 lines; if the E2E file grows, chain PRs (prod+unit | E2E).
