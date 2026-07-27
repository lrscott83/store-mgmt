# Offline Auth — Backend (Roster Export) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an authenticated endpoint that lets a SuperAdmin/OwnerAdmin export a store's user roster (permissions + a per-user offline PBKDF2 verifier + anti-replay metadata) as JSON, so devices can authenticate users offline without the API.

**Architecture:** A MediatR query (`ExportOfflineRosterQuery`) reached from a new action on `StoreUsersController`. The handler authorizes the caller (SuperAdmin any store; OwnerAdmin only stores they own), loads the store's users, assembles the same permission shape the `/me` endpoint returns, and attaches a per-user verifier `PBKDF2( storedPasswordHash, freshSalt, iterations )` computed by a new `IOfflineVerifierService`. The backend never sees or stores the "master" — file encryption happens client-side.

**Tech Stack:** .NET 8, ASP.NET Core, MediatR 12, AutoMapper, EF Core, xUnit + Moq + FluentAssertions (unit), Mvc.Testing (E2E). Solution: `backend/src/SMCA.sln`.

## Global Constraints

- **The existing online auth endpoints are UNTOUCHED.** `POST /login`, `/me`, the 35-day session — none of them change in any way. This plan only ADDS an export endpoint. The device decides its authentication mode client-side by asking whether the roster file was imported (see `2026-07-25-offline-auth-frontend-plan.md` §"Authentication mode"): file present → offline auth against the file; file absent → the online endpoints exactly as they behave today. A device that never calls this export must be indistinguishable from today's behavior, and the backend must keep serving it normally forever — there is no server-side flag, migration or opt-in that could break it.
- **Target framework:** `net8.0` (all csproj). Use `Rfc2898DeriveBytes.Pbkdf2(...)` (static, .NET 8+).
- **Verifier algorithm (MUST match the frontend byte-for-byte):** PBKDF2-HMAC-**SHA256**; **iterations = 210000**; **salt = 16 random bytes, Base64**; **derived key length = 32 bytes, Base64**; **PBKDF2 password input = the UTF-8 bytes of the stored `Base64(SHA256(utf8(password)))` string** (i.e. the value already in `User.Password`).
- **Bundle metadata:** `bundleId` = new GUID (string) per export; `issuedAt`/`expiresAt` = **Unix epoch milliseconds** (Int64); `expiresAt = issuedAt + 35 days`; `formatVersion = 1`.
- **Handler results:** every handler returns `ResponseResult<T>` (`Application/ResponseModels/ResponseResult.cs`). Controllers only `Ok(await Sender.Send(...))`.
- **JSON casing:** default camelCase (no custom naming policy configured). Do not add JSON config.
- **Auth:** endpoint carries `[Authorize]` + `[HasPermission(StoreRoleFeatures.UsersAdmin)]`; the handler additionally enforces SuperAdmin/OwnerAdmin-only and store ownership (narrower than the attribute).
- **Conventions:** follow existing store-mgmt code (no `@author` header — none exists in this repo). DTOs live under `Application/Dtos/<Area>/`. Features under `Application/Features/<Area>/Queries/<Name>/`.

---

## File Structure

- Create `Application/Abstractions/Authentication/IOfflineVerifierService.cs` — verifier contract.
- Create `Application/Services/Authentication/OfflineVerifierService.cs` — PBKDF2 impl (in Application so it is unit-testable in `Application.Tests`).
- Create `Application/Dtos/Management/StoreUsers/OfflineRosterDto.cs` — bundle-level DTO.
- Create `Application/Dtos/Management/StoreUsers/OfflineRosterUserDto.cs` — per-user DTO.
- Create `Application/Dtos/Management/StoreUsers/OfflineVerifierDto.cs` — `{ Hash, Salt, Iterations }`.
- Create `Application/Features/Management/Users/Queries/ExportOfflineRoster/ExportOfflineRosterQuery.cs` — query + handler.
- Modify `Domain/Interfaces/Repositories/IStoreUserRepository.cs` — add `GetStoreUsersByStoreIdAsync`.
- Modify `Infrastructure/Persistence/Repositories/StoreUserRepository.cs` — implement it.
- Modify `Application/Services/Features/AllowedFeaturesService.cs` (+ its interface) — add per-target-user `GetAllowedFeatureIdsForUserAsync`.
- Modify `SMCA.WebApi/Controllers/v1/StoreUsersController.cs` — add the export action.
- Modify `SMCA.WebApi/Program.cs` — register `IOfflineVerifierService` (AddScoped, near `IHashPasswordService` ~line 57).
- Create `Application.Tests/Services/Authentication/OfflineVerifierServiceTests.cs`.
- Create `Application.Tests/Management/Users/Queries/ExportOfflineRoster/ExportOfflineRosterQueryHandlerTests.cs`.
- Create `SMCA.WebApi.E2ETests/Management/ExportOfflineRosterTests.cs`.

---

### Task 1: OfflineVerifierService (PBKDF2)

**Files:**
- Create: `Application/Abstractions/Authentication/IOfflineVerifierService.cs`
- Create: `Application/Services/Authentication/OfflineVerifierService.cs`
- Test: `Application.Tests/Services/Authentication/OfflineVerifierServiceTests.cs`

**Interfaces:**
- Produces: `IOfflineVerifierService.CreateVerifier(string storedPasswordHash) -> OfflineVerifierResult` where `OfflineVerifierResult` is `record(string Hash, string Salt, int Iterations)`.

- [ ] **Step 1: Write the failing test**

```csharp
using Application.Abstractions.Authentication;
using Application.Services.Authentication;
using FluentAssertions;
using System;
using System.Security.Cryptography;
using System.Text;
using Xunit;

namespace Application.Tests.Services.Authentication;

public class OfflineVerifierServiceTests
{
    private const int ExpectedIterations = 210_000;

    [Fact]
    public void CreateVerifier_produces_16byte_salt_and_reproducible_pbkdf2()
    {
        var sut = new OfflineVerifierService();
        const string storedHash = "n4bQgYhMfWWaL+qgxVrQFaO/TxsrC4Is0V1sFbDwCgg="; // Base64(SHA256("test"))

        var result = sut.CreateVerifier(storedHash);

        result.Iterations.Should().Be(ExpectedIterations);
        Convert.FromBase64String(result.Salt).Length.Should().Be(16);
        Convert.FromBase64String(result.Hash).Length.Should().Be(32);

        // Recompute independently with the documented parameters and confirm equality.
        var expected = Rfc2898DeriveBytes.Pbkdf2(
            Encoding.UTF8.GetBytes(storedHash),
            Convert.FromBase64String(result.Salt),
            ExpectedIterations,
            HashAlgorithmName.SHA256,
            32);
        Convert.ToBase64String(expected).Should().Be(result.Hash);
    }

    [Fact]
    public void CreateVerifier_uses_a_fresh_salt_each_call()
    {
        var sut = new OfflineVerifierService();
        var a = sut.CreateVerifier("n4bQgYhMfWWaL+qgxVrQFaO/TxsrC4Is0V1sFbDwCgg=");
        var b = sut.CreateVerifier("n4bQgYhMfWWaL+qgxVrQFaO/TxsrC4Is0V1sFbDwCgg=");
        a.Salt.Should().NotBe(b.Salt);
        a.Hash.Should().NotBe(b.Hash);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test Application.Tests/Application.Tests.csproj --filter "FullyQualifiedName~OfflineVerifierServiceTests"`
Expected: FAIL — `IOfflineVerifierService`/`OfflineVerifierService` do not exist (compile error).

- [ ] **Step 3: Write the interface and implementation**

`Application/Abstractions/Authentication/IOfflineVerifierService.cs`:

```csharp
namespace Application.Abstractions.Authentication
{
    public sealed record OfflineVerifierResult(string Hash, string Salt, int Iterations);

    public interface IOfflineVerifierService
    {
        OfflineVerifierResult CreateVerifier(string storedPasswordHash);
    }
}
```

`Application/Services/Authentication/OfflineVerifierService.cs`:

```csharp
using Application.Abstractions.Authentication;
using System.Security.Cryptography;
using System.Text;

namespace Application.Services.Authentication
{
    public sealed class OfflineVerifierService : IOfflineVerifierService
    {
        private const int Iterations = 210_000;
        private const int SaltBytes = 16;
        private const int KeyBytes = 32;

        public OfflineVerifierResult CreateVerifier(string storedPasswordHash)
        {
            byte[] salt = RandomNumberGenerator.GetBytes(SaltBytes);
            byte[] hash = Rfc2898DeriveBytes.Pbkdf2(
                Encoding.UTF8.GetBytes(storedPasswordHash),
                salt,
                Iterations,
                HashAlgorithmName.SHA256,
                KeyBytes);

            return new OfflineVerifierResult(
                Convert.ToBase64String(hash),
                Convert.ToBase64String(salt),
                Iterations);
        }
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test Application.Tests/Application.Tests.csproj --filter "FullyQualifiedName~OfflineVerifierServiceTests"`
Expected: PASS (2 tests).

- [ ] **Step 5: Register in DI**

Modify `SMCA.WebApi/Program.cs` — next to the existing `AddScoped<IHashPasswordService, HashPasswordService>()` registration, add:

```csharp
builder.Services.AddScoped<IOfflineVerifierService, OfflineVerifierService>();
```

Add `using Application.Abstractions.Authentication;` and `using Application.Services.Authentication;` if not present.

- [ ] **Step 6: Commit**

```bash
git add Application/Abstractions/Authentication/IOfflineVerifierService.cs \
        Application/Services/Authentication/OfflineVerifierService.cs \
        Application.Tests/Services/Authentication/OfflineVerifierServiceTests.cs \
        SMCA.WebApi/Program.cs
git commit -m "feat(backend): add offline PBKDF2 verifier service"
```

---

### Task 2: Store-scoped roster query on the repository

**Files:**
- Modify: `Domain/Interfaces/Repositories/IStoreUserRepository.cs`
- Modify: `Infrastructure/Persistence/Repositories/StoreUserRepository.cs`

**Interfaces:**
- Produces: `IStoreUserRepository.GetStoreUsersByStoreIdAsync(Guid storeId, bool includeInactive) -> Task<IEnumerable<StoreUser>>` (each element has `.User` populated).

> This method's real implementation is verified end-to-end by the E2E test in Task 5 (it needs a real EF query). Here we add the method following the existing `GetStoreUsersIgnoreQueryFiltersAsync` shape.

- [ ] **Step 1: Add the interface method**

In `Domain/Interfaces/Repositories/IStoreUserRepository.cs`, add:

```csharp
Task<IEnumerable<StoreUser>> GetStoreUsersByStoreIdAsync(Guid storeId, bool includeInactive);
```

- [ ] **Step 2: Implement it**

In `Infrastructure/Persistence/Repositories/StoreUserRepository.cs`, mirror the existing `GetStoreUsersIgnoreQueryFiltersAsync` body but filter by store id (SuperAdmin/OwnerAdmin export must see soft-deleted-filter-free rows for the target store):

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

> VERIFIED against the real file: it uses the `private readonly DbSet<StoreUser> _storeUsers` field (line 10), and `GetStoreUsersIgnoreQueryFiltersAsync` (lines 54-62) is exactly `Where(...).Include(su => su.Store).Include(su => su.User).IgnoreQueryFilters().OrderBy(...)`. `StoreUser.StoreId`, `.IsActive`, `.User`, `.User.FullName` are the real members. Do NOT reference `su.Store.Owner.IsActive` — it is not needed here.

- [ ] **Step 3: Build to confirm it compiles**

Run: `dotnet build Infrastructure/Infrastructure.csproj`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add Domain/Interfaces/Repositories/IStoreUserRepository.cs \
        Infrastructure/Persistence/Repositories/StoreUserRepository.cs
git commit -m "feat(backend): add store-scoped roster query"
```

---

### Task 3: Per-target-user allowed feature ids

**Files:**
- Modify: `Application/Services/Features/AllowedFeaturesService.cs`
- Modify: its interface (find it via the ctor injection in `GetMeQueryHandler`; likely `Application/Abstractions/.../IAllowedFeaturesService.cs`)
- Test: `Application.Tests/Services/Features/AllowedFeaturesServiceTests.cs` (create if absent)

**Interfaces:**
- Consumes: existing private logic of `GetAllowedFeatureIdsForCurrentUserAsync(List<int> storeModuleIds)`.
- Produces: `IAllowedFeaturesService.GetAllowedFeatureIdsForUserAsync(Guid userId, List<int> storeModuleIds) -> Task<List<int>>`.

- [ ] **Step 1: Write the failing test**

```csharp
// Application.Tests/Services/Features/AllowedFeaturesServiceTests.cs
// Mirror the setup style of GetMeQueryHandlerTests: mock IUserRoleRepository,
// IStoreRoleFeatureRepository (and any collaborators the existing
// GetAllowedFeatureIdsForCurrentUserAsync uses), then assert the per-user
// overload returns the same ids the current-user path would for the same roles.
```

> Read `AllowedFeaturesService.cs:20-27` and `GetMeQueryHandler` first, then write concrete mock expectations matching the real collaborators. Assert: given a user that `IUserRoleRepository.IsStoreAdmin(userId)==true`, the returned ids equal the mapped allowed feature ids for the provided `storeModuleIds`.

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test Application.Tests/Application.Tests.csproj --filter "FullyQualifiedName~AllowedFeaturesServiceTests"`
Expected: FAIL — method does not exist.

- [ ] **Step 3: Implement the overload**

VERIFIED against the real file: `AllowedFeaturesService` (lines 9-18) is constructed with only `(IHttpContextService, IFeatureRepository)`; its public method reads `_httpContextService.IsReSeller` / `IsOwnerAdmin` (lines 22-24) and delegates to two private helpers that take the role/moduleIds as parameters (NOT the httpContext): `GetReSellerAllowedFeatureIdsByRoleAsync()` and `GetAllowedFeatureIdsByRoleAsync(RoleType.OwnerAdmin, storeModuleIds)`. So the per-user overload just picks the role via the repository and reuses those helpers unchanged.

1. **Inject `IUserRoleRepository`** into the ctor (add the field + parameter; it is not there today).
2. Add the overload (the private helpers are reused as-is):

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

3. Add `Task<List<int>> GetAllowedFeatureIdsForUserAsync(Guid userId, List<int> storeModuleIds);` to `IAllowedFeaturesService`.

> Note: `IUserRoleRepository.IsStoreAdmin(userId)` is the per-user proxy for "OwnerAdmin" (the online path reads it from JWT claims; there is no `IsOwnerAdmin(userId)` repo method). A plain store user returns `[]` here — identical to the online `/me` behavior, where such users get their permissions from `Roles`, not `FeatureIds`.

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test Application.Tests/Application.Tests.csproj --filter "FullyQualifiedName~AllowedFeaturesServiceTests"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add Application/Services/Features/AllowedFeaturesService.cs \
        Application/Abstractions/**/IAllowedFeaturesService.cs \
        Application.Tests/Services/Features/AllowedFeaturesServiceTests.cs
git commit -m "feat(backend): compute allowed feature ids for a target user"
```

---

### Task 4: ExportOfflineRoster query + handler + DTOs

**Files:**
- Create: `Application/Dtos/Management/StoreUsers/OfflineVerifierDto.cs`
- Create: `Application/Dtos/Management/StoreUsers/OfflineRosterUserDto.cs`
- Create: `Application/Dtos/Management/StoreUsers/OfflineRosterDto.cs`
- Create: `Application/Features/Management/Users/Queries/ExportOfflineRoster/ExportOfflineRosterQuery.cs`
- Test: `Application.Tests/Management/Users/Queries/ExportOfflineRoster/ExportOfflineRosterQueryHandlerTests.cs`

**Interfaces:**
- Consumes: `IOfflineVerifierService.CreateVerifier` (Task 1), `IStoreUserRepository.GetStoreUsersByStoreIdAsync` (Task 2), `IAllowedFeaturesService.GetAllowedFeatureIdsForUserAsync` (Task 3), plus existing `IUserRoleRepository`, `IStoreRoleFeatureRepository.GetStoreRoleFeaturesByUserIdAsync`, `IStoreModuleRepository.GetAvailableModulesByStoreIdAsync`, `IStoreRepository.GetActiveStoresByUserIdAndIgnoreQueryFiltersAsync`, `IHttpContextService`.
- Produces: `ExportOfflineRosterQuery(Guid StoreId) : IQuery<OfflineRosterDto>` and its handler.

**DTOs** (create all three):

```csharp
// OfflineVerifierDto.cs
namespace Application.Dtos.Management.StoreUsers;
public sealed class OfflineVerifierDto
{
    public string Hash { get; set; } = string.Empty;
    public string Salt { get; set; } = string.Empty;
    public int Iterations { get; set; }
}
```

```csharp
// OfflineRosterUserDto.cs
using Application.Dtos.Authentication; // reuse StoreModuleFeaturesDto
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
```

```csharp
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

- [ ] **Step 1: Write the failing handler test**

```csharp
// ExportOfflineRosterQueryHandlerTests.cs — mirror GetMeQueryHandlerTests style.
// Cases (write all four):
//  (a) caller is neither SuperAdmin nor OwnerAdmin -> the handler THROWS
//      ApiException (VERIFIED: GetStoreUsersQueryHandler.cs:37-38 throws, it does
//      NOT return a Failure). Assert with FluentAssertions:
//      await sut.Invoking(s => s.Handle(query, default)).Should().ThrowAsync<ApiException>();
//  (b) OwnerAdmin requesting a storeId they do NOT own -> also THROWS ApiException.
//  (c) SuperAdmin, store with 2 users -> Succeeded, Users.Count == 2, each user's
//      Verifier.Hash/Salt non-empty and Iterations == 210000, FormatVersion == 1,
//      ExpiresAt - IssuedAt == 35 days in ms, BundleId non-empty and a valid GUID.
//  (d) A user's Verifier is produced from that user's stored password hash:
//      verify IOfflineVerifierService.CreateVerifier was called once per user with
//      the user's User.Password value (Moq Verify).
// Mock: IHttpContextService (IsSuperAdmin/IsOwnerAdmin/UserId), IStoreRepository
// (GetActiveStoresByUserIdAndIgnoreQueryFiltersAsync returns the owned stores),
// IStoreUserRepository.GetStoreUsersByStoreIdAsync, IStoreModuleRepository,
// IStoreRoleFeatureRepository, IUserRoleRepository, IAllowedFeaturesService,
// IOfflineVerifierService (return a fixed OfflineVerifierResult).
// Pass a fixed "now" into the handler (see Step 3) so ExpiresAt is deterministic.
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test Application.Tests/Application.Tests.csproj --filter "FullyQualifiedName~ExportOfflineRosterQueryHandlerTests"`
Expected: FAIL — query/handler do not exist.

- [ ] **Step 3: Implement query + handler**

`Application/Features/Management/Users/Queries/ExportOfflineRoster/ExportOfflineRosterQuery.cs`:

```csharp
using Application.Abstractions.Authentication;
using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Dtos.Authentication;
using Application.Dtos.Management.StoreUsers;
using Application.Exceptions;
using Application.ResponseModels;
using Application.Services.Features;
using Domain.Common.Extensions;
using Domain.Entities.StoreUsers;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using System.Net;

namespace Application.Features.Management.Users.Queries.ExportOfflineRoster
{
    public sealed record ExportOfflineRosterQuery(Guid StoreId) : IQuery<OfflineRosterDto> { }

    public sealed class ExportOfflineRosterQueryHandler
        : IQueryHandler<ExportOfflineRosterQuery, OfflineRosterDto>
    {
        private const int FormatVersion = 1;
        private static readonly long ThirtyFiveDaysMs = (long)TimeSpan.FromDays(35).TotalMilliseconds;

        private readonly IHttpContextService _http;
        private readonly IStoreUserRepository _storeUsers;
        private readonly IStoreRepository _stores;
        private readonly IStoreModuleRepository _storeModules;
        private readonly IStoreRoleFeatureRepository _storeRoleFeatures;
        private readonly IUserRoleRepository _userRoles;
        private readonly IAllowedFeaturesService _allowedFeatures;
        private readonly IOfflineVerifierService _verifier;
        private readonly IStringLocalizer<I18n> _localizer;

        public ExportOfflineRosterQueryHandler(
            IHttpContextService http,
            IStoreUserRepository storeUsers,
            IStoreRepository stores,
            IStoreModuleRepository storeModules,
            IStoreRoleFeatureRepository storeRoleFeatures,
            IUserRoleRepository userRoles,
            IAllowedFeaturesService allowedFeatures,
            IOfflineVerifierService verifier,
            IStringLocalizer<I18n> localizer)
        {
            _http = http;
            _storeUsers = storeUsers;
            _stores = stores;
            _storeModules = storeModules;
            _storeRoleFeatures = storeRoleFeatures;
            _userRoles = userRoles;
            _allowedFeatures = allowedFeatures;
            _verifier = verifier;
            _localizer = localizer;
        }

        public async Task<ResponseResult<OfflineRosterDto>> Handle(
            ExportOfflineRosterQuery query, CancellationToken ct)
        {
            if (!_http.IsSuperAdminOrOwnerAdmin)
                throw new ApiException(_localizer["UserNotFound"], HttpStatusCode.BadRequest);

            if (!_http.IsSuperAdmin)
            {
                var owned = await _stores.GetActiveStoresByUserIdAndIgnoreQueryFiltersAsync(_http.UserExternalId.ToGuid());
                if (!owned.Any(s => s.Id == query.StoreId))
                    throw new ApiException(_localizer["UserNotFound"], HttpStatusCode.BadRequest);
            }

            var storeModuleIds = (await _storeModules.GetAvailableModulesByStoreIdAsync(query.StoreId))
                .Select(m => m.Id).ToList();

            var storeUsers = await _storeUsers.GetStoreUsersByStoreIdAsync(query.StoreId, includeInactive: true);

            var users = new List<OfflineRosterUserDto>();
            foreach (var su in storeUsers)
            {
                var user = su.User;
                var roleFeatures = await _storeRoleFeatures.GetStoreRoleFeaturesByUserIdAsync(user.Id, storeModuleIds);
                // VERIFIED: StoreModuleFeaturesDto is a POSITIONAL record
                // (Guid StoreId, string StoreName, int ModuleId, ICollection<int> FeatureIds).
                // Construct it exactly like GetMeQueryHandler.cs:57-64 — StoreId is a Guid,
                // NOT a string, and there is NO object-initializer form.
                var roles = roleFeatures
                    .GroupBy(srf => new { srf.Store, srf.Feature.Module })
                    .Select(g => new StoreModuleFeaturesDto(
                        g.Key.Store.Id,
                        g.Key.Store.Name,
                        g.Key.Module.Id,
                        g.Select(srf => srf.Feature.Id).ToList()))
                    .ToList();

                var featureIds = await _allowedFeatures.GetAllowedFeatureIdsForUserAsync(user.Id, storeModuleIds);
                var v = _verifier.CreateVerifier(user.Password);

                users.Add(new OfflineRosterUserDto
                {
                    Id = user.Id,
                    Login = user.Login,
                    FullName = user.FullName,
                    IsActive = user.IsActive,
                    Roles = roles,
                    FeatureIds = featureIds,
                    StoreModuleIds = storeModuleIds,
                    IsSuperAdmin = await _userRoles.IsSuperAdmin(user.Id),
                    IsOwnerAdmin = await _userRoles.IsStoreAdmin(user.Id),
                    IsReSeller = await _userRoles.IsReSeller(user.Id),
                    SelectedStoreId = query.StoreId,
                    Verifier = new OfflineVerifierDto { Hash = v.Hash, Salt = v.Salt, Iterations = v.Iterations },
                });
            }

            long issuedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            var dto = new OfflineRosterDto
            {
                BundleId = Guid.NewGuid().ToString(),
                IssuedAt = issuedAt,
                ExpiresAt = issuedAt + ThirtyFiveDaysMs,
                FormatVersion = FormatVersion,
                StoreId = query.StoreId,
                Users = users,
            };

            return ResponseResult.Success(dto);
        }
    }
}
```

> VERIFIED against source (do not change without re-reading): the grouping mirrors `GetMeQueryHandler.cs:57-64` (`srf.Store`, `srf.Feature.Module`, `srf.Feature.Id`); `IStoreRepository.GetActiveStoresByUserIdAndIgnoreQueryFiltersAsync(Guid)` exists (`IStoreRepository.cs:15`); `IHttpContextService` has **no `UserId`** — the internal Guid is `UserExternalId.ToGuid()` (`IHttpContextService.cs:6`, `.ToGuid()` from `Domain.Common.Extensions`, exactly as `GetMeQuery.cs:40` does); `IsSuperAdminOrOwnerAdmin`, `IsSuperAdmin`, `IsOwnerAdmin`, `IsReSeller` all exist (`IHttpContextService.cs:11-14`); `StoreModuleFeaturesDto` is a positional record with a **Guid** `StoreId` (`StoreModuleFeaturesDto.cs:3`); `IUserRoleRepository.IsSuperAdmin/IsStoreAdmin/IsReSeller(Guid)` all accept an arbitrary userId (`IUserRoleRepository.cs:10-12`); `IStoreRoleFeatureRepository.GetStoreRoleFeaturesByUserIdAsync(Guid, List<int>)` and `IStoreModuleRepository.GetAvailableModulesByStoreIdAsync(Guid)` exist. `user.Password` is the stored `Base64(SHA256(pw))` hash (used at `AuthenticationService.cs:47-48`).

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test Application.Tests/Application.Tests.csproj --filter "FullyQualifiedName~ExportOfflineRosterQueryHandlerTests"`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add Application/Dtos/Management/StoreUsers/OfflineVerifierDto.cs \
        Application/Dtos/Management/StoreUsers/OfflineRosterUserDto.cs \
        Application/Dtos/Management/StoreUsers/OfflineRosterDto.cs \
        Application/Features/Management/Users/Queries/ExportOfflineRoster/ExportOfflineRosterQuery.cs \
        Application.Tests/Management/Users/Queries/ExportOfflineRoster/ExportOfflineRosterQueryHandlerTests.cs
git commit -m "feat(backend): assemble offline roster with per-user verifier"
```

---

### Task 5: Controller endpoint + E2E test

**Files:**
- Modify: `SMCA.WebApi/Controllers/v1/StoreUsersController.cs`
- Test: `SMCA.WebApi.E2ETests/Management/ExportOfflineRosterTests.cs`

**Interfaces:**
- Consumes: `ExportOfflineRosterQuery` (Task 4).
- Produces: `GET /api/v1/storeusers/{storeId}/offline-roster` returning `ResponseResult<OfflineRosterDto>`.

- [ ] **Step 1: Write the failing E2E test**

```csharp
// ExportOfflineRosterTests.cs — mirror AuthMePermissionsTests exactly:
// [Collection("e2e")], ctor(WebAppFixture fixture), use AuthzSeed/StoreSeed/
// DbTestHelpers to seed a store with 2 users, mint the caller's JWT, GET the
// endpoint, deserialize ApiResponse<RosterData> (add a RosterData test DTO in
// Infrastructure/TestDtos.cs mirroring OfflineRosterDto), assert in try/finally
// with cleanup. Cases:
//  (a) SuperAdmin -> 200, data.users.Count == 2, formatVersion == 1,
//      each users[i].verifier.iterations == 210000, verifier.hash non-empty,
//      expiresAt - issuedAt == 35 days ms, bundleId parses as Guid.
//  (b) OwnerAdmin of that store -> 200 with the same shape.
//  (c) OwnerAdmin of a DIFFERENT store requesting this store -> non-success
//      (400/403 per how ApiException surfaces; assert the same status
//      AuthMePermissionsTests asserts for its denied case).
//  (d) plain store user -> Forbidden (the [HasPermission] filter blocks it).
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~ExportOfflineRosterTests"`
Expected: FAIL — route returns 404 (no action yet).

- [ ] **Step 3: Add the controller action**

In `SMCA.WebApi/Controllers/v1/StoreUsersController.cs` (class already `[Authorize]` + `[HasPermission(StoreRoleFeatures.UsersAdmin)]`), add:

```csharp
[HttpGet("{storeId:guid}/offline-roster")]
[ProducesResponseType(typeof(ResponseResult<OfflineRosterDto>), StatusCodes.Status200OK)]
public async Task<IActionResult> ExportOfflineRosterAsync(Guid storeId)
    => Ok(await Sender.Send(new ExportOfflineRosterQuery(storeId)));
```

Add `using`s for the query and `OfflineRosterDto`.

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~ExportOfflineRosterTests"`
Expected: PASS.

- [ ] **Step 5: Run the whole backend suite**

Run: `dotnet test backend/src/SMCA.sln`
Expected: PASS (no regressions).

- [ ] **Step 6: Commit**

```bash
git add SMCA.WebApi/Controllers/v1/StoreUsersController.cs \
        SMCA.WebApi.E2ETests/Management/ExportOfflineRosterTests.cs \
        SMCA.WebApi.E2ETests/Infrastructure/TestDtos.cs
git commit -m "feat(backend): expose GET offline-roster export endpoint"
```

---

## Self-Review

- **Spec coverage:** endpoint (T5), authz SuperAdmin/OwnerAdmin + ownership (T4/T5), per-user permission shape matching `/me` (T4), per-user PBKDF2 verifier (T1/T4), anti-replay metadata bundleId/issuedAt/expiresAt/formatVersion (T4), 35-day expiry (T4), store-scoped roster query (T2), per-user feature ids (T3). Covered.
- **Type consistency:** `OfflineVerifierResult(Hash,Salt,Iterations)` (T1) → `OfflineVerifierDto{Hash,Salt,Iterations}` (T4). `GetStoreUsersByStoreIdAsync(Guid,bool)` (T2) consumed in T4. `GetAllowedFeatureIdsForUserAsync(Guid,List<int>)` (T3) consumed in T4. Aligned.
- **Verifier parameters** identical to the frontend plan's Global Constraints (PBKDF2-HMAC-SHA256 / 210000 / 16-byte salt / 32-byte key / input = stored hash string). Aligned.
- **Open verification points flagged inline** (navigation property names, `UserId` vs `UserExternalId`, `StoreModuleFeaturesDto` shape) — the implementer must confirm against real code, not guess.
