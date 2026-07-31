# Design: GET /api/v1/users/{id} — Endpoint Fixes

## Technical Approach

Mirror the verified store precedent end-to-end: validator switches from `GetByIdAsync` (double round-trip `FindAsync`) to a lightweight `IgnoreQueryFilters().AnyAsync` existence check; handler adds the envelope-404 race guard; repository reuses the DRY `IncludeStoreAndRoles` helper (already carries `.ThenInclude(o => o.User)`) so `OwnerName` resolves; controller mirrors `GetAllUsersAsync` metadata. One new E2E body test proves the include fix RED→GREEN using an actor≠target graph (SuperAdmin actor → seeded OwnerAdmin target).

## Architecture Decisions

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| AD1 | ExistsAsync signature | `new Task<bool> ExistsAsync(Guid id, CancellationToken cancellationToken = default)` | `new` hides the base generic `ExistsAsync(TId)` (FindAsync-based, `GenericRepository.cs:87-91`) — exact pattern of `IStoreRepository.cs:22` / `StoreRepository.cs:89-92`. Optional token forwards validator ct (improvement over store impl which drops it). |
| AD2 | Handler query stays FILTERED | No `IgnoreQueryFilters()` in `GetUserByIdIncludingStoreAndRoles` | Proposal mitigation claims "handler query also unfiltered" — VERIFIED FALSE: current impl is filtered (`UserRepository.cs:70-74`) and store precedent `GetStoreByIdIncludingModulesAsync` is filtered too. The race guard absorbs cross-tenant mismatch (unfiltered validator=true → filtered handler=null → 404). Unfiltering would leak cross-tenant users to any UsersAdmin. |
| AD3 | N1 minimal | `.ThenInclude(o => o.User)` + optional token param on `GetByLoginWithRelatedAsync`; NO change to `AuthenticationService.IsValidUserAsync` signature or call site (stays one-arg) | Call site (`AuthenticationService.cs:31`) has no token and no token param; 20+ Moq setups in `AuthenticationServiceTests` use one-arg form — one-arg call site keeps them matching. |
| AD4 | 404 contract | Envelope 404 `ResponseResult.Failure<UserDto>(UserErrors.NotFound, 404)` only for race window; validator keeps 400 | D1=A; mirrors `GetStoreByIdQuery.cs:30-31`. |
| AD5 | Test shape | Inline `UserByIdData` class in `UsersGetByIdTests.cs` | Mirrors `UserListDtoShape` precedent (`UsersListTests.cs:11-16`); zero blast radius on shared `TestDtos.cs`. |
| AD6 | Seed row | `StoreUser.Create(user.Id, store.Id, tenantId)` in 2nd SaveChanges batch of `SeedOwnerAdminWithStoreAsync` | StoreId exists after 1st save (line 57); `AuthzSeed.CleanupStoreGraphAsync` (`AuthzSeed.cs:103`) already deletes StoreUser by storeId → cleanup-safe for both consumers (UsersListTests:40-46, UsersUpdateTests:33-40). `StoreUser.Create` raises a domain event — no dispatcher in `SaveChangesAsync` (`ApplicationDbContext.cs:82-87`), same as proven `AuthzSeed.cs:90`. |

## Data Flow

```
GET /api/v1/users/{id}
 → [Authorize] → [HasPermission(UsersAdmin)]
 → Validator.MustAsync(UserExists) → ExistsAsync → IgnoreQueryFilters().AnyAsync(id, ct)   [1 query, no round-trip]
 → Handler → GetUserByIdIncludingStoreAndRoles(id, ct)
     → IncludeStoreAndRoles(_users.Where(u => u.Id == id)).FirstOrDefaultAsync(ct)
     → StoreUser→Store→Owner→User  +  UserRoles(active)→Role
 → user is null ? Failure(UserErrors.NotFound, 404) : Map<UserDto> → Success
```

## File Changes

| File | Action | Change |
|------|--------|--------|
| `backend/src/Domain/Interfaces/Repositories/IUserRepository.cs` | Modify | Add `new Task<bool> ExistsAsync(Guid id, CancellationToken cancellationToken = default);`. Token params on `GetUserByIdIncludingStoreAndRoles(Guid, CancellationToken = default)` and `GetByLoginWithRelatedAsync(string, CancellationToken = default)`. |
| `backend/src/Infrastructure/Persistence/Repositories/UserRepository.cs` | Modify | `public new async Task<bool> ExistsAsync(Guid id, CancellationToken ct = default) => await _users.IgnoreQueryFilters().AnyAsync(u => u.Id == id, ct);`. `GetUserByIdIncludingStoreAndRoles` body → `return await IncludeStoreAndRoles(_users.Where(u => u.Id == userId)).FirstOrDefaultAsync(cancellationToken);`. `GetByLoginWithRelatedAsync`: insert `.ThenInclude(o => o.User)` after `.ThenInclude(s => s.Owner)` (line 92); `FirstOrDefaultAsync(cancellationToken)`. |
| `backend/src/Application/Features/UserManagement/Users/Queries/GetUserById/GetUserByIdQueryValidator.cs` | Modify | Rename param `tenantId`→`userId`; body → `return await _userRepository.ExistsAsync(userId, cancellationToken);` |
| `.../GetUserById/GetUserByIdQuery.cs` | Modify | `User? user = await _userRepository.GetUserByIdIncludingStoreAndRoles(query.UserId, cancellationToken);` + `if (user is null) return ResponseResult.Failure<UserDto>(UserErrors.NotFound, 404);` (verified: `Failure<TData>(Error,int)` exists `ResponseResult.cs:14`; `UserErrors.NotFound` exists `UserErrors.cs:19`) |
| `backend/src/SMCA.WebApi/Controllers/v1/UsersController.cs` | Modify | `GetUserAsync([FromRoute] Guid id)` + add `[ProducesResponseType(StatusCodes.Status400BadRequest)]`, `Status401Unauthorized`, `Status403Forbidden` (mirror `GetAllUsersAsync:29-32`) |
| `backend/src/Application/Dtos/UserManagement/UserDto.cs` | Modify | `string? OwnerName`; `string? StoreName`; `IEnumerable<string> RoleNames { get; set; } = [];` |
| `backend/src/SMCA.WebApi.E2ETests/Infrastructure/UserSeed.cs` | Modify | Add `using Domain.Entities.StoreUsers;` + `db.Set<StoreUser>().Add(StoreUser.Create(user.Id, store.Id, tenantId));` in 2nd batch (before `SaveChangesAsync` line 61) |
| `backend/src/SMCA.WebApi.E2ETests/Users/UsersGetByIdTests.cs` | Modify | Add ONE body-asserting test + inline shape (below) |

New E2E test:

```csharp
public sealed class UserByIdData
{
    public Guid Id { get; set; }
    public string? OwnerName { get; set; }
    public string? StoreName { get; set; }
    public List<string> RoleNames { get; set; } = new();
}

[Fact]
public async Task Get_owner_admin_returns_full_body_with_owner_store_and_roles()
{
    var login = $"sa-{Guid.NewGuid():N}@test.com";
    var actorId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
    var target = await UserSeed.SeedOwnerAdminWithStoreAsync(_f);
    try
    {
        var r = await DbTestHelpers.AuthedClient(_f, actorId, login).GetAsync($"/api/v1/users/{target.UserId}");
        r.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await r.Content.ReadFromJsonAsync<ApiResponse<UserByIdData>>(ApiResponse.Json);
        body!.Succeeded.Should().BeTrue();
        body.Data!.Id.Should().Be(target.UserId);
        body.Data.OwnerName.Should().Be("E2E OwnerAdmin");   // RED: null before include fix
        body.Data.StoreName.Should().NotBeNullOrEmpty();
        body.Data.RoleNames.Should().Contain("OwnerAdmin");
    }
    finally
    {
        await AuthzSeed.CleanupStoreGraphAsync(_f, target.StoreId, target.UserId);
        await DbTestHelpers.CleanupUserAsync(_f, actorId);
    }
}
```

Assertion basis: `OwnerName ← StoreUser.Store.Owner.User.FullName` (`UserProfile.cs:21`); seeded FullName is `"E2E OwnerAdmin"` and the Owner belongs to the target user; role Name seeded via `RoleType.OwnerAdmin.GetDisplayName()` = `"OwnerAdmin"` (`RoleEntityTypeConfiguration.cs:41`).

## Testing Strategy

| Layer | What | Command (from repo root; needs Postgres `smca_test`) |
|-------|------|--------|
| Build | compile gate | `dotnet build backend/src/SMCA.WebApi/SMCA.WebApi.csproj` + E2E project |
| E2E RED | new body test fails (ownerName null), 4 existing pass | `dotnet test backend/src/SMCA.WebApi.E2ETests --filter "FullyQualifiedName~UsersGetByIdTests"` |
| E2E GREEN | same after include fix | same command |
| E2E regression | seed row consumers | `dotnet test backend/src/SMCA.WebApi.E2ETests --filter "FullyQualifiedName~UsersListTests|FullyQualifiedName~UsersUpdateTests"` |
| Unit regression | GetByLoginWithRelatedAsync signature (no GetUserById unit tests exist) | `dotnet test backend/src/Application.Tests --filter "FullyQualifiedName~AuthenticationServiceTests"` |
| Full | optional | `dotnet test backend/src/SMCA.WebApi.E2ETests` |

## RED→GREEN Sequence

1. **Commit A** — test + seed + UserDto NRT + interface/`ExistsAsync` + validator + handler guard + controller metadata, with `GetUserByIdIncludingStoreAndRoles` still on the OLD inline include chain. Build. → new test RED on `ownerName` (AutoMapper 13 null-safe member chains yield null, not 500 — proven by the existing 200 self-lookup test on a StoreUser-less SuperAdmin); existing 4 tests GREEN.
2. **Commit B** — swap method body to `IncludeStoreAndRoles(_users.Where(...))`. → new test GREEN; existing 4 stay GREEN.

## Migration / Rollout

No data migration. No feature flags. Per-file additive revert per proposal Rollback Plan.

## Contracts / Spec Alignment

`openspec/specs/users-e2e/spec.md` R2:46 ("Non-existent id → 404") aligns to 400 ONLY at ARCHIVE time (D7) — NOT part of this implementation.

## Out of Scope (guard)

Middleware logging (N4); `UserListDto` NRT; `StoreUsersController`; all other endpoints; contract options B/C; frontend changes; new unit tests; schema/migration work.

## Open Questions

None — every API, signature, and precedent verified against source before writing this design.
