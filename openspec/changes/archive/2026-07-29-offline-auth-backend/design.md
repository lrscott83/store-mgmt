# Design: Offline Roster Export Endpoint

## Technical Approach

Layered addition following existing Clean Architecture patterns. A MediatR query (`ExportOfflineRosterQuery`) reached from a new action on `StoreUsersController`. The handler authorizes (SuperAdmin any store; OwnerAdmin only owned stores), loads the store's users, assembles the same permission shape `/me` returns, and attaches a per-user PBKDF2 verifier computed by a new `IOfflineVerifierService`. The backend never sees or stores the "master" — file encryption happens client-side.

No changes to online auth flow. No migrations. Pure additive code with one repository method and one service constructor change.

## Architecture Decisions

### Decision: Auth enforcement — class-level attribute + handler-level narrowing

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Only `[HasPermission]` | Coarse — any UserAdmin can export any store | REJECTED — OwnerAdmin must be scoped |
| Only handler enforcement | Skipped — duplicates no extra safety | REJECTED — lose filter-layer block for plain users |
| **Both** | Extra code but defense-in-depth | **SELECTED** — matches existing `GetStoreUsersQueryHandler` pattern |

The class-level `[HasPermission(StoreRoleFeatures.UsersAdmin)]` blocks plain store users before handler runs. The handler then narrows: SuperAdmin → any store; OwnerAdmin → only stores they own (via `IStoreRepository.GetActiveStoresByUserIdAndIgnoreQueryFiltersAsync`). Unauthorized → throws `ApiException`, matching the existing pattern in `GetStoreUsersQueryHandler.cs:37-38`.

### Decision: Per-user feature resolution via separate overload

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Call `GetAllowedFeatureIdsForCurrentUserAsync` (existing) | Uses HttpContext flags — wrong user | REJECTED |
| Inline the logic in the handler | Duplicates AllowedFeaturesService internals | REJECTED |
| **Add overload that takes `(Guid userId, List<int>)`** | Reuses private helpers; needs new DI dep | **SELECTED** |

New overload `GetAllowedFeatureIdsForUserAsync(Guid userId, List<int> storeModuleIds)` on `IAllowedFeaturesService`. Implementation injects `IUserRoleRepository` and reuses existing private helpers `GetReSellerAllowedFeatureIdsByRoleAsync()` and `GetAllowedFeatureIdsByRoleAsync(RoleType.OwnerAdmin, storeModuleIds)`.

### Decision: OfflineVerifierResult as record in interface file

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Separate file for result type | Over-split for 3-property record | REJECTED |
| **Inline in IOfflineVerifierService.cs** | One file, single responsibility | **SELECTED** — follows existing `IHashPasswordService.cs` pattern (7 lines) |

## Data Flow

```
Client ──GET /api/v1/storeusers/{storeId}/offline-roster──→
  [Authorize] + [HasPermission(UsersAdmin)] ──pass──→
    StoreUsersController.ExportOfflineRosterAsync
      └── Sender.Send(ExportOfflineRosterQuery(storeId))
            └── Handler.Handle()
                  ├── Check IsSuperAdminOrOwnerAdmin ──✗──→ throw ApiException
                  ├── If !SuperAdmin: verify store ownership via IStoreRepository
                  │   └── ✗──→ throw ApiException
                  ├── Load storeModuleIds (IStoreModuleRepository)
                  ├── Load storeUsers (IStoreUserRepository.GetStoreUsersByStoreIdAsync)
                  ├── For each StoreUser:
                  │   ├── Load roleFeatures (IStoreRoleFeatureRepository)
                  │   ├── Group → StoreModuleFeaturesDto[]
                  │   ├── Compute allowedFeatureIds (IAllowedFeaturesService overload)
                  │   ├── Compute verifier (IOfflineVerifierService.CreateVerifier)
                  │   └── Map → OfflineRosterUserDto
                  ├── Assemble bundle metadata (bundleId, issuedAt, expiresAt)
                  └── Return ResponseResult.Success(OfflineRosterDto)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `Application/Abstractions/Authentication/IOfflineVerifierService.cs` | Create | Interface + `OfflineVerifierResult` record |
| `Application/Services/Authentication/OfflineVerifierService.cs` | Create | PBKDF2-HMAC-SHA256 implementation |
| `Application/Dtos/Management/StoreUsers/OfflineVerifierDto.cs` | Create | `{ Hash, Salt, Iterations }` |
| `Application/Dtos/Management/StoreUsers/OfflineRosterUserDto.cs` | Create | Per-user DTO (mirrors `/me` shape + Verifier) |
| `Application/Dtos/Management/StoreUsers/OfflineRosterDto.cs` | Create | Bundle-level DTO |
| `Application/Features/Management/Users/Queries/ExportOfflineRoster/ExportOfflineRosterQuery.cs` | Create | Query record + handler |
| `Domain/Interfaces/Repositories/IStoreUserRepository.cs` | Modify | Add `GetStoreUsersByStoreIdAsync(Guid, bool)` |
| `Infrastructure/Persistence/Repositories/StoreUserRepository.cs` | Modify | Implement store-scoped query |
| `Application/Abstractions/Features/IAllowedFeaturesService.cs` | Modify | Add `GetAllowedFeatureIdsForUserAsync(Guid, List<int>)` |
| `Application/Services/Features/AllowedFeaturesService.cs` | Modify | Inject `IUserRoleRepository`, add per-user overload |
| `SMCA.WebApi/Controllers/v1/StoreUsersController.cs` | Modify | Add `ExportOfflineRosterAsync` action |
| `SMCA.WebApi/Program.cs` | Modify | Register `IOfflineVerifierService` (AddScoped) |
| `Application.Tests/Services/Authentication/OfflineVerifierServiceTests.cs` | Create | 2 tests |
| `Application.Tests/Management/Users/Queries/ExportOfflineRoster/ExportOfflineRosterQueryHandlerTests.cs` | Create | 4 tests |
| `SMCA.WebApi.E2ETests/Management/ExportOfflineRosterTests.cs` | Create | 4 E2E scenarios |
| `SMCA.WebApi.E2ETests/Infrastructure/TestDtos.cs` | Modify | Add `RosterData` test DTO |

## Interfaces / Contracts

### IOfflineVerifierService

```csharp
namespace Application.Abstractions.Authentication;

public sealed record OfflineVerifierResult(string Hash, string Salt, int Iterations);

public interface IOfflineVerifierService
{
    OfflineVerifierResult CreateVerifier(string storedPasswordHash);
}
```

### PBKDF2 Parameters

| Param | Value |
|-------|-------|
| Algorithm | PBKDF2-HMAC-SHA256 (`HashAlgorithmName.SHA256`) |
| Iterations | 210,000 |
| Salt | 16 bytes via `RandomNumberGenerator.GetBytes(16)`, Base64 |
| Key length | 32 bytes, Base64 |
| Input | `Encoding.UTF8.GetBytes(storedPasswordHash)` (stored hash is a Base64 string) |

### DTOs

```csharp
// OfflineVerifierDto.cs
namespace Application.Dtos.Management.StoreUsers;
public sealed class OfflineVerifierDto
{
    public string Hash { get; set; } = string.Empty;
    public string Salt { get; set; } = string.Empty;
    public int Iterations { get; set; }
}

// OfflineRosterUserDto.cs
namespace Application.Dtos.Management.StoreUsers;
public sealed class OfflineRosterUserDto
{
    public Guid Id { get; set; }
    public string Login { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public bool IsActive { get; set; }
    public ICollection<StoreModuleFeaturesDto> Roles { get; set; } = new List<StoreModuleFeaturesDto>();
    public List<int> FeatureIds { get; set; } = new();
    public List<int> StoreModuleIds { get; set; } = new();
    public bool IsSuperAdmin { get; set; }
    public bool IsOwnerAdmin { get; set; }
    public bool IsReSeller { get; set; }
    public Guid SelectedStoreId { get; set; }
    public OfflineVerifierDto Verifier { get; set; } = new();
}

// OfflineRosterDto.cs
namespace Application.Dtos.Management.StoreUsers;
public sealed class OfflineRosterDto
{
    public string BundleId { get; set; } = string.Empty;
    public long IssuedAt { get; set; }
    public long ExpiresAt { get; set; }
    public int FormatVersion { get; set; }
    public Guid StoreId { get; set; }
    public List<OfflineRosterUserDto> Users { get; set; } = new();
}
```

### IAllowedFeaturesService — new overload

```csharp
// On existing interface IAllowedFeaturesService
Task<List<int>> GetAllowedFeatureIdsForUserAsync(Guid userId, List<int> storeModuleIds);
```

### Store-scoped repository query

```csharp
// On IStoreUserRepository
Task<IEnumerable<StoreUser>> GetStoreUsersByStoreIdAsync(Guid storeId, bool includeInactive);
```

Implementation mirrors `GetStoreUsersIgnoreQueryFiltersAsync` but filters by `StoreId`:

```csharp
public async Task<IEnumerable<StoreUser>> GetStoreUsersByStoreIdAsync(Guid storeId, bool includeInactive)
{
    return await _storeUsers
        .Where(su => su.StoreId == storeId && (includeInactive || su.IsActive))
        .Include(su => su.Store)
        .Include(su => su.User)
        .IgnoreQueryFilters()
        .OrderBy(su => su.User.FullName)
        .ToListAsync();
}
```

## Auth Model

### Layer 1: Class-level filter (static permission check)

```csharp
[Authorize]
[HasPermission(StoreRoleFeatures.UsersAdmin)]
public class StoreUsersController : BaseApiController
```

Blocks any request where the caller's JWT lacks the `UsersAdmin` claim. This is the coarse gate — plain StoreUsers are rejected at the filter level with 403 Forbidden before the handler runs.

### Layer 2: Handler-level enforcement (role + ownership)

```csharp
// VERIFIED: GetStoreUsersQueryHandler.cs:37-38 throws, does NOT return Failure
if (!_http.IsSuperAdminOrOwnerAdmin)
    throw new ApiException(_localizer["UserNotFound"], HttpStatusCode.BadRequest);

if (!_http.IsSuperAdmin)
{
    var owned = await _stores.GetActiveStoresByUserIdAndIgnoreQueryFiltersAsync(
        _http.UserExternalId.ToGuid());
    if (!owned.Any(s => s.Id == query.StoreId))
        throw new ApiException(_localizer["UserNotFound"], HttpStatusCode.BadRequest);
}
```

| Role | Class-level filter | Handler | Result |
|------|-------------------|---------|--------|
| SuperAdmin | ✅ Pass | ✅ Pass | 200 |
| OwnerAdmin owning store | ✅ Pass | ✅ Pass (ownership verified) | 200 |
| OwnerAdmin foreign store | ✅ Pass | ❌ Throw ApiException (400) | 400 |
| ReSeller (with UserAdmin perm) | ✅ Pass | ❌ Throw ApiException (400) | 400 |
| Plain StoreUser | ❌ 403 | — | 403 |

### Per-user flags in the roster

The handler sets `IsSuperAdmin`, `IsOwnerAdmin`, `IsReSeller` per roster user via `IUserRoleRepository` methods — these reflect the target user's roles, NOT the caller's. This matches `/me` behavior but applied per roster entry.

## AllowedFeaturesService Modification

### Constructor change

```csharp
// BEFORE
public AllowedFeaturesService(IHttpContextService httpContextService, IFeatureRepository featureRepository)

// AFTER
public AllowedFeaturesService(
    IHttpContextService httpContextService,
    IFeatureRepository featureRepository,
    IUserRoleRepository userRoleRepository)
```

### New overload

```csharp
// VERIFIED: IUserRoleRepository has IsReSeller(Guid), IsStoreAdmin(Guid)
// IsStoreAdmin proxies for OwnerAdmin — there's no IsOwnerAdmin(Guid) method
public async Task<List<int>> GetAllowedFeatureIdsForUserAsync(Guid userId, List<int> storeModuleIds)
{
    if (await _userRoleRepository.IsReSeller(userId))
        return await GetReSellerAllowedFeatureIdsByRoleAsync();
    if (await _userRoleRepository.IsStoreAdmin(userId))
        return await GetAllowedFeatureIdsByRoleAsync(RoleType.OwnerAdmin, storeModuleIds);
    return [];
}
```

Reuses existing private helpers `GetAllowedFeatureIdsByRoleAsync(RoleType, List<int>)` and `GetReSellerAllowedFeatureIdsByRoleAsync()` unchanged.

### Impact on existing callers

All existing consumers use DI‑resolved `IAllowedFeaturesService` — the new ctor parameter is auto‑resolved. Tests that `new AllowedFeaturesService(...)` directly will break and need the `IUserRoleRepository` mock added.

## Testing Strategy

### Unit: OfflineVerifierService

| Test | What | Assert |
|------|------|--------|
| `CreateVerifier_produces_16byte_salt_and_reproducible_pbkdf2` | Deterministic w/ known salt | `Iterations==210000`, Salt 16B, Hash 32B, independent recompute matches |
| `CreateVerifier_uses_a_fresh_salt_each_call` | Same input twice | Salt differs, Hash differs |

### Unit: ExportOfflineRosterQueryHandler

Following `GetMeQueryHandlerTests` pattern (`TestMocks` nested class, `CreateMocks()` factory, Moq setups):

| # | Test | Setup | Assert |
|---|------|-------|--------|
| a | Non-admin/non-owner caller | `IsSuperAdminOrOwnerAdmin==false` | `ThrowAsync<ApiException>` |
| b | OwnerAdmin wrong store | `IsOwnerAdmin==true`, store not in owned list | `ThrowAsync<ApiException>` |
| c | SuperAdmin with 2 users | `IsSuperAdmin==true`, store has 2 users | `Succeeded`, `Users.Count==2`, each has Verifier.Hash/Salt non-empty, `FormatVersion==1`, `ExpiresAt-IssuedAt==35d ms`, `BundleId` valid Guid |
| d | Verifier called per user | Mock `IOfflineVerifierService` with fixed result | `CreateVerifier` called once per user with that user's `User.Password` |

Mock contract: `IHttpContextService`, `IStoreUserRepository`, `IStoreRepository`, `IStoreModuleRepository`, `IStoreRoleFeatureRepository`, `IUserRoleRepository`, `IAllowedFeaturesService`, `IOfflineVerifierService`, `IStringLocalizer<I18n>`.

### E2E: ExportOfflineRosterTests

Following `AuthMePermissionsTests` pattern (`[Collection("e2e")]`, ctor takes `WebAppFixture`, try/finally cleanup):

| # | Scenario | Seed | Assert |
|---|----------|------|--------|
| a | SuperAdmin success | `DbTestHelpers.SeedSuperAdminAsync` | 200, 2 users, formatVersion==1, every verifier.iterations==210000, verifier.hash non-empty, expiresAt-issuedAt==35d ms, bundleId parses as Guid |
| b | OwnerAdmin own store | `AuthzSeed.SeedOwnerAdminAsync` with 2 users | 200, same shape as (a) |
| c | OwnerAdmin foreign store | OwnerAdmin A requesting store B | Non-success (400 — ApiException surfaces via `ErrorHandlerMiddleware`) |
| d | Plain store user | `AuthzSeed.SeedStoreUserAsync` | Forbidden (403 — `[HasPermission]` blocks) |

E2E test DTO `RosterData` added to `Infrastructure/TestDtos.cs`, mirroring `OfflineRosterDto` camelCase.

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **PBKDF2 210k iters slow in tests** | High | ~200ms per test call | Acceptable — only 2 unit tests call it directly; handler tests mock `IOfflineVerifierService` |
| **N+1 in handler loop** | Medium | 5-7 DB calls per user | Acceptable for `<100` users per store. Each call is a single EF query against indexed FK columns |
| **AllowedFeaturesService ctor breakage** | Medium | Tests using `new AllowedFeaturesService(...)` break | Search repo for direct instantiations; add `IUserRoleRepository` mock to affected test files |
| **PBKDF2 params mismatch with frontend** | High | Auth fails silently on device | Frontend team MUST match byte‑for‑byte: input = UTF-8 of stored Base64 hash string, not the raw password |
| **BundleId GUID collision** | Low | Theoretical replay collision | `Guid.NewGuid()` gives 122 bits of randomness — risk negligible for this use case |

## Migration / Rollout

No migration required. All additions are purely additive code. Deployment: standard rollout through existing CI/CD. Rollback is revert of commits in reverse order.

## Open Questions

- [ ] None — all design decisions resolved against verified source code.
