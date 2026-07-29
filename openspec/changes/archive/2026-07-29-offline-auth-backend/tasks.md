# Tasks: offline-auth-backend

**Status**: Draft
**Last Updated**: 2026-07-29
**Dependencies**: All tasks are sequential within phases; phases can be parallelized as noted.

---

## Phase 1: OfflineVerifierService (PBKDF2)

### Task 1: Create IOfflineVerifierService interface + OfflineVerifierResult record

**Files to create:**
- `backend/src/Application/Abstractions/Authentication/IOfflineVerifierService.cs`

**What to implement:**
- Create the `OfflineVerifierResult` sealed record in the same file: `public sealed record OfflineVerifierResult(string Hash, string Salt, int Iterations)`
- Create `IOfflineVerifierService` interface with method: `OfflineVerifierResult CreateVerifier(string storedPasswordHash)`
- Namespace: `Application.Abstractions.Authentication` (matching `IHashPasswordService.cs`)

**How to verify:**
- Build: `dotnet build backend/src/Application/Application.csproj`

**Dependencies**: None

---

### Task 2: Create OfflineVerifierService implementation

**Files to create:**
- `backend/src/Application/Services/Authentication/OfflineVerifierService.cs`

**What to implement:**
- Implement `IOfflineVerifierService` using `Rfc2898DeriveBytes.Pbkdf2` (.NET 8 static API)
- Parameters:
  - Algorithm: `HashAlgorithmName.SHA256`
  - Iterations: 210,000
  - Salt: 16 bytes via `RandomNumberGenerator.GetBytes(16)`, Base64 encoded
  - Key length: 32 bytes, Base64 encoded
  - Input: `Encoding.UTF8.GetBytes(storedPasswordHash)` (the stored Base64 hash string)
- Use `RandomNumberGenerator.GetBytes()` for thread-safe salt generation (not `Random`)
- Class is sealed, no instance state beyond compile-time constants

**How to verify:**
- Build: `dotnet build backend/src/Application/Application.csproj`

**Dependencies**: Task 1

---

### Task 3: Create unit tests for OfflineVerifierService

**Files to create:**
- `backend/src/Application.Tests/Services/Authentication/OfflineVerifierServiceTests.cs`

**What to implement:**
- Create test class with `TestMocks` pattern (or no mocks needed — service is pure)
- Test 1: `CreateVerifier_produces_16byte_salt_and_reproducible_pbkdf2` — calls with known input, asserts `Iterations==210000`, `Salt` decodes to 16 bytes, `Hash` decodes to 32 bytes, independently recomputes PBKDF2 with same salt and confirms equality
- Test 2: `CreateVerifier_uses_a_fresh_salt_each_call` — calls twice with same input, asserts Salt differs and Hash differs
- Use `Rfc2898DeriveBytes.Pbkdf2` for independent recomputation in test

**How to verify:**
- `dotnet test backend/src/Application.Tests/Application.Tests.csproj --filter "FullyQualifiedName~OfflineVerifierServiceTests"`
- Expected: PASS (2 tests)

**Dependencies**: Task 2

---

### Task 4: Register OfflineVerifierService in DI

**Files to modify:**
- `backend/src/SMCA.WebApi/Program.cs`

**What to implement:**
- Add `using Application.Abstractions.Authentication;` and `using Application.Services.Authentication;` (add if not present)
- After line 57 (`builder.Services.AddScoped<IHashPasswordService, HashPasswordService>();`), add: `builder.Services.AddScoped<IOfflineVerifierService, OfflineVerifierService>();`

**How to verify:**
- `dotnet build backend/src/SMCA.WebApi/SMCA.WebApi.csproj`

**Dependencies**: Task 2

---

## Phase 2: Store-scoped roster query

### Task 5: Add GetStoreUsersByStoreIdAsync to IStoreUserRepository

**Files to modify:**
- `backend/src/Domain/Interfaces/Repositories/IStoreUserRepository.cs`

**What to implement:**
- Add method signature: `Task<IEnumerable<StoreUser>> GetStoreUsersByStoreIdAsync(Guid storeId, bool includeInactive);`

**How to verify:**
- `dotnet build backend/src/Domain/Domain.csproj`

**Dependencies**: None

---

### Task 6: Implement GetStoreUsersByStoreIdAsync in StoreUserRepository

**Files to modify:**
- `backend/src/Infrastructure/Persistence/Repositories/StoreUserRepository.cs`

**What to implement:**
- Mirror `GetStoreUsersIgnoreQueryFiltersAsync` pattern but filter by `storeId`:
  - `.Where(su => su.StoreId == storeId && (includeInactive || su.IsActive))`
  - `.Include(su => su.Store)`
  - `.Include(su => su.User)`
  - `.IgnoreQueryFilters()`
  - `.OrderBy(su => su.User.FullName)`
  - `.ToListAsync()`

**How to verify:**
- `dotnet build backend/src/Infrastructure/Infrastructure.csproj`

**Dependencies**: Task 5

---

## Phase 3: Per-user allowed features

### Task 7: Add GetAllowedFeatureIdsForUserAsync to IAllowedFeaturesService

**Files to modify:**
- `backend/src/Application/Abstractions/Features/IAllowedFeaturesService.cs`

**What to implement:**
- Add method: `Task<List<int>> GetAllowedFeatureIdsForUserAsync(Guid userId, List<int> storeModuleIds);`

**How to verify:**
- `dotnet build backend/src/Application/Application.csproj`

**Dependencies**: None

---

### Task 8: Implement GetAllowedFeatureIdsForUserAsync in AllowedFeaturesService

**Files to modify:**
- `backend/src/Application/Services/Features/AllowedFeaturesService.cs`

**What to implement:**
- Add `IUserRoleRepository` field and constructor parameter (existing constructor already has `using Domain.Interfaces.Repositories`)
- Add new overload:
  ```csharp
  public async Task<List<int>> GetAllowedFeatureIdsForUserAsync(Guid userId, List<int> storeModuleIds)
  {
      if (await _userRoleRepository.IsReSeller(userId))
          return await GetReSellerAllowedFeatureIdsByRoleAsync();
      if (await _userRoleRepository.IsStoreAdmin(userId))
          return await GetAllowedFeatureIdsByRoleAsync(RoleType.OwnerAdmin, storeModuleIds);
      return [];
  }
  ```
- `IsStoreAdmin(userId)` proxies for "OwnerAdmin" — there's no `IsOwnerAdmin(Guid)` method
- Reuse existing private helpers `GetReSellerAllowedFeatureIdsByRoleAsync()` and `GetAllowedFeatureIdsByRoleAsync(RoleType, List<int>)` unchanged
- VERIFIED: No existing tests instantiate `AllowedFeaturesService` directly, so the constructor change is safe

**How to verify:**
- `dotnet build backend/src/Application/Application.csproj`

**Dependencies**: Task 7

---

### Task 9: Create unit tests for AllowedFeaturesService new overload

**Files to create:**
- `backend/src/Application.Tests/Services/Features/AllowedFeaturesServiceTests.cs`

**What to implement:**
- Create test class following `GetMeQueryHandlerTests` pattern with `TestMocks` nested class
- Mocks needed: `IUserRoleRepository`, `IFeatureRepository`, `IHttpContextService`
- Test cases:
  1. ReSeller user returns ReSeller feature IDs (mock `IUserRoleRepository.IsReSeller(userId)` → true)
  2. OwnerAdmin/StoreAdmin user returns feature IDs for given store modules (mock `IsStoreAdmin(userId)` → true)
  3. Plain user (neither role) returns empty list
- Use `new AllowedFeaturesService(mocks.HttpContextService.Object, mocks.FeatureRepository.Object, mocks.UserRoleRepository.Object)` for construction

**How to verify:**
- `dotnet test backend/src/Application.Tests/Application.Tests.csproj --filter "FullyQualifiedName~AllowedFeaturesServiceTests"`
- Expected: PASS

**Dependencies**: Task 8

---

## Phase 4: ExportOfflineRoster handler

### Task 10: Create DTOs (OfflineVerifierDto, OfflineRosterUserDto, OfflineRosterDto)

**Files to create:**
- `backend/src/Application/Dtos/Management/StoreUsers/OfflineVerifierDto.cs`
- `backend/src/Application/Dtos/Management/StoreUsers/OfflineRosterUserDto.cs`
- `backend/src/Application/Dtos/Management/StoreUsers/OfflineRosterDto.cs`

**What to implement:**
- `OfflineVerifierDto` — `{ Hash, Salt, Iterations }` (all get/set, defaults)
- `OfflineRosterUserDto` — `Id, Login, FullName, IsActive, Roles (ICollection<StoreModuleFeaturesDto>), FeatureIds, StoreModuleIds, IsSuperAdmin, IsOwnerAdmin, IsReSeller, SelectedStoreId, Verifier (OfflineVerifierDto)`
- `OfflineRosterDto` — `BundleId, IssuedAt (long), ExpiresAt (long), FormatVersion (int), StoreId (Guid), Users (List<OfflineRosterUserDto>)`
- All in namespace `Application.Dtos.Management.StoreUsers`
- `OfflineRosterUserDto.Roles` reuses existing `Application.Dtos.Authentication.StoreModuleFeaturesDto` (positional record with `Guid StoreId`)

**How to verify:**
- `dotnet build backend/src/Application/Application.csproj`

**Dependencies**: None

---

### Task 11: Create ExportOfflineRosterQuery + Handler

**Files to create:**
- `backend/src/Application/Features/Management/Users/Queries/ExportOfflineRoster/ExportOfflineRosterQuery.cs`

**What to implement:**
- Record `ExportOfflineRosterQuery(Guid StoreId) : IQuery<OfflineRosterDto>`
- Handler with constructor injection:
  - `IHttpContextService`, `IStoreUserRepository`, `IStoreRepository`, `IStoreModuleRepository`, `IStoreRoleFeatureRepository`, `IUserRoleRepository`, `IAllowedFeaturesService`, `IOfflineVerifierService`, `IStringLocalizer<I18n>`
- Handle method:
  1. Auth gate: if `!_http.IsSuperAdminOrOwnerAdmin` → throw `ApiException("UserNotFound", 400)` (matches `GetStoreUsersQueryHandler.cs:37-38` pattern)
  2. If caller is not SuperAdmin → verify store ownership via `IStoreRepository.GetActiveStoresByUserIdAndIgnoreQueryFiltersAsync(_http.UserExternalId.ToGuid())` → throw `ApiException` if not found
  3. Load `storeModuleIds` from `IStoreModuleRepository.GetAvailableModulesByStoreIdAsync(storeId)`
  4. Load store users via `_storeUsers.GetStoreUsersByStoreIdAsync(storeId, includeInactive: true)`
  5. For each user: load role features, group into `StoreModuleFeaturesDto[]`, compute feature IDs via `_allowedFeatures.GetAllowedFeatureIdsForUserAsync`, compute verifier via `_verifier.CreateVerifier(user.Password)`, map per-user role flags via `_userRoles.IsSuperAdmin/IsStoreAdmin/IsReSeller`
  6. Assemble bundle: `bundleId = Guid.NewGuid().ToString()`, `issuedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()`, `expiresAt = issuedAt + 35 days ms`, `formatVersion = 1`
  7. Return `ResponseResult.Success(dto)`

**How to verify:**
- `dotnet build backend/src/Application/Application.csproj`

**Dependencies**: Tasks 4, 6, 8, 10

---

### Task 12: Create handler unit tests

**Files to create:**
- `backend/src/Application.Tests/Management/Users/Queries/ExportOfflineRoster/ExportOfflineRosterQueryHandlerTests.cs`

**What to implement:**
- Use `TestMocks` nested class pattern (mirroring `GetMeQueryHandlerTests.cs`)
- Mocks: `IHttpContextService`, `IStoreUserRepository`, `IStoreRepository`, `IStoreModuleRepository`, `IStoreRoleFeatureRepository`, `IUserRoleRepository`, `IAllowedFeaturesService`, `IOfflineVerifierService`, `IStringLocalizer<I18n>`
- Test cases (4):
  1. Non-admin/non-owner caller → `ThrowAsync<ApiException>` (use FluentAssertions `.Invoking(s => s.Handle(...)).Should().ThrowAsync<ApiException>()`)
  2. OwnerAdmin requesting foreign store → `ThrowAsync<ApiException>`
  3. SuperAdmin, store with 2 users → `Succeeded`, `Users.Count==2`, each user has `Verifier.Hash/Salt` non-empty and `Iterations==210000`, `FormatVersion==1`, `ExpiresAt-IssuedAt==35d ms`, `BundleId` valid GUID
  4. Verifier called per user → mock returns fixed result, use Moq `Verify` to confirm `CreateVerifier` called once per user with that user's `User.Password`

**How to verify:**
- `dotnet test backend/src/Application.Tests/Application.Tests.csproj --filter "FullyQualifiedName~ExportOfflineRosterQueryHandlerTests"`
- Expected: PASS (4 tests)

**Dependencies**: Task 11

---

## Phase 5: Controller + E2E tests

### Task 13: Add action to StoreUsersController

**Files to modify:**
- `backend/src/SMCA.WebApi/Controllers/v1/StoreUsersController.cs`

**What to implement:**
- Add new action method:
  ```csharp
  [HttpGet("{storeId:guid}/offline-roster")]
  [ProducesResponseType(typeof(ResponseResult<OfflineRosterDto>), StatusCodes.Status200OK)]
  public async Task<IActionResult> ExportOfflineRosterAsync(Guid storeId)
      => Ok(await Sender.Send(new ExportOfflineRosterQuery(storeId)));
  ```
- Add `using` for `Application.Features.Management.Users.Queries.ExportOfflineRoster.ExportOfflineRosterQuery`
- Existing `using Application.Dtos.Management.StoreUsers;` already covers `OfflineRosterDto`
- Class already has `[Authorize]` + `[HasPermission(StoreRoleFeatures.UsersAdmin)]`

**How to verify:**
- `dotnet build backend/src/SMCA.WebApi/SMCA.WebApi.csproj`

**Dependencies**: Task 11

---

### Task 14: Create E2E tests

**Files to create/modify:**
- Create: `backend/src/SMCA.WebApi.E2ETests/Users/ExportOfflineRosterTests.cs`
- Modify: `backend/src/SMCA.WebApi.E2ETests/Infrastructure/TestDtos.cs`

**What to implement:**
- Add `RosterData` test DTO class to `TestDtos.cs` mirroring `OfflineRosterDto` with camelCase properties for deserialization:
  - `BundleId`, `IssuedAt`, `ExpiresAt`, `FormatVersion`, `StoreId`, `Users (List<RosterUserData>)`
  - `RosterUserData` with: `Id`, `Login`, `FullName`, `IsActive`, `Roles`, `FeatureIds`, `StoreModuleIds`, `IsSuperAdmin`, `IsOwnerAdmin`, `IsReSeller`, `SelectedStoreId`, `Verifier (VerifierData)`
  - `VerifierData` with: `Hash`, `Salt`, `Iterations`
  - `ApiResponse<T>` wrapper (already exists in `Infrastructure/`)
- Create `ExportOfflineRosterTests.cs` in `Users/` folder matching existing test patterns:
  - `[Collection("e2e")]`, constructor takes `WebAppFixture`, try/finally cleanup
  - Test cases (4):
    1. SuperAdmin → 200, 2 users, `formatVersion==1`, every `verifier.iterations==210000`, `verifier.hash` non-empty, `expiresAt-issuedAt==35d ms`, `bundleId` parses as GUID
    2. OwnerAdmin own store → 200, same shape
    3. OwnerAdmin foreign store → non-success (400/403)
    4. Plain store user → 403 Forbidden (`[HasPermission]` blocks)

**How to verify:**
- `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~ExportOfflineRosterTests"`
- Expected: PASS (4 tests)

**Dependencies**: Task 13

---

## Phase 6: Full suite verification

### Task 15: Run full test suite and fix regressions

**What to implement:**
- Run entire test suite: `dotnet test backend/src/SMCA.sln`
- Check for regressions in existing tests from:
  - AllowedFeaturesService constructor change (existing tests passing `new AllowedFeaturesService(http, features)` will fail — add `IUserRoleRepository` mock parameter)
  - Any other indirect impact
- Fix all failing tests
- Re-run until full suite passes

**How to verify:**
- `dotnet test backend/src/SMCA.sln` — Expected: PASS (all tests)

**Dependencies**: Tasks 1–14

---

## Dependency Graph

```
T1 ─→ T2 ─→ T3 ─→ T4 ─┐
                        ├─→ T11 ─→ T12
T5 ─→ T6 ──────────────┘         │
                        │         │
T7 ─→ T8 ─→ T9 ────────┘         │
                                  │
T10 ──────────────────────────────┘
                                  │
                            T13 ─→ T14 ─→ T15
```

---

## Files Summary

| # | Action | Path |
|---|--------|------|
| 1 | Create | `backend/src/Application/Abstractions/Authentication/IOfflineVerifierService.cs` |
| 2 | Create | `backend/src/Application/Services/Authentication/OfflineVerifierService.cs` |
| 3 | Create | `backend/src/Application.Tests/Services/Authentication/OfflineVerifierServiceTests.cs` |
| 4 | Modify | `backend/src/SMCA.WebApi/Program.cs` |
| 5 | Modify | `backend/src/Domain/Interfaces/Repositories/IStoreUserRepository.cs` |
| 6 | Modify | `backend/src/Infrastructure/Persistence/Repositories/StoreUserRepository.cs` |
| 7 | Modify | `backend/src/Application/Abstractions/Features/IAllowedFeaturesService.cs` |
| 8 | Modify | `backend/src/Application/Services/Features/AllowedFeaturesService.cs` |
| 9 | Create | `backend/src/Application.Tests/Services/Features/AllowedFeaturesServiceTests.cs` |
| 10a | Create | `backend/src/Application/Dtos/Management/StoreUsers/OfflineVerifierDto.cs` |
| 10b | Create | `backend/src/Application/Dtos/Management/StoreUsers/OfflineRosterUserDto.cs` |
| 10c | Create | `backend/src/Application/Dtos/Management/StoreUsers/OfflineRosterDto.cs` |
| 11 | Create | `backend/src/Application/Features/Management/Users/Queries/ExportOfflineRoster/ExportOfflineRosterQuery.cs` |
| 12 | Create | `backend/src/Application.Tests/Management/Users/Queries/ExportOfflineRoster/ExportOfflineRosterQueryHandlerTests.cs` |
| 13 | Modify | `backend/src/SMCA.WebApi/Controllers/v1/StoreUsersController.cs` |
| 14a | Create | `backend/src/SMCA.WebApi.E2ETests/Users/ExportOfflineRosterTests.cs` |
| 14b | Modify | `backend/src/SMCA.WebApi.E2ETests/Infrastructure/TestDtos.cs` |
