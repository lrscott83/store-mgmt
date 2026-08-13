# Tasks: Login Delivers Wrapped DEK to Every Authenticated User

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~380–430 (prod+unit ~120, E2E ~260–310) |
| 400-line budget risk | High (sits at ~95% of budget; E2E file is growth risk) |
| Chained PRs recommended | Yes (2 reviewable units) |
| Suggested split | Unit 1 prod+unit → Unit 2 E2E |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending (commit-only on new branch; no PR topology) |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units (commit-only batches on one branch)

| Unit | Goal | Batch | Focused test command | Runtime harness | Rollback boundary |
|------|------|-------|----------------------|-----------------|-------------------|
| 1 | AuthDto + handler wrap + unit tests | Commit 1 | `dotnet test backend/src/Application.Tests/Application.Tests.csproj` | N/A — mock-level slice; real wiring proven by Unit 2 | Revert commit 1 (4 files; no E2E impact) |
| 2 | New `AuthLoginDekWrapTests.cs` (6 facts) | Commit 2 | `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~AuthLoginDekWrapTests"` | Real `POST /api/v1/auth/login` via WebAppFixture (PostgreSQL localhost:5432, db `smca_test`) | Delete the new file |

## Phase 1: Foundation

- [x] 1.1 `backend/src/Application/Dtos/Authentication/AuthDto.cs`: add 3 optional trailing params `string WrappedDek = "", string WrapSalt = "", string WrapIv = ""` — Register/Refresh construction sites compile unchanged

## Phase 2: Core Implementation (strict TDD: RED → GREEN)

- [x] 2.1 RED `backend/src/Application.Tests/Authentication/Commands/Login/LoginCommandHandlerTests.cs`: +4 mocks (`IUserRepository`, `IOfflinePreHashProtector`, `IStoreDataKeyProvider`, `IStoreKeyWrapService`), ctor extension, +4 `[Fact]`s (populated fields; wrap throw → success+empty; null preHash → empty; `Guid.Empty` store → empty + `GetDek` never called) — run, expect fail
- [x] 2.2 GREEN `backend/src/Application/Features/Authentication/Commands/Login/LoginCommand.cs`: ctor +4 deps; private `TryBuildLoginDekWrapAsync(Guid userId, CancellationToken)` — guards (user null, preHash null, `SelectedStoreId == Guid.Empty`) + try/catch → `LogWarning` + `("", "", "")`
- [x] 2.3 GREEN `LoginCommand.cs`: after `SaveChangesAsync` (line 63) re-query `GetUserByIdIgnoreQueryFiltersAsync(userId.ToString())` (NoTracking/ExecuteUpdateAsync stale entity); call helper; pass 3 fields into `AuthDto` (line 65)

## Phase 3: E2E — New `backend/src/SMCA.WebApi.E2ETests/Auth/AuthLoginDekWrapTests.cs`

- [x] 3.1 Skeleton: `[Collection("e2e")]`, local `LoginDekWrapData` DTO, private static `UnwrapDek` (PBKDF2+AES-GCM, `KekIterations = 210_000`), private `SeedStoreUserWithoutPreHashAsync` (mirror `AuthzSeed.SeedStoreUserAsync`, omit pre-hash) — `ExportOfflineRosterTests.cs`/`TestDtos.cs` untouched
- [x] 3.2 Fact: StoreUser (`SeedStoreUserAsync`) → 200, 3 non-empty, `UnwrapDek` bytes ≡ `GetDek(storeId)`
- [x] 3.3 Fact: OwnerAdmin (`SeedOwnerAdminAsync`) → 200, non-empty, unwrap ≡ `GetDek(storeId)`
- [x] 3.4 Fact: first-login (seeded w/o pre-hash) → 3 non-empty + DB `OfflinePasswordPreHash` non-null
- [x] 3.5 Fact: SuperAdmin (no SelectedStoreId) → 200 + 3 empty
- [x] 3.6 Facts: wrong password → 401 no AuthDto; `StoreSeed.DeactivateStoreAsync` → 403 `Store.Inactive` no AuthDto
- [x] 3.7 `finally` cleanup per fact: `AuthzSeed.CleanupStoreGraphAsync` / `DbTestHelpers.CleanupUserAsync` (FK-safe order)

## Phase 4: Verification

- [x] 4.1 `dotnet build backend/src/SMCA.sln`
- [x] 4.2 `dotnet test backend/src/Application.Tests/Application.Tests.csproj` (4 new facts green)
- [x] 4.3 E2E filtered run (PostgreSQL localhost:5432, db `smca_test` required)
- [x] 4.4 `dotnet test backend/src/SMCA.sln` — existing suites green; roster E2E (`ExportOfflineRosterTests`) untouched

## Phase 5: Cleanup / Guard

- [x] 5.1 `git status` — only the 4 planned files changed; no existing E2E/roster/support edits; no temp code