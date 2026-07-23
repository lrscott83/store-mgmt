# 05 — SMCA.WebApi Authorization (cross-cutting) E2E — Implementation Plan (self-contained)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development / executing-plans.
> Steps use `- [ ]`. Materializes the `05` test-plan: the permissions engine tested through its two
> windows — `GET /auth/me` (report) and `Stores` (enforcement) — plus the `§9.5` scoping/smoke chain.

**Goal:** Implement, against real Postgres via `dotnet test`, the authorization matrix (`05` test-plan §3)
across `/auth/me` and `Stores`, plus store-scoping and a `Usages` smoke.

**Reuses (do NOT redefine):** `04` harness — `AppTestFactory`, `WebAppFixture` (collection `"e2e"`),
`ApiResponse<T>`/`ApiResponse.Json`, `DbTestHelpers.{HashPassword, SeedSuperAdminAsync,
SeedUserWithRoleAsync, CleanupUserAsync, AuthedClient}`, `StoreSeed.{SeedOwnerAsync, SeedStoreAsync,
SeedStoresAdminUserAsync, ManagementModuleId, Cleanup*}`. This plan adds ONE new helper class
(`AuthzSeed`) and the test classes.

**Tech Stack:** .NET 8, xUnit, FluentAssertions, EF Core 8 + Npgsql.

## Global Constraints (verified — see `05` test-plan §2)

- Enforcement denial via `[HasPermission]` = **HTTP 403** (`ForbidResult`, empty body). Not 200-wrapped.
- SuperAdmin bypasses the filter entirely. approve/disapprove/delete on Stores = **SuperAdmin-only**.
- `/me` failures (unknown/inactive user) = **HTTP 200**, `succeeded=false`, `actionCode=404`, code
  `User.NotFound` / `User.Inactive`.
- OwnerAdmin recognition requires `UserRole.TenantId == User.TenantId` (`IsStoreAdmin`); SuperAdmin/ReSeller
  do not.
- Stores feature `73` (Management module `7`); a store is granted a feature only when its
  `StoreModule` row for that feature's module exists. `Role` 1–4 and `Feature` 73 are pre-seeded by
  migrations (`HasData`) — do NOT seed them.
- `IsActive` is inherited from `AuditableEntity` (default `true`) on `Store`/`StoreModule`/`StoreRoleFeature`
  — freshly seeded rows are active; do not set it.
- Verified factory signatures: `StoreRoleFeature.Create(Guid storeId, int roleId, int featureId, Guid tenantId)`;
  `StoreUser.Create(Guid userId, Guid storeId, Guid tenantId)`;
  `StoreModule.Create(storeId, moduleId, price, modulePriceIncluded, modulePrice, moduleDiscountPrice, modulePercentDiscountPrice, tenantId)`;
  `UserRole.Create(userId, roleId, tenantId)`; `Owner.Create(userId, guest, tenantId, description)`;
  `Store.Create(name, ownerId, approved, tenantId, paymentStartDate, address?, description?)`;
  `User.SelectedStoreId` is a public setter.
- Per project policy the human runs ALL git commands. Every "Checkpoint" is a PAUSE.

---

## File Structure

- Create: `Infrastructure/AuthzSeed.cs` — role×store×feature seed fixtures + cleanup (new helpers only).
- Create: `Infrastructure/TestDtos.cs` addition — `MeData` (deserialize `CurrentUserDto`).
- Create: `Auth/AuthMePermissionsTests.cs` (Task 2)
- Create: `Auth/StoresAuthorizationTests.cs` (Task 3)
- Create: `Auth/StoreScopingTests.cs` (Task 4)
- Create: `Auth/UsagesSmokeTests.cs` (Task 5)

---

## Task 1: `AuthzSeed` helpers + `MeData` DTO

- [ ] **Step 1: `Infrastructure/MeData` (add to `TestDtos.cs`)**

```csharp
// Mirrors Application.Dtos.Authentication.CurrentUserDto (camelCase JSON).
public sealed class MeData
{
    public Guid Id { get; set; }
    public string Login { get; set; } = string.Empty;
    public bool IsSuperAdmin { get; set; }
    public bool IsOwnerAdmin { get; set; }
    public bool IsReSeller { get; set; }
    public List<int> FeatureIds { get; set; } = new();
    public Guid SelectedStoreId { get; set; }
    public List<int> StoreModuleIds { get; set; } = new();
    public bool IsActive { get; set; }
}
```

- [ ] **Step 2: `Infrastructure/AuthzSeed.cs`**

```csharp
using Domain.Common.Constants;
using Domain.Common.Enums;
using Domain.Entities.Owners;
using Domain.Entities.StoreModules;
using Domain.Entities.StoreRoleFeatures;
using Domain.Entities.Stores;
using Domain.Entities.StoreUsers;
using Domain.Entities.UserRoles;
using Domain.Entities.Users;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace SMCA.WebApi.E2ETests.Infrastructure;

public static class AuthzSeed
{
    public const int StoresFeatureId = 73;    // FeatureType.Stores
    public const int ManagementModuleId = 7;  // ModuleType.Management

    public sealed record OwnerAdminFixture(Guid UserId, string Login, Guid OwnerId, Guid StoreId, Guid TenantId);
    public sealed record StoreUserFixture(Guid UserId, string Login, Guid OwnerUserId, Guid OwnerId, Guid StoreId, Guid TenantId);

    // OwnerAdmin whose selected store has (withManagementModule=true) or lacks the Management module.
    // With Management => AllowedFeaturesService grants Stores(73); without => it does not.
    public static async Task<OwnerAdminFixture> SeedOwnerAdminAsync(AppTestFactory factory, bool withManagementModule)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = DataUtils.DefaultTenant.Id;
        var login = $"oadmin-{Guid.NewGuid():N}@test.com";
        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"), "E2E OwnerAdmin", "0000000000", login, tenantId);
        db.Set<User>().Add(user);
        var owner = Owner.Create(user.Id, false, tenantId, "E2E OwnerAdmin owner");
        db.Set<Owner>().Add(owner);
        await db.SaveChangesAsync();

        var store = Store.Create($"OA-Store-{Guid.NewGuid():N}", owner.Id, false, tenantId, DateOnly.FromDateTime(DateTime.UtcNow));
        db.Set<Store>().Add(store);
        await db.SaveChangesAsync();

        if (withManagementModule)
            db.Set<StoreModule>().Add(StoreModule.Create(store.Id, ManagementModuleId, 0, true, 0, 0, 0, tenantId));
        db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.OwnerAdmin, tenantId));
        user.SelectedStoreId = store.Id;
        await db.SaveChangesAsync();
        return new OwnerAdminFixture(user.Id, login, owner.Id, store.Id, tenantId);
    }

    // OwnerAdmin whose UserRole.TenantId != User.TenantId -> IsStoreAdmin fails -> not recognized as OwnerAdmin.
    public static async Task<OwnerAdminFixture> SeedTenantMismatchOwnerAdminAsync(AppTestFactory factory)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = DataUtils.DefaultTenant.Id;
        var login = $"mismatch-{Guid.NewGuid():N}@test.com";
        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"), "E2E Mismatch", "0000000000", login, tenantId);
        db.Set<User>().Add(user);
        var owner = Owner.Create(user.Id, false, tenantId, "E2E Mismatch owner");
        db.Set<Owner>().Add(owner);
        await db.SaveChangesAsync();
        var store = Store.Create($"MM-Store-{Guid.NewGuid():N}", owner.Id, false, tenantId, DateOnly.FromDateTime(DateTime.UtcNow));
        db.Set<Store>().Add(store);
        await db.SaveChangesAsync();
        db.Set<StoreModule>().Add(StoreModule.Create(store.Id, ManagementModuleId, 0, true, 0, 0, 0, tenantId));
        // Deliberate mismatch: role tenant != user tenant.
        db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.OwnerAdmin, Guid.NewGuid()));
        user.SelectedStoreId = store.Id;
        await db.SaveChangesAsync();
        return new OwnerAdminFixture(user.Id, login, owner.Id, store.Id, tenantId);
    }

    // Plain StoreUser linked to a store; granted `featureId` via a StoreRoleFeature when grantedFeatureId != null.
    public static async Task<StoreUserFixture> SeedStoreUserAsync(AppTestFactory factory, int? grantedFeatureId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = DataUtils.DefaultTenant.Id;

        var ownerLogin = $"suo-{Guid.NewGuid():N}@test.com";
        var ownerUser = User.Create(ownerLogin, DbTestHelpers.HashPassword("Password123"), "E2E SU Owner", "0000000000", ownerLogin, tenantId);
        db.Set<User>().Add(ownerUser);
        var owner = Owner.Create(ownerUser.Id, false, tenantId, "E2E SU owner");
        db.Set<Owner>().Add(owner);
        await db.SaveChangesAsync();
        var store = Store.Create($"SU-Store-{Guid.NewGuid():N}", owner.Id, false, tenantId, DateOnly.FromDateTime(DateTime.UtcNow));
        db.Set<Store>().Add(store);
        await db.SaveChangesAsync();
        db.Set<StoreModule>().Add(StoreModule.Create(store.Id, ManagementModuleId, 0, true, 0, 0, 0, tenantId));

        var login = $"suser-{Guid.NewGuid():N}@test.com";
        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"), "E2E StoreUser", "0000000000", login, tenantId);
        db.Set<User>().Add(user);
        db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.StoreUser, tenantId));
        db.Set<StoreUser>().Add(StoreUser.Create(user.Id, store.Id, tenantId));
        if (grantedFeatureId is int fid)
            db.Set<StoreRoleFeature>().Add(StoreRoleFeature.Create(store.Id, (int)RoleType.StoreUser, fid, tenantId));
        user.SelectedStoreId = store.Id;
        await db.SaveChangesAsync();
        return new StoreUserFixture(user.Id, login, ownerUser.Id, owner.Id, store.Id, tenantId);
    }

    // FK-ordered cleanup for a seeded store + its people.
    public static async Task CleanupStoreGraphAsync(AppTestFactory factory, Guid storeId, params Guid[] userIds)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await RemoveWhere<StoreRoleFeature>(db, x => x.StoreId == storeId);
        await RemoveWhere<StoreUser>(db, x => x.StoreId == storeId);
        await RemoveWhere<StoreModule>(db, x => x.StoreId == storeId);
        var stores = await db.Set<Store>().IgnoreQueryFilters().Where(s => s.Id == storeId).ToListAsync();
        var ownerIds = stores.Select(s => s.OwnerId).ToList();
        db.Set<Store>().RemoveRange(stores);
        await db.SaveChangesAsync();
        await RemoveWhere<Owner>(db, o => ownerIds.Contains(o.Id));
        foreach (var uid in userIds)
        {
            await RemoveWhere<UserRole>(db, r => r.UserId == uid);
            await RemoveWhere<User>(db, u => u.Id == uid);
        }
    }

    private static async Task RemoveWhere<T>(ApplicationDbContext db, System.Linq.Expressions.Expression<Func<T, bool>> pred) where T : class
    {
        db.Set<T>().RemoveRange(await db.Set<T>().IgnoreQueryFilters().Where(pred).ToListAsync());
        await db.SaveChangesAsync();
    }
}
```

- [ ] **Step 3:** Build the test project — `dotnet build backend/src/SMCA.WebApi.E2ETests`. Expect compile OK
  (validates every factory signature above). **Checkpoint** — `test(webapi): authz seed helpers`.

---

## Task 2: `/auth/me` report window — `AuthMePermissionsTests`

Create `Auth/AuthMePermissionsTests.cs`. Reuses `DbTestHelpers.AuthedClient` (mints a real JWT for the seeded user).

```csharp
using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Auth;

[Collection("e2e")]
public sealed class AuthMePermissionsTests
{
    private readonly AppTestFactory _f;
    public AuthMePermissionsTests(WebAppFixture fixture) => _f = fixture.Factory;

    private static async Task<MeData> MeAsync(HttpClient client)
    {
        var r = await client.GetAsync("/api/v1/auth/me");
        r.StatusCode.Should().Be(HttpStatusCode.OK);
        var b = await r.Content.ReadFromJsonAsync<ApiResponse<MeData>>(ApiResponse.Json);
        b!.Succeeded.Should().BeTrue();
        return b.Data!;
    }

    [Fact]
    public async Task Me_super_admin_reports_IsSuperAdmin()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var id = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var me = await MeAsync(DbTestHelpers.AuthedClient(_f, id, login));
            me.IsSuperAdmin.Should().BeTrue();
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, id); }
    }

    [Fact]
    public async Task Me_owner_admin_with_management_store_includes_stores_feature()
    {
        var f = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);
        try
        {
            var me = await MeAsync(DbTestHelpers.AuthedClient(_f, f.UserId, f.Login));
            me.IsOwnerAdmin.Should().BeTrue();
            me.FeatureIds.Should().Contain(AuthzSeed.StoresFeatureId);
        }
        finally { await AuthzSeed.CleanupStoreGraphAsync(_f, f.StoreId, f.UserId); }
    }

    [Fact]
    public async Task Me_owner_admin_without_management_store_excludes_stores_feature()
    {
        var f = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: false);
        try
        {
            var me = await MeAsync(DbTestHelpers.AuthedClient(_f, f.UserId, f.Login));
            me.IsOwnerAdmin.Should().BeTrue();
            me.FeatureIds.Should().NotContain(AuthzSeed.StoresFeatureId);
        }
        finally { await AuthzSeed.CleanupStoreGraphAsync(_f, f.StoreId, f.UserId); }
    }

    [Fact]
    public async Task Me_store_user_with_feature_reports_role_in_selected_store()
    {
        var f = await AuthzSeed.SeedStoreUserAsync(_f, grantedFeatureId: AuthzSeed.StoresFeatureId);
        try
        {
            var me = await MeAsync(DbTestHelpers.AuthedClient(_f, f.UserId, f.Login));
            me.IsSuperAdmin.Should().BeFalse();
            me.IsOwnerAdmin.Should().BeFalse();
            me.SelectedStoreId.Should().Be(f.StoreId);
        }
        finally { await AuthzSeed.CleanupStoreGraphAsync(_f, f.StoreId, f.UserId, f.OwnerUserId); }
    }

    [Fact]
    public async Task Me_reseller_reports_IsReSeller()
    {
        var login = $"rs-{Guid.NewGuid():N}@test.com";
        var uf = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)Domain.Common.Enums.RoleType.ReSeller);
        try
        {
            var me = await MeAsync(DbTestHelpers.AuthedClient(_f, uf.UserId, uf.Login));
            me.IsReSeller.Should().BeTrue();
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, uf.UserId); }
    }

    [Fact]
    public async Task Me_user_role_tenant_mismatch_not_recognized_as_owner_admin()
    {
        var f = await AuthzSeed.SeedTenantMismatchOwnerAdminAsync(_f);
        try
        {
            var me = await MeAsync(DbTestHelpers.AuthedClient(_f, f.UserId, f.Login));
            me.IsOwnerAdmin.Should().BeFalse();
        }
        finally { await AuthzSeed.CleanupStoreGraphAsync(_f, f.StoreId, f.UserId); }
    }
}
```

> Note: `SeedUserWithRoleAsync` returns a fixture with `UserId`/`Login` (see `04` `UserFixture`); adjust
> member names to `04`'s actual record if they differ.

- [ ] Run `--filter ~AuthMePermissionsTests`. **Checkpoint** — `test(webapi): authz /me report window e2e`.

---

## Task 3: Stores enforcement window — `StoresAuthorizationTests`

Create `Auth/StoresAuthorizationTests.cs`. Enforcement denial = **403**; SuperAdmin passes; approve = SuperAdmin-only.

```csharp
using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Auth;

[Collection("e2e")]
public sealed class StoresAuthorizationTests
{
    private readonly AppTestFactory _f;
    public StoresAuthorizationTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Stores_no_token_returns_401()
    {
        var r = await _f.CreateClient().GetAsync("/api/v1/stores/by-current-user");
        r.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Stores_super_admin_passes_read()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var id = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, id, login).GetAsync("/api/v1/stores/by-current-user");
            r.StatusCode.Should().Be(HttpStatusCode.OK);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, id); }
    }

    [Fact]
    public async Task Stores_super_admin_can_approve()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var id = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var store = await StoreSeed.SeedStoreAsync(_f, $"Ap-{Guid.NewGuid():N}", approved: false);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, id, login)
                .PostAsJsonAsync($"/api/v1/stores/approve", new { StoreId = store.StoreId });
            r.StatusCode.Should().Be(HttpStatusCode.OK); // SuperAdmin bypass; adjust route/body to StoresController.ApproveStoreAsync
        }
        finally { await StoreSeed.CleanupStoreFixtureAsync(_f, store); await DbTestHelpers.CleanupUserAsync(_f, id); }
    }

    [Fact]
    public async Task Stores_owner_admin_with_feature_passes_read_but_approve_403()
    {
        var f = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, f.UserId, f.Login);
            (await client.GetAsync("/api/v1/stores/by-current-user")).StatusCode.Should().Be(HttpStatusCode.OK);
            var approve = await client.PostAsJsonAsync("/api/v1/stores/approve", new { StoreId = f.StoreId });
            approve.StatusCode.Should().Be(HttpStatusCode.Forbidden); // approve is SuperAdmin-only
        }
        finally { await AuthzSeed.CleanupStoreGraphAsync(_f, f.StoreId, f.UserId); }
    }

    [Fact]
    public async Task Stores_owner_admin_without_management_returns_403()
    {
        var f = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: false);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, f.UserId, f.Login).GetAsync("/api/v1/stores/by-current-user");
            r.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        finally { await AuthzSeed.CleanupStoreGraphAsync(_f, f.StoreId, f.UserId); }
    }

    [Fact]
    public async Task Stores_store_user_with_feature_passes()
    {
        var f = await AuthzSeed.SeedStoreUserAsync(_f, grantedFeatureId: AuthzSeed.StoresFeatureId);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, f.UserId, f.Login).GetAsync("/api/v1/stores/by-current-user");
            r.StatusCode.Should().Be(HttpStatusCode.OK);
        }
        finally { await AuthzSeed.CleanupStoreGraphAsync(_f, f.StoreId, f.UserId, f.OwnerUserId); }
    }

    [Fact]
    public async Task Stores_store_user_without_feature_returns_403()
    {
        var f = await AuthzSeed.SeedStoreUserAsync(_f, grantedFeatureId: null);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, f.UserId, f.Login).GetAsync("/api/v1/stores/by-current-user");
            r.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        finally { await AuthzSeed.CleanupStoreGraphAsync(_f, f.StoreId, f.UserId, f.OwnerUserId); }
    }

    [Fact]
    public async Task Stores_reseller_returns_403()
    {
        var uf = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)Domain.Common.Enums.RoleType.ReSeller);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, uf.UserId, uf.Login).GetAsync("/api/v1/stores/by-current-user");
            r.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, uf.UserId); }
    }

    [Fact]
    public async Task Stores_tenant_mismatch_owner_admin_returns_403()
    {
        var f = await AuthzSeed.SeedTenantMismatchOwnerAdminAsync(_f);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, f.UserId, f.Login).GetAsync("/api/v1/stores/by-current-user");
            r.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        finally { await AuthzSeed.CleanupStoreGraphAsync(_f, f.StoreId, f.UserId); }
    }
}
```

> **Confirm before running:** the exact route + request body of `StoresController.ApproveStoreAsync`
> (`POST approve`) and `by-current-user` — adjust the two `approve` calls to the real signature. Everything
> else asserts only status codes and is signature-independent.

- [ ] Run `--filter ~StoresAuthorizationTests`. **Checkpoint** — `test(webapi): authz stores enforcement e2e`.

---

## Task 4: Store-scoping chain (§9.5) — `StoreScopingTests`

Create `Auth/StoreScopingTests.cs`. Asserts `SetMyStore` (`PUT /stores`) changes `SelectedStoreId` and `/me`
recomputes the permission payload.

```csharp
using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Auth;

[Collection("e2e")]
public sealed class StoreScopingTests
{
    private readonly AppTestFactory _f;
    public StoreScopingTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task SetMyStore_changes_selected_store_and_me_recomputes()
    {
        // Seed an OwnerAdmin with two stores; switch selected store; assert /me.SelectedStoreId follows.
        // Store B differs from the seeded selected store A.
        var f = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);
        var storeB = await StoreSeed.SeedStoreAsync(_f, $"B-{Guid.NewGuid():N}", approved: true);
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, f.UserId, f.Login);
            var put = await client.PutAsJsonAsync("/api/v1/stores", new { StoreId = storeB.StoreId }); // SetMyStore — confirm body
            put.StatusCode.Should().Be(HttpStatusCode.OK);

            var me = await client.GetAsync("/api/v1/auth/me");
            var b = await me.Content.ReadFromJsonAsync<ApiResponse<MeData>>(ApiResponse.Json);
            b!.Data!.SelectedStoreId.Should().Be(storeB.StoreId);
        }
        finally
        {
            await StoreSeed.CleanupStoreFixtureAsync(_f, storeB);
            await AuthzSeed.CleanupStoreGraphAsync(_f, f.StoreId, f.UserId);
        }
    }
}
```

> **Confirm:** `SetMyStore` route/verb/body (`PUT /api/v1/stores`) against `StoresController.SetMyStoreIdAsync`
> — the store B owner must match the acting OwnerAdmin OR the endpoint must accept it; if `SetMyStore` only
> accepts the user's own stores, seed store B under the same owner instead of `StoreSeed.SeedStoreAsync`.

- [ ] Run `--filter ~StoreScopingTests`. **Checkpoint** — `test(webapi): authz store-scoping e2e`.

---

## Task 5: Usages smoke (§9.5) — `UsagesSmokeTests`

Create `Auth/UsagesSmokeTests.cs`. `POST store-daily-usage` requires `ProfileAdmin` (OwnerAdmin/StoreUser/
ReSeller) or SuperAdmin.

```csharp
using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Auth;

[Collection("e2e")]
public sealed class UsagesSmokeTests
{
    private readonly AppTestFactory _f;
    public UsagesSmokeTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Post_store_daily_usage_returns_200_for_super_admin()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var id = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            // Body = UpdateStoreDailyUsageCommand — confirm required fields against the command record.
            var r = await DbTestHelpers.AuthedClient(_f, id, login)
                .PostAsJsonAsync("/api/v1/usages/store-daily-usage", new { });
            r.StatusCode.Should().Be(HttpStatusCode.OK);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, id); }
    }
}
```

> **Confirm:** `UpdateStoreDailyUsageCommand` fields and the exact route base of `UsagesController`
> (`api/v1/usages/store-daily-usage`) before running — the empty body may fail validation.

- [ ] Run `--filter ~UsagesSmokeTests`.
- [ ] **Run the whole suite** — `dotnet test backend/src/SMCA.WebApi.E2ETests` → PASS.
- [ ] **Checkpoint** — `test(webapi): authz usages smoke e2e`.

---

## Self-Review

- **Matrix coverage:** rows 1–9 of `05` test-plan §3 mapped — SuperAdmin ✓, OwnerAdmin ±Management ✓,
  StoreUser ±feature ✓, ReSeller ✓, tenant mismatch ✓, no-token 401 ✓, inactive user → covered at
  endpoint level in `03b` (cross-referenced, not duplicated). §9.5 scoping ✓ Task 4, usages smoke ✓ Task 5.
- **Verified factories:** every `.Create(...)` uses a signature cited in `05` test-plan §2 / the entity
  files. `IsActive` inherited (default true) — not set. `Role`/`Feature` pre-seeded — not seeded.
- **Helpers reused, not redefined:** `DbTestHelpers`/`StoreSeed` from `04`; only `AuthzSeed` + `MeData` added.
- **Open confirmations (flagged inline, resolve at implementation):** (1) `StoresController.ApproveStoreAsync`
  and `SetMyStoreIdAsync` route/body; (2) `UpdateStoreDailyUsageCommand` required fields; (3) `04`'s
  `UserFixture` member names (`UserId`/`Login`). All are signature details that do not change the assertions
  (status codes / claim booleans).
- **Not asserted (optional, `05` test-plan §6):** SuperAdmin non-default-tenant `GET {id}` bypass; ReSeller
  unfiltered allowed-features. Add later if wanted.
