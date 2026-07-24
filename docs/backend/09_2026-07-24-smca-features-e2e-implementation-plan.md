# 09 — SMCA.WebApi Features E2E — Implementation Plan (self-contained)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development / executing-plans.
> Steps use `- [ ]`. Materializes the `09` test-plan: the 3 `FeaturesController` endpoints, exhaustively,
> including each endpoint's own 401/403 auth matrix (NOT delegated to `05`), the `activate` shared-seed
> mutation with snapshot+restore, and the `activate` non-idempotent-return pin.

**Goal:** Implement, against real Postgres via `dotnet test`, the 3 Features endpoints' behavior + auth,
leaving the shared seed exactly as found (snapshot+restore for the mutating `activate`).

**Reuses (do NOT redefine):** `04`/`05` harness — `DbTestHelpers.{SeedSuperAdminAsync,
SeedUserWithRoleAsync, AuthedClient, CleanupUserAsync}`, `StoreSeed.{SeedStoresAdminUserAsync, Cleanup*}`,
`ApiResponse<T>`/`ApiResponse.Json`, `Factory.Services.CreateScope()` → `ApplicationDbContext`. If any
helper is not on disk yet, duplicate it locally (directive: self-contained, e2e, duplication OK).

**Actor strategy:** default = SuperAdmin (only actor that passes the class filter). `available` adds a
StoresAdmin actor. All 403/401 cases use throwaway role actors.

## Global Constraints (verified — `09` test-plan §2)

- Class filter `[HasPermission(SuperAdmin)]`; `available` widens to `[HasPermission(SuperAdmin,
  StoresAdmin)]`. No token → 401; authenticated-but-rejected → 403; success → `Ok(ResponseResult<T>)`.
- `activate` **mutates shared seed** (Module 6/5, Feature 60/50, creates Feature 33) and returns
  `bool = SaveChanges>0` → **not idempotent** (2nd call → false). Leave seed as found: snapshot before,
  restore in `finally`, delete Egress only if this test created it.
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
    bool StatisticsActive, decimal StatisticsPrice, bool ReportsActive,
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

// Local DTO shape for deserialization (Id is enough for the inclusion asserts).
public sealed class FeatureDtoShape { public int Id { get; set; } public string? Name { get; set; } }
```

- [ ] Run `--filter ~FeaturesListTests`. **Checkpoint** — `test(webapi): features list e2e`.

---

## Task 2: `FeaturesActivateTests` (snapshot+restore + non-idempotent pin)

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

    // PIN: activate returns SaveChanges>0, so the 2nd call (nothing left to change) returns false.
    [Fact]
    public async Task Activate_twice_second_returns_false()
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
            second!.Data.Should().BeFalse();
        }
        finally { await FeatureSeed.RestoreAsync(_f, snap); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }
}
```

- [ ] Run `--filter ~FeaturesActivateTests`. **Checkpoint** — `test(webapi): features activate e2e (snapshot+restore, non-idempotent pin)`.

---

## Task 3: `FeaturesAvailableTests`

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

    // StoresAdmin = OwnerAdmin + Stores feature + active Management module -> passes the widened filter.
    [Fact]
    public async Task Available_as_stores_admin_returns_200()
    {
        var actor = await StoreSeed.SeedStoresAdminUserAsync(_f);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, actor.UserId, actor.Login).GetAsync("/api/v1/Features/available");
            r.StatusCode.Should().Be(HttpStatusCode.OK);
        }
        finally { await StoreSeed.CleanupStoresAdminUserAsync(_f, actor); }
    }
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
> fails the `available` `StoresAdmin` grant (403). The `Available_as_stores_admin_returns_200` case
> (Task 3) is the only OwnerAdmin-based 200 — it uses the full `SeedStoresAdminUserAsync` graph.

---

## Confirm at implementation (from `09` test-plan §5–§7)

- Exact `Feature.Create(...)` signature and `Module`/`Feature` property names (`IsActive`, `Price`) —
  cross-check `ActivateFeaturesCommand.cs:47-88` before compiling `FeatureSeed`.
- `StoreSeed.SeedStoresAdminUserAsync` return shape (`UserId`/`Login`) + its `Cleanup*` name — reuse
  `05`'s; if absent, duplicate the `04` StoresAdmin seeding here.
- `SeedUserWithRoleAsync` fixture shape (`UserId`/`Login`) — see `04` `UserFixture`.
- **Do NOT** implement tests for the two unreachable handler gates (`09` §6); the deferred approach is in
  `09` §7 — a separate task.
