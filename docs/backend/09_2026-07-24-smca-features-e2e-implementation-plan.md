# 09 — SMCA.WebApi Features E2E — Implementation Plan (self-contained)

> **As-built (2026-07-25): 33 tests** — changes from original plan documented inline.
> **Key findings during apply:**
> 1. `activate` always returns `true` on both calls (not `false` on 2nd) — `UpdateAsync` always marks Modified
> 2. Class-level `[HasPermission(SuperAdmin)]` filter blocks method-level widening — StoresAdmin unreachable
> 3. 3 test scenarios removed (R4.2, R7.5, R10.7), 1 corrected (R3.2 pin)
> See docs/backend/09_...-test-plan.md §6 Finding #3 for full details.

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development / executing-plans.
> Steps use `- [ ]`. Materializes the `09` test-plan: the 3 `FeaturesController` endpoints, exhaustively,
> including each endpoint's own 401/403 auth matrix (NOT delegated to `05`), the `activate` shared-seed
> mutation with snapshot+restore, and the `activate` always-true-return pin.

**Goal:** Implement, against real Postgres via `dotnet test`, the 3 Features endpoints' behavior + auth,
leaving the shared seed exactly as found (snapshot+restore for the mutating `activate`).

**Reuses (do NOT redefine):** `04`/`05` harness — `DbTestHelpers.{SeedSuperAdminAsync,
SeedUserWithRoleAsync, AuthedClient, CleanupUserAsync}`, `StoreSeed.{SeedStoresAdminUserAsync, Cleanup*}`,
`ApiResponse<T>`/`ApiResponse.Json`, `Factory.Services.CreateScope()` → `ApplicationDbContext`. If any
helper is not on disk yet, duplicate it locally (directive: self-contained, e2e, duplication OK).

**Actor strategy:** only SuperAdmin passes the class-level `[HasPermission(SuperAdmin)]` filter.
**StoresAdmin is UNREACHABLE** — the method-level `[HasPermission(SuperAdmin, StoresAdmin)]` on
`/available` never executes because the class filter runs first. All 403/401 cases use throwaway
role actors.

## Global Constraints (verified — `09` test-plan §2)

- Class filter `[HasPermission(SuperAdmin)]`; `available` widens to `[HasPermission(SuperAdmin,
  StoresAdmin)]`. No token → 401; authenticated-but-rejected → 403; success → `Ok(ResponseResult<T>)`.
- `activate` **mutates shared seed** (Module 6/5, Feature 60/50, creates Feature 33) and returns
  `bool = SaveChanges>0` → **always true** (both calls). `FeaturesRepository.UpdateAsync` calls
  `context.UpdateAsync(entity)` which always marks entities Modified, so `SaveChanges>0` even when no
  values changed. Leave seed as found: snapshot before, restore in `finally`, delete Egress only if
  this test created it.
- Ids: `ModuleType` Statistics=6, Reports=5, Inventory=3, Management=7; `FeatureType` Egress=33,
  TodayReports=50, Dashboard=60.
- Entity access: `db.Set<Domain.Entities.Modules.Module>()`, `db.Set<Domain.Entities.Features.Feature>()`;
  properties `Id`, `IsActive`, `Price` (Module) / `Id`, `IsActive` (Feature). **Confirm exact property
  names + `Feature.Create(...)` signature at implementation** (see `ActivateFeaturesCommand.cs:79-87`).
- Human runs ALL git. Every Checkpoint is a PAUSE.

## File Structure

- Create under `SMCA.WebApi.E2ETests/Features/`: `FeaturesListTests.cs`, `FeaturesListAuthTests.cs`,
  `FeaturesActivateTests.cs`, `FeaturesActivateAuthTests.cs`, `FeaturesAvailableTests.cs`,
  `FeaturesAvailableAuthTests.cs`, and a local helper `FeatureSeed.cs` (inactive-feature insert + activate
  snapshot/restore).
- **09c gap tests:** `FeaturesListGapTests.cs` (Task 5), `FeaturesActivateGapTests.cs` (Task 6),
  `FeaturesAvailableGapTests.cs` (Task 7). They reuse the same `FeatureSeed` helper, extended with the
  gap-fill helpers in Task 0b.

---

## Task 0: `FeatureSeed` helper (local to this plan)

```csharp
using Microsoft.Extensions.DependencyInjection;
using Domain.Entities.Features;
using Domain.Entities.Modules;
using Infrastructure.Persistence.Contexts;
using SMCA.WebApi.E2ETests.Infrastructure;

namespace SMCA.WebApi.E2ETests.Features;

// Snapshot of the rows `activate` mutates, so a test can restore the shared seed in finally.
public sealed record ActivateSnapshot(
    bool StatisticsActive, float StatisticsPrice, bool ReportsActive,
    bool DashboardActive, bool TodayReportsActive, bool EgressExisted);

public static class FeatureSeed
{
    // --- inactive feature for the List tests (insert + delete; our own row) ---
    public static async Task<int> InsertInactiveFeatureAsync(AppTestFactory f)
    {
        using var scope = f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        // Confirm Feature.Create signature at implementation (ActivateFeaturesCommand.cs:79-87).
        var feature = Feature.Create(9099, "E2E-Inactive", "e2e inactive feature",
            (int)Domain.Common.Enums.ModuleType.Inventory, 999, false, false);
        db.Set<Feature>().Add(feature);
        await db.SaveChangesAsync();
        return feature.Id;
    }

    public static async Task DeleteFeatureAsync(AppTestFactory f, int id)
    {
        using var scope = f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var feature = await db.Set<Feature>().FindAsync(id);
        if (feature is not null) { db.Set<Feature>().Remove(feature); await db.SaveChangesAsync(); }
    }

    // --- activate snapshot/restore ---
    public static async Task<ActivateSnapshot> SnapshotAsync(AppTestFactory f)
    {
        using var scope = f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var stats = await db.Set<Module>().FindAsync(6);
        var reports = await db.Set<Module>().FindAsync(5);
        var dashboard = await db.Set<Feature>().FindAsync(60);
        var todayReports = await db.Set<Feature>().FindAsync(50);
        var egress = await db.Set<Feature>().FindAsync(33);
        return new ActivateSnapshot(
            stats?.IsActive ?? false, stats?.Price ?? 0, reports?.IsActive ?? false,
            dashboard?.IsActive ?? false, todayReports?.IsActive ?? false, egress is not null);
    }

    public static async Task RestoreAsync(AppTestFactory f, ActivateSnapshot s)
    {
        using var scope = f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var stats = await db.Set<Module>().FindAsync(6);
        if (stats is not null) { stats.IsActive = s.StatisticsActive; stats.Price = s.StatisticsPrice; }
        var reports = await db.Set<Module>().FindAsync(5);
        if (reports is not null) reports.IsActive = s.ReportsActive;
        var dashboard = await db.Set<Feature>().FindAsync(60);
        if (dashboard is not null) dashboard.IsActive = s.DashboardActive;
        var todayReports = await db.Set<Feature>().FindAsync(50);
        if (todayReports is not null) todayReports.IsActive = s.TodayReportsActive;
        if (!s.EgressExisted)
        {
            var egress = await db.Set<Feature>().FindAsync(33);
            if (egress is not null) db.Set<Feature>().Remove(egress);
        }
        await db.SaveChangesAsync();
    }

    // ---------- gap-fill helpers (09c) ----------

    // Active/inactive feature under an arbitrary module (id 909x range). Delete via DeleteFeatureAsync.
    public static async Task<int> InsertFeatureUnderModuleAsync(AppTestFactory f, int moduleId, bool isActive, int id)
    {
        using var scope = f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var feature = Feature.Create(id, $"E2E-{id}", "e2e gap feature", moduleId, 995, true, isActive);
        db.Set<Feature>().Add(feature);
        await db.SaveChangesAsync();
        return feature.Id;
    }

    // Throwaway INACTIVE module (9090) + ACTIVE feature (9092) under it. Delete feature THEN module.
    public static async Task<(int ModuleId, int FeatureId)> InsertInactiveModuleWithActiveFeatureAsync(AppTestFactory f)
    {
        using var scope = f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        // Module.Create(id, name, order, priceIncluded, price, availableToStore, isActive) — isActive=false.
        var module = Module.Create(9090, "E2E-InactiveModule", 990, false, 0f, false, false);
        db.Set<Module>().Add(module);
        var feature = Feature.Create(9092, "E2E-UnderInactiveModule", "e2e", 9090, 996, true, true); // feature IS active
        db.Set<Feature>().Add(feature);
        await db.SaveChangesAsync();
        return (module.Id, feature.Id);
    }

    public static async Task DeleteModuleAsync(AppTestFactory f, int id)
    {
        using var scope = f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var m = await db.Set<Module>().FindAsync(id);
        if (m is not null) { db.Set<Module>().Remove(m); await db.SaveChangesAsync(); }
    }

    // Force the activate create-branch: ensure Egress(33) is ABSENT. Restore via ActivateSnapshot(EgressExisted=false).
    public static async Task DeleteEgressAsync(AppTestFactory f)
    {
        using var scope = f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var egress = await db.Set<Feature>().FindAsync((int)Domain.Common.Enums.FeatureType.Egress);
        if (egress is not null) { db.Set<Feature>().Remove(egress); await db.SaveChangesAsync(); }
    }

    // Egress(33) is a PK row, so this is 0 or 1 — pins that activate never double-inserts it.
    public static async Task<int> EgressCountAsync(AppTestFactory f)
    {
        using var scope = f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var egress = await db.Set<Feature>().FindAsync((int)Domain.Common.Enums.FeatureType.Egress);
        return egress is null ? 0 : 1;
    }

    // Flip the Management(7) module IsActive flag; returns the PREVIOUS value so the caller can restore it.
    public static async Task<bool> SetManagementModuleActiveAsync(AppTestFactory f, bool isActive)
    {
        using var scope = f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var m = await db.Set<Module>().FindAsync((int)Domain.Common.Enums.ModuleType.Management);
        var previous = m?.IsActive ?? false;
        if (m is not null) { m.IsActive = isActive; await db.SaveChangesAsync(); }
        return previous;
    }
}
```

- [ ] Compile the helper. **Checkpoint** — `test(webapi): features seed helper`.

---

## Task 1: `FeaturesListTests`

```csharp
using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Features;

[Collection("e2e")]
public sealed class FeaturesListTests
{
    private readonly AppTestFactory _f;
    public FeaturesListTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task List_features_as_super_admin_returns_200()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).GetAsync("/api/v1/Features/all/true");
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<List<FeatureDtoShape>>>(ApiResponse.Json);
            b!.Succeeded.Should().BeTrue();
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    [Fact]
    public async Task List_includeInactive_true_includes_inactive_feature()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var featureId = await FeatureSeed.InsertInactiveFeatureAsync(_f);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).GetAsync("/api/v1/Features/all/true");
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<List<FeatureDtoShape>>>(ApiResponse.Json);
            b!.Data.Should().Contain(x => x.Id == featureId);
        }
        finally { await FeatureSeed.DeleteFeatureAsync(_f, featureId); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    [Fact]
    public async Task List_includeInactive_false_excludes_inactive_feature()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var featureId = await FeatureSeed.InsertInactiveFeatureAsync(_f);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).GetAsync("/api/v1/Features/all/false");
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<List<FeatureDtoShape>>>(ApiResponse.Json);
            b!.Data.Should().NotContain(x => x.Id == featureId);
        }
        finally { await FeatureSeed.DeleteFeatureAsync(_f, featureId); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }
}

// Local DTO shape for deserialization. Expanded for the 09c gap tests (module/order/shape asserts).
public sealed class FeatureDtoShape
{
    public int Id { get; set; }
    public string? Name { get; set; }
    public int ModuleId { get; set; }
    public int Order { get; set; }
    public bool AvailableToStore { get; set; }
}
```

- [ ] Run `--filter ~FeaturesListTests`. **Checkpoint** — `test(webapi): features list e2e`.

---

## Task 2: `FeaturesActivateTests` (snapshot+restore + always-true pin)

```csharp
using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Domain.Entities.Modules;
using Domain.Entities.Features;
using Infrastructure.Persistence.Contexts;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Features;

[Collection("e2e")]
public sealed class FeaturesActivateTests
{
    private readonly AppTestFactory _f;
    public FeaturesActivateTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Activate_as_super_admin_returns_200_true()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var snap = await FeatureSeed.SnapshotAsync(_f);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login)
                .PostAsync("/api/v1/Features/activate", content: null);
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json);
            b!.Succeeded.Should().BeTrue();
            b.Data.Should().BeTrue();

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            (await db.Set<Module>().FindAsync(6))!.IsActive.Should().BeTrue();   // Statistics
            (await db.Set<Module>().FindAsync(6))!.Price.Should().Be(1000);
            (await db.Set<Feature>().FindAsync(60))!.IsActive.Should().BeTrue(); // Dashboard
            (await db.Set<Feature>().FindAsync(50))!.IsActive.Should().BeTrue(); // TodayReports
            (await db.Set<Feature>().FindAsync(33)).Should().NotBeNull();        // Egress
        }
        finally { await FeatureSeed.RestoreAsync(_f, snap); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    // PIN: activate always returns true. UpdateAsync marks entities Modified, so SaveChanges>0 both times.
    [Fact]
    public async Task Activate_twice_both_return_true()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var snap = await FeatureSeed.SnapshotAsync(_f);
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, admin, login);
            var first = await (await client.PostAsync("/api/v1/Features/activate", null))
                .Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json);
            var second = await (await client.PostAsync("/api/v1/Features/activate", null))
                .Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json);
            first!.Data.Should().BeTrue();
            second!.Data.Should().BeTrue(); // both return true (UpdateAsync always marks Modified)
        }
        finally { await FeatureSeed.RestoreAsync(_f, snap); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }
}
```

- [ ] Run `--filter ~FeaturesActivateTests`. **Checkpoint** — `test(webapi): features activate e2e (snapshot+restore, always-true pin)`.

---

## Task 3: `FeaturesAvailableTests` (1 test — StoresAdmin test REMOVED)

```csharp
using System.Net;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Features;

[Collection("e2e")]
public sealed class FeaturesAvailableTests
{
    private readonly AppTestFactory _f;
    public FeaturesAvailableTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Available_as_super_admin_returns_200()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).GetAsync("/api/v1/Features/available");
            r.StatusCode.Should().Be(HttpStatusCode.OK);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    // ~~REMOVED: Available_as_stores_admin_returns_200~~ — see §6 Finding #3 in test-plan.
    // Class-level [HasPermission(SuperAdmin)] filter blocks StoresAdmin before method-level widening.
}
```

- [ ] Run `--filter ~FeaturesAvailableTests`. **Checkpoint** — `test(webapi): features available e2e`.

---

## Task 4: Auth matrix (inline — NOT delegated to `05`)

```csharp
using System.Net;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;
using RoleType = Domain.Common.Enums.RoleType;

namespace SMCA.WebApi.E2ETests.Features;

[Collection("e2e")]
public sealed class FeaturesListAuthTests
{
    private readonly AppTestFactory _f;
    public FeaturesListAuthTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task List_no_token_returns_401()
    {
        var r = await _f.CreateClient().GetAsync("/api/v1/Features/all/true");
        r.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Theory]
    [InlineData((int)RoleType.OwnerAdmin)]
    [InlineData((int)RoleType.StoreUser)]
    [InlineData((int)RoleType.ReSeller)]
    public async Task List_as_non_super_admin_returns_403(int roleId)
    {
        var actor = await DbTestHelpers.SeedUserWithRoleAsync(_f, roleId);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, actor.UserId, actor.Login).GetAsync("/api/v1/Features/all/true");
            r.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, actor.UserId); }
    }
}

[Collection("e2e")]
public sealed class FeaturesActivateAuthTests
{
    private readonly AppTestFactory _f;
    public FeaturesActivateAuthTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Activate_no_token_returns_401()
    {
        var r = await _f.CreateClient().PostAsync("/api/v1/Features/activate", null);
        r.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Theory]
    [InlineData((int)RoleType.OwnerAdmin)]
    [InlineData((int)RoleType.StoreUser)]
    [InlineData((int)RoleType.ReSeller)]
    public async Task Activate_as_non_super_admin_returns_403(int roleId)
    {
        var actor = await DbTestHelpers.SeedUserWithRoleAsync(_f, roleId);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, actor.UserId, actor.Login).PostAsync("/api/v1/Features/activate", null);
            r.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, actor.UserId); }
    }
}

[Collection("e2e")]
public sealed class FeaturesAvailableAuthTests
{
    private readonly AppTestFactory _f;
    public FeaturesAvailableAuthTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Available_no_token_returns_401()
    {
        var r = await _f.CreateClient().GetAsync("/api/v1/Features/available");
        r.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    // StoreUser / ReSeller / OwnerAdmin-without-Stores all fail the SuperAdmin|StoresAdmin filter.
    [Theory]
    [InlineData((int)RoleType.StoreUser)]
    [InlineData((int)RoleType.ReSeller)]
    [InlineData((int)RoleType.OwnerAdmin)]
    public async Task Available_as_non_qualifying_actor_returns_403(int roleId)
    {
        var actor = await DbTestHelpers.SeedUserWithRoleAsync(_f, roleId);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, actor.UserId, actor.Login).GetAsync("/api/v1/Features/available");
            r.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, actor.UserId); }
    }
}
```

- [ ] Run `--filter ~FeaturesListAuthTests|~FeaturesActivateAuthTests|~FeaturesAvailableAuthTests`.
  **Checkpoint** — `test(webapi): features auth matrix e2e`.

> Note: a bare `OwnerAdmin` from `SeedUserWithRoleAsync` has no Stores feature/Management module, so it
> fails the class-level `[HasPermission(SuperAdmin)]` filter (403). The `Available_as_stores_admin` case
> was **REMOVED** — the class-level filter blocks ALL non-SuperAdmin users, so no OwnerAdmin-based 200
> scenario is possible for Features endpoints.

---

## Task 5: `FeaturesListGapTests` (09c — 4 tests)

```csharp
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;
using ModuleType = Domain.Common.Enums.ModuleType;

namespace SMCA.WebApi.E2ETests.Features;

[Collection("e2e")]
public sealed class FeaturesListGapTests
{
    private readonly AppTestFactory _f;
    public FeaturesListGapTests(WebAppFixture fixture) => _f = fixture.Factory;

    // Non-bool route segment fails bool model-binding. Pin whichever status the pipeline returns.
    [Fact]
    public async Task List_includeInactive_nonbool_route_returns_400_or_404()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).GetAsync("/api/v1/Features/all/not-a-bool");
            r.StatusCode.Should().BeOneOf(HttpStatusCode.BadRequest, HttpStatusCode.NotFound);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    // DTO shape: every item has a Name and a resolved ModuleId (Include(Module) + mapping).
    // DisplayName is NOT on the Feature entity, so it is not asserted.
    [Fact]
    public async Task List_returned_items_have_module_and_dto_shape()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).GetAsync("/api/v1/Features/all/true");
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<List<FeatureDtoShape>>>(ApiResponse.Json);
            b!.Data.Should().NotBeEmpty();
            b.Data.Should().OnlyContain(x => !string.IsNullOrWhiteSpace(x.Name) && x.ModuleId > 0);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    // PIN: `all` has NO OrderBy (unlike `available`). Assert membership only, never sequence.
    [Fact]
    public async Task List_result_is_not_guaranteed_ordered()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var a = await FeatureSeed.InsertFeatureUnderModuleAsync(_f, (int)ModuleType.Inventory, true, 9093);
        var b = await FeatureSeed.InsertFeatureUnderModuleAsync(_f, (int)ModuleType.Inventory, true, 9094);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).GetAsync("/api/v1/Features/all/true");
            var body = await r.Content.ReadFromJsonAsync<ApiResponse<List<FeatureDtoShape>>>(ApiResponse.Json);
            body!.Data.Select(x => x.Id).Should().Contain(new[] { 9093, 9094 }); // present regardless of order
        }
        finally
        {
            await FeatureSeed.DeleteFeatureAsync(_f, a);
            await FeatureSeed.DeleteFeatureAsync(_f, b);
            await DbTestHelpers.CleanupUserAsync(_f, admin);
        }
    }

    // Malformed bearer is rejected by the auth middleware before the class filter.
    [Fact]
    public async Task List_malformed_token_returns_401()
    {
        var client = _f.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", "not-a-real-jwt");
        var r = await client.GetAsync("/api/v1/Features/all/true");
        r.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }
}
```

- [ ] Run `--filter ~FeaturesListGapTests`. **Checkpoint** — `test(webapi): features list gap e2e (09c)`.

---

## Task 6: `FeaturesActivateGapTests` (09c — 5 tests, snapshot+restore)

```csharp
using System.Net;
using System.Net.Http.Json;
using System.Text;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Domain.Entities.Features;
using Infrastructure.Persistence.Contexts;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;
using FeatureType = Domain.Common.Enums.FeatureType;
using ModuleType = Domain.Common.Enums.ModuleType;

namespace SMCA.WebApi.E2ETests.Features;

[Collection("e2e")]
public sealed class FeaturesActivateGapTests
{
    private readonly AppTestFactory _f;
    public FeaturesActivateGapTests(WebAppFixture fixture) => _f = fixture.Factory;

    // Create branch: Egress(33) absent -> activate creates it (Inventory=3, order 71, both flags true).
    [Fact]
    public async Task Activate_creates_Egress_when_missing()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var snap = await FeatureSeed.SnapshotAsync(_f);
        await FeatureSeed.DeleteEgressAsync(_f); // force the create branch
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).PostAsync("/api/v1/Features/activate", null);
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var egress = await db.Set<Feature>().FindAsync((int)FeatureType.Egress);
            egress.Should().NotBeNull();
            egress!.ModuleId.Should().Be((int)ModuleType.Inventory);
            egress.Order.Should().Be(71);
            egress.IsActive.Should().BeTrue();
            egress.AvailableToStore.Should().BeTrue();
        }
        // snap.EgressExisted was false (we deleted it) -> RestoreAsync removes the created row.
        finally { await FeatureSeed.RestoreAsync(_f, snap); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    // Existing branch: after two activates, Egress(33) is a single PK row, not duplicated.
    [Fact]
    public async Task Activate_does_not_duplicate_Egress_when_present()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var snap = await FeatureSeed.SnapshotAsync(_f);
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, admin, login);
            await client.PostAsync("/api/v1/Features/activate", null); // ensures Egress exists
            await client.PostAsync("/api/v1/Features/activate", null); // 2nd call must not re-insert
            (await FeatureSeed.EgressCountAsync(_f)).Should().Be(1);
        }
        finally { await FeatureSeed.RestoreAsync(_f, snap); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    // Null-guard tolerance: with an optional target (TodayReports=50) absent, activate still 200 (no throw).
    // Capture the row, delete it, run, then recreate it in finally. If a StoreRoleFeature FK references it,
    // remove those child rows before the delete (confirm at implementation).
    [Fact]
    public async Task Activate_tolerates_missing_optional_seed_row()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var snap = await FeatureSeed.SnapshotAsync(_f);

        int moduleId = 0, order = 0; bool availableToStore = false, existed;
        string name = "TodayReports", description = "";
        using (var scope = _f.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var tr = await db.Set<Feature>().FindAsync((int)FeatureType.TodayReports);
            existed = tr is not null;
            if (tr is not null)
            {
                moduleId = tr.ModuleId; order = tr.Order; availableToStore = tr.AvailableToStore;
                name = tr.Name; description = tr.Description;
                db.Set<Feature>().Remove(tr);
                await db.SaveChangesAsync();
            }
        }
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).PostAsync("/api/v1/Features/activate", null);
            r.StatusCode.Should().Be(HttpStatusCode.OK); // null-guard skips the missing row, no throw
        }
        finally
        {
            if (existed)
            {
                using var scope = _f.Services.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                if (await db.Set<Feature>().FindAsync((int)FeatureType.TodayReports) is null)
                {
                    db.Set<Feature>().Add(Feature.Create((int)FeatureType.TodayReports,
                        name, description, moduleId, order, availableToStore, true));
                    await db.SaveChangesAsync();
                }
            }
            await FeatureSeed.RestoreAsync(_f, snap);
            await DbTestHelpers.CleanupUserAsync(_f, admin);
        }
    }

    // Verb mismatch: GET on the POST-only activate route.
    [Fact]
    public async Task Activate_with_GET_verb_returns_405()
    {
        var r = await _f.CreateClient().GetAsync("/api/v1/Features/activate");
        r.StatusCode.Should().Be(HttpStatusCode.MethodNotAllowed);
    }

    // Command is a parameterless record: an unexpected body is ignored, call still 200.
    [Fact]
    public async Task Activate_ignores_unexpected_request_body()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var snap = await FeatureSeed.SnapshotAsync(_f);
        try
        {
            var body = new StringContent("{\"junk\":true}", Encoding.UTF8, "application/json");
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).PostAsync("/api/v1/Features/activate", body);
            r.StatusCode.Should().Be(HttpStatusCode.OK);
        }
        finally { await FeatureSeed.RestoreAsync(_f, snap); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }
}
```

- [ ] Run `--filter ~FeaturesActivateGapTests`. **Checkpoint** — `test(webapi): features activate gap e2e (09c)`.

---

## Task 7: `FeaturesAvailableGapTests` (09c — 5 tests; 2 removed for class-level filter)

```csharp
using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;
using ModuleType = Domain.Common.Enums.ModuleType;

namespace SMCA.WebApi.E2ETests.Features;

[Collection("e2e")]
public sealed class FeaturesAvailableGapTests
{
    private readonly AppTestFactory _f;
    public FeaturesAvailableGapTests(WebAppFixture fixture) => _f = fixture.Factory;

    // Helper: call `available` as a fresh SuperAdmin and return the DTO list (cleans up its own actor).
    private async Task<List<FeatureDtoShape>> AvailableAsSuperAdminAsync()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).GetAsync("/api/v1/Features/available");
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<List<FeatureDtoShape>>>(ApiResponse.Json);
            return b!.Data!;
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    // Predicate: ModuleId != Administration. An active feature under Administration(1) is excluded.
    [Fact]
    public async Task Available_excludes_Administration_module_features()
    {
        var id = await FeatureSeed.InsertFeatureUnderModuleAsync(_f, (int)ModuleType.Administration, true, 9095);
        try { (await AvailableAsSuperAdminAsync()).Select(x => x.Id).Should().NotContain(9095); }
        finally { await FeatureSeed.DeleteFeatureAsync(_f, id); }
    }

    // Predicate: Module.IsActive. An active feature under an INACTIVE module is excluded.
    [Fact]
    public async Task Available_excludes_features_whose_module_is_inactive()
    {
        var (moduleId, featureId) = await FeatureSeed.InsertInactiveModuleWithActiveFeatureAsync(_f);
        try { (await AvailableAsSuperAdminAsync()).Select(x => x.Id).Should().NotContain(featureId); }
        finally { await FeatureSeed.DeleteFeatureAsync(_f, featureId); await FeatureSeed.DeleteModuleAsync(_f, moduleId); }
    }

    // Predicate: Feature.IsActive. An inactive feature under an active module is excluded.
    [Fact]
    public async Task Available_excludes_inactive_features()
    {
        var id = await FeatureSeed.InsertFeatureUnderModuleAsync(_f, (int)ModuleType.Inventory, false, 9096);
        try { (await AvailableAsSuperAdminAsync()).Select(x => x.Id).Should().NotContain(9096); }
        finally { await FeatureSeed.DeleteFeatureAsync(_f, id); }
    }

    // Sort: available applies OrderBy(f.Order) ascending.
    [Fact]
    public async Task Available_is_ordered_by_Order_ascending()
    {
        (await AvailableAsSuperAdminAsync()).Select(x => x.Order).Should().BeInAscendingOrder();
    }

    // DTO shape + module resolution.
    [Fact]
    public async Task Available_items_have_dto_shape_and_module()
    {
        (await AvailableAsSuperAdminAsync()).Should().OnlyContain(x => !string.IsNullOrWhiteSpace(x.Name) && x.ModuleId > 0);
    }

    // Verb mismatch: POST on the GET-only available route.
    [Fact]
    public async Task Available_with_POST_verb_returns_405()
    {
        var r = await _f.CreateClient().PostAsync("/api/v1/Features/available", null);
        r.StatusCode.Should().Be(HttpStatusCode.MethodNotAllowed);
    }

    // ~~REMOVED: Available_as_owner_admin_with_inactive_management_module_returns_403~~ — see Finding #3.
    // No non-SuperAdmin can reach this endpoint. Redundant with Available_as_owner_admin_without_stores.
}
```

- [ ] Run `--filter ~FeaturesAvailableGapTests`. **Checkpoint** — `test(webapi): features available gap e2e (09c)`.

---

## Confirm at implementation (from `09` test-plan §5–§7)

- Exact `Feature.Create(...)` signature and `Module`/`Feature` property names (`IsActive`, `Price`) —
  cross-check `ActivateFeaturesCommand.cs:47-88` before compiling `FeatureSeed`.
- `StoreSeed.SeedStoresAdminUserAsync` return shape (`UserId`/`Login`) + its `Cleanup*` name — reuse
  `05`'s; if absent, duplicate the `04` StoresAdmin seeding here.
- `SeedUserWithRoleAsync` fixture shape (`UserId`/`Login`) — see `04` `UserFixture`.
- **Do NOT** implement tests for the two unreachable handler gates (`09` §6); the deferred approach is in
  `09` §7 — a separate task.
- **09c helpers/asserts** — confirm before compiling Tasks 5–7:
  - `Feature` props read by the gap tests: `Order`, `ModuleId`, `AvailableToStore`, `IsActive`, `Name`,
    `Description` (verified against `Feature.cs`).
  - `Module.Create(int id, string name, int order, bool priceIncluded, float price, bool availableToStore,
    bool isActive)` — the 7-arg overload used by `InsertInactiveModuleWithActiveFeatureAsync`.
  - `Activate_tolerates_missing_optional_seed_row`: if a `StoreRoleFeature` FK references TodayReports(50),
    delete those child rows before removing the feature and recreate them in `finally` (or pick a target
    feature with no child FKs).
  - Verb-mismatch tests assume the pipeline returns **405** (not 404) for a matched route + wrong method;
    if routing returns 404 in this app, update the two `MethodNotAllowed` asserts.
  - ~~`Available_..._inactive_management_module`~~ **REMOVED** — class-level filter blocks all non-SuperAdmin.
- **As-built findings:**
  - `Activate_twice` corrected: both calls return `true` (not `false` on 2nd). `UpdateAsync` always marks Modified.
  - `SetManagementModuleActiveAsync` is no longer used (the inactive-management test was removed). The helper
    exists in `FeatureSeed` but is unused — keep as dead code in the seed helper for future use.
