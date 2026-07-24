# 10 — SMCA.WebApi Usages E2E — Implementation Plan (self-contained)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development / executing-plans.
> Steps use `- [ ]`. Materializes the `10` test-plan: the 3 `UsagesController` endpoints, hybrid depth
> (POST full + the 2 GETs at contract level), including the dedup idempotency pin and the malformed-date
> 500 pin.

**Goal:** Implement, against real Postgres via `dotnet test`, the Usages endpoint behavior — the
`store-daily-usage` dedup/insert + its `ProfileAdmin`/`SuperAdmin` auth, and the
`stores-last-week`/`stores-last-month` SuperAdmin-only count contract.

**Reuses (do NOT redefine):** the on-disk harness — `DbTestHelpers.{SeedSuperAdminAsync,
SeedUserWithRoleAsync, AuthedClient, CleanupUserAsync}`, `AuthTestHelpers.BearerClient`,
`AuthzSeed.{SeedStoreUserAsync, CleanupStoreGraphAsync}`, `StoreSeed.{SeedStoreAsync,
CleanupStoreFixtureAsync}`, `ApiResponse<T>` + `ApiResponse.Json`. No new helper class.

**Actor strategy:** default = SuperAdmin (bypasses the class filter; the only actor that reaches the GET
handlers and the POST store-check). `ProfileAdmin` actor = `AuthzSeed.SeedStoreUserAsync(_f, 70)` (StoreUser
+ Profile feature + active Management module + `SelectedStoreId` pre-set). No-grant actor =
`SeedStoreUserAsync(_f, null)`. GET-403 role actors = `SeedUserWithRoleAsync((int)RoleType.{...})`.

## Global Constraints (verified — `10` test-plan §2)

- **Failures are thrown → real HTTP status** (`ErrorHandlerMiddleware`): `ApiException` → its `StatusCode`
  (400); any other unhandled exception → **500** (`App.Unexpected`). No token → **401**; authenticated but
  filter-rejected → **403**.
- `POST store-daily-usage` filter = class `[HasPermission(ProfileAdmin)]`; SuperAdmin bypasses.
  `ProfileAdmin = HasRoles(OwnerAdmin, StoreUser, ReSeller) + HasFeature(Profile=70) + HasModule(Management=7)`.
- POST body = `{ ActiveDays: [ { Day: string, Saved: bool } ] }`. Returns `ResponseResult<bool>` where
  `Data = SaveChangesAsync() > 0` — `true` only when ≥1 new row inserted; `false` on all-duplicate / empty.
  Days are deduped per `(userId, storeId)`.
- `GET stores-last-week` (`LastDays=7`) / `stores-last-month` (`LastDays=30`) filter = method
  `[HasPermission(SuperAdmin)]`. Returns `StoreUsagesDto { StoreUsagesCountDays: int[], ActiveStoreCount:
  int }`, `StoreUsagesCountDays` **left-padded to `LastDays`**.
- `StoreUsage.Create(Guid storeId, Guid userId, DateTime day, string ip, string device, string deviceId,
  string sessionId)` — direct-insert entity for seeding. **Always `RemoveRange` StoreUsage by `StoreId`
  before deleting the store** (FK), inside `finally`.
- Setting the selected store: `PUT /api/v1/stores { StoreId }` (persists `User.SelectedStoreId`;
  `ClaimsTransformerService` reads it on the next request).
- Human runs ALL git. Every Checkpoint is a PAUSE.

## File Structure

New folder `SMCA.WebApi.E2ETests/Usages/`:
- Create: `Usages/StoreDailyUsageTests.cs`, `Usages/StoreDailyUsageAuthTests.cs`,
  `Usages/StoreLastUsagesTests.cs`, `Usages/StoreLastUsagesAuthTests.cs`.
- Delete: `Auth/UsagesSmokeTests.cs` (its 2 tests are absorbed by Tasks 1–2).

---

## Task 1: `StoreDailyUsageTests` (POST behavior — full)

**Files:**
- Create: `backend/src/SMCA.WebApi.E2ETests/Usages/StoreDailyUsageTests.cs`

**Interfaces:**
- Consumes: `DbTestHelpers.{SeedSuperAdminAsync, AuthedClient, CleanupUserAsync}`,
  `AuthzSeed.{SeedStoreUserAsync, CleanupStoreGraphAsync}`, `StoreSeed.{SeedStoreAsync,
  CleanupStoreFixtureAsync}`, `StoreUsage.Create`, `ApiResponse<bool>`.
- Produces: nothing (leaf test class).

- [ ] **Step 1: Write the test class**

```csharp
using System.Net;
using System.Net.Http.Json;
using Domain.Entities.StoreUsages;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Usages;

[Collection("e2e")]
public sealed class StoreDailyUsageTests
{
    private readonly AppTestFactory _f;
    public StoreDailyUsageTests(WebAppFixture fixture) => _f = fixture.Factory;

    private static object Body(params string[] days) =>
        new { ActiveDays = days.Select(d => new { Day = d, Saved = true }).ToArray() };

    private async Task<int> CountUsagesAsync(Guid storeId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await db.Set<StoreUsage>().IgnoreQueryFilters().CountAsync(u => u.StoreId == storeId);
    }

    private async Task InsertUsageAsync(Guid storeId, Guid userId, string day)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var utcDay = DateTime.SpecifyKind(DateTime.Parse(day), DateTimeKind.Utc);
        db.Set<StoreUsage>().Add(StoreUsage.Create(storeId, userId, utcDay, "", "", "", ""));
        await db.SaveChangesAsync();
    }

    private async Task CleanupUsagesAsync(Guid storeId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        db.Set<StoreUsage>().RemoveRange(
            await db.Set<StoreUsage>().IgnoreQueryFilters().Where(u => u.StoreId == storeId).ToListAsync());
        await db.SaveChangesAsync();
    }

    // Seeds a SuperAdmin + approved store and selects it (PUT /stores) so httpContext.StoreId resolves.
    private async Task<(Guid AdminId, HttpClient Client, StoreSeed.StoreFixture Store)> SeedAdminWithSelectedStoreAsync()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var store = await StoreSeed.SeedStoreAsync(_f, $"Usg-{Guid.NewGuid():N}", approved: true);
        var client = DbTestHelpers.AuthedClient(_f, adminId, login);
        var setStore = await client.PutAsJsonAsync("/api/v1/stores", new { StoreId = store.StoreId });
        setStore.StatusCode.Should().Be(HttpStatusCode.OK);
        return (adminId, client, store);
    }

    [Fact] // migrated + extended from UsagesSmokeTests.Usages_super_admin_with_store_returns_200
    public async Task Post_new_day_as_super_admin_returns_200_true_and_inserts_row()
    {
        var (adminId, client, store) = await SeedAdminWithSelectedStoreAsync();
        try
        {
            var r = await client.PostAsJsonAsync("/api/v1/usages/store-daily-usage", Body("2026-07-20"));
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json);
            b!.Succeeded.Should().BeTrue();
            b.Data.Should().BeTrue();
            (await CountUsagesAsync(store.StoreId)).Should().Be(1);
        }
        finally
        {
            await CleanupUsagesAsync(store.StoreId);
            await StoreSeed.CleanupStoreFixtureAsync(_f, store);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    [Fact] // PIN: dedup — second POST of the same day inserts nothing and returns Data==false
    public async Task Post_duplicate_day_returns_200_false_no_insert()
    {
        var (adminId, client, store) = await SeedAdminWithSelectedStoreAsync();
        try
        {
            var first = await client.PostAsJsonAsync("/api/v1/usages/store-daily-usage", Body("2026-07-20"));
            (await first.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json))!.Data.Should().BeTrue();

            var second = await client.PostAsJsonAsync("/api/v1/usages/store-daily-usage", Body("2026-07-20"));
            second.StatusCode.Should().Be(HttpStatusCode.OK);
            (await second.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json))!.Data.Should().BeFalse();

            (await CountUsagesAsync(store.StoreId)).Should().Be(1);
        }
        finally
        {
            await CleanupUsagesAsync(store.StoreId);
            await StoreSeed.CleanupStoreFixtureAsync(_f, store);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    [Fact] // PIN: empty ActiveDays -> nothing to insert -> Data==false
    public async Task Post_empty_activeDays_returns_200_false()
    {
        var (adminId, client, store) = await SeedAdminWithSelectedStoreAsync();
        try
        {
            var r = await client.PostAsJsonAsync("/api/v1/usages/store-daily-usage", new { ActiveDays = Array.Empty<object>() });
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            (await r.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json))!.Data.Should().BeFalse();
            (await CountUsagesAsync(store.StoreId)).Should().Be(0);
        }
        finally
        {
            await CleanupUsagesAsync(store.StoreId);
            await StoreSeed.CleanupStoreFixtureAsync(_f, store);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    [Fact] // dedup partial — D1 pre-exists, POST [D1, D2] inserts only D2 (total 2, D1 not duplicated)
    public async Task Post_mixed_new_and_existing_days_inserts_only_new()
    {
        var (adminId, client, store) = await SeedAdminWithSelectedStoreAsync();
        try
        {
            await InsertUsageAsync(store.StoreId, adminId, "2026-07-20");
            var r = await client.PostAsJsonAsync("/api/v1/usages/store-daily-usage", Body("2026-07-20", "2026-07-21"));
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            (await r.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json))!.Data.Should().BeTrue();
            (await CountUsagesAsync(store.StoreId)).Should().Be(2);
        }
        finally
        {
            await CleanupUsagesAsync(store.StoreId);
            await StoreSeed.CleanupStoreFixtureAsync(_f, store);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    // ProfileAdmin actor = StoreUser + Profile(70) feature + active Management module + SelectedStoreId
    // (set by the seeder). Passes the class filter via the else-branch feature check; handler inserts -> true.
    [Fact]
    public async Task Post_as_profile_admin_actor_returns_200()
    {
        var actor = await AuthzSeed.SeedStoreUserAsync(_f, grantedFeatureId: 70);
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, actor.UserId, actor.Login);
            var r = await client.PostAsJsonAsync("/api/v1/usages/store-daily-usage", Body("2026-07-20"));
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            (await r.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json))!.Data.Should().BeTrue();
        }
        finally
        {
            await CleanupUsagesAsync(actor.StoreId);
            await AuthzSeed.CleanupStoreGraphAsync(_f, actor.StoreId, actor.UserId, actor.OwnerUserId);
        }
    }

    // Reachable ONLY because SuperAdmin bypasses the filter and reaches the handler's store check.
    // No store selected -> httpContext.StoreId == Guid.Empty -> GetByIdAsync(empty) null -> 400.
    [Fact]
    public async Task Post_without_selected_store_returns_400()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, adminId, login);
            var r = await client.PostAsJsonAsync("/api/v1/usages/store-daily-usage", Body("2026-07-20"));
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    // PIN: unguarded DateTime.Parse throws FormatException -> ErrorHandlerMiddleware default -> 500.
    // Documents the missing date validation (should arguably be 400). Update if a validator is added.
    [Fact]
    public async Task Post_malformed_date_returns_500()
    {
        var (adminId, client, store) = await SeedAdminWithSelectedStoreAsync();
        try
        {
            var r = await client.PostAsJsonAsync("/api/v1/usages/store-daily-usage",
                new { ActiveDays = new[] { new { Day = "not-a-date", Saved = true } } });
            r.StatusCode.Should().Be(HttpStatusCode.InternalServerError);
        }
        finally
        {
            await CleanupUsagesAsync(store.StoreId);
            await StoreSeed.CleanupStoreFixtureAsync(_f, store);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }
}
```

- [ ] **Step 2: Run** — `dotnet test backend/src/SMCA.WebApi.E2ETests --filter ~StoreDailyUsageTests`
  Expected: all 7 PASS. If `Post_malformed_date_returns_500` returns a different status, **pin the actual**
  and note it (per test-plan §3/§5).
- [ ] **Step 3: Checkpoint** (human commits) — `test(webapi): usages store-daily-usage behavior e2e`.

---

## Task 2: `StoreDailyUsageAuthTests` (POST auth)

**Files:**
- Create: `backend/src/SMCA.WebApi.E2ETests/Usages/StoreDailyUsageAuthTests.cs`

**Interfaces:**
- Consumes: `_f.CreateClient()`, `AuthTestHelpers.BearerClient`, `AuthzSeed.{SeedStoreUserAsync,
  CleanupStoreGraphAsync}`.

- [ ] **Step 1: Write the test class**

```csharp
using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Usages;

[Collection("e2e")]
public sealed class StoreDailyUsageAuthTests
{
    private readonly AppTestFactory _f;
    public StoreDailyUsageAuthTests(WebAppFixture fixture) => _f = fixture.Factory;

    private static object Body() => new { ActiveDays = new[] { new { Day = "2026-07-20", Saved = true } } };

    [Fact] // migrated from UsagesSmokeTests.Usages_without_token_returns_401
    public async Task Post_no_token_returns_401()
    {
        var r = await _f.CreateClient().PostAsJsonAsync("/api/v1/usages/store-daily-usage", Body());
        r.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    // StoreUser, active Management module, but NO Profile feature -> fails HasFeature(Profile) -> 403.
    [Fact]
    public async Task Post_as_actor_without_profile_grant_returns_403()
    {
        var actor = await AuthzSeed.SeedStoreUserAsync(_f, grantedFeatureId: null);
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, actor.UserId, actor.Login);
            var r = await client.PostAsJsonAsync("/api/v1/usages/store-daily-usage", Body());
            r.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        finally { await AuthzSeed.CleanupStoreGraphAsync(_f, actor.StoreId, actor.UserId, actor.OwnerUserId); }
    }

    // A garbage bearer is rejected by the auth middleware before the class filter runs.
    [Fact]
    public async Task Post_malformed_token_returns_401()
    {
        var client = AuthTestHelpers.BearerClient(_f, "not.a.valid.jwt");
        var r = await client.PostAsJsonAsync("/api/v1/usages/store-daily-usage", Body());
        r.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }
}
```

- [ ] **Step 2: Run** — `--filter ~StoreDailyUsageAuthTests`. Expected: 3 PASS.
- [ ] **Step 3: Checkpoint** — `test(webapi): usages store-daily-usage auth e2e`.

---

## Task 3: `StoreLastUsagesTests` (GET behavior — contract)

**Files:**
- Create: `backend/src/SMCA.WebApi.E2ETests/Usages/StoreLastUsagesTests.cs`

**Interfaces:**
- Consumes: `DbTestHelpers.{SeedSuperAdminAsync, AuthedClient, CleanupUserAsync}`, `StoreSeed.{SeedStoreAsync,
  CleanupStoreFixtureAsync}`, `StoreUsage.Create`, `ApiResponse<StoreUsagesDto>`.
- Produces: a local `StoreUsagesDto` DTO mirror (the app DTO is not referenced from the test project).

- [ ] **Step 1: Write the test class**

```csharp
using System.Net;
using System.Net.Http.Json;
using Domain.Entities.StoreUsages;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Usages;

[Collection("e2e")]
public sealed class StoreLastUsagesTests
{
    private readonly AppTestFactory _f;
    public StoreLastUsagesTests(WebAppFixture fixture) => _f = fixture.Factory;

    // Local mirror of Application.Dtos.Management.Usages.StoreUsagesDto (test project does not reference it).
    private sealed class UsagesDto
    {
        public List<int> StoreUsagesCountDays { get; set; } = new();
        public int ActiveStoreCount { get; set; }
    }

    private async Task InsertUsageAsync(Guid storeId, Guid userId, DateTime day)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        db.Set<StoreUsage>().Add(StoreUsage.Create(storeId, userId, DateTime.SpecifyKind(day, DateTimeKind.Utc), "", "", "", ""));
        await db.SaveChangesAsync();
    }

    private async Task CleanupUsagesAsync(Guid storeId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        db.Set<StoreUsage>().RemoveRange(
            await db.Set<StoreUsage>().IgnoreQueryFilters().Where(u => u.StoreId == storeId).ToListAsync());
        await db.SaveChangesAsync();
    }

    [Fact] // PIN: count array is left-padded to the window length (7).
    public async Task LastWeek_as_super_admin_returns_200_array_length_7()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, adminId, login).GetAsync("/api/v1/usages/stores-last-week");
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<UsagesDto>>(ApiResponse.Json);
            b!.Succeeded.Should().BeTrue();
            b.Data!.StoreUsagesCountDays.Should().HaveCount(7);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    [Fact] // PIN: count array is left-padded to the window length (30).
    public async Task LastMonth_as_super_admin_returns_200_array_length_30()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, adminId, login).GetAsync("/api/v1/usages/stores-last-month");
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<UsagesDto>>(ApiResponse.Json);
            b!.Data!.StoreUsagesCountDays.Should().HaveCount(30);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    // Seed usage on 3 distinct days inside the 7-day window; the summed counts must reflect them and
    // ActiveStoreCount must be >= the store we seeded active. Contract-level (one data test).
    [Fact]
    public async Task LastWeek_counts_reflect_seeded_usage_days()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var store = await StoreSeed.SeedStoreAsync(_f, $"Usg-{Guid.NewGuid():N}", approved: true);
        try
        {
            var today = DateTime.UtcNow.Date;
            await InsertUsageAsync(store.StoreId, store.OwnerUserId, today.AddDays(-1));
            await InsertUsageAsync(store.StoreId, store.OwnerUserId, today.AddDays(-2));
            await InsertUsageAsync(store.StoreId, store.OwnerUserId, today.AddDays(-3));

            var r = await DbTestHelpers.AuthedClient(_f, adminId, login).GetAsync("/api/v1/usages/stores-last-week");
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<UsagesDto>>(ApiResponse.Json);
            b!.Data!.StoreUsagesCountDays.Should().HaveCount(7);
            b.Data.StoreUsagesCountDays.Sum().Should().BeGreaterThanOrEqualTo(3);
            b.Data.ActiveStoreCount.Should().BeGreaterThanOrEqualTo(1);
        }
        finally
        {
            await CleanupUsagesAsync(store.StoreId);
            await StoreSeed.CleanupStoreFixtureAsync(_f, store);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }
}
```

- [ ] **Step 2: Run** — `--filter ~StoreLastUsagesTests`. Expected: 3 PASS.
  Note: `LastWeek_counts_reflect_seeded_usage_days` uses `Sum() >= 3` (not equality) because other tests /
  seed data may add usage rows in the shared `smca_test` DB within the window.
- [ ] **Step 3: Checkpoint** — `test(webapi): usages stores-last-week/month behavior e2e`.

---

## Task 4: `StoreLastUsagesAuthTests` (GET auth)

**Files:**
- Create: `backend/src/SMCA.WebApi.E2ETests/Usages/StoreLastUsagesAuthTests.cs`

**Interfaces:**
- Consumes: `_f.CreateClient()`, `AuthTestHelpers.BearerClient`, `DbTestHelpers.{SeedUserWithRoleAsync,
  AuthedClient, CleanupUserAsync}`, `Domain.Common.Enums.RoleType`.

- [ ] **Step 1: Write the test class**

```csharp
using System.Net;
using FluentAssertions;
using Domain.Common.Enums;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Usages;

[Collection("e2e")]
public sealed class StoreLastUsagesAuthTests
{
    private readonly AppTestFactory _f;
    public StoreLastUsagesAuthTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task LastWeek_no_token_returns_401()
    {
        var r = await _f.CreateClient().GetAsync("/api/v1/usages/stores-last-week");
        r.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task LastMonth_no_token_returns_401()
    {
        var r = await _f.CreateClient().GetAsync("/api/v1/usages/stores-last-month");
        r.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task LastWeek_malformed_token_returns_401()
    {
        var r = await AuthTestHelpers.BearerClient(_f, "not.a.valid.jwt").GetAsync("/api/v1/usages/stores-last-week");
        r.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    private async Task AssertRoleForbidden(int roleId)
    {
        var actor = await DbTestHelpers.SeedUserWithRoleAsync(_f, roleId);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, actor.UserId, actor.Login).GetAsync("/api/v1/usages/stores-last-week");
            r.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, actor.UserId); }
    }

    [Fact] public Task LastWeek_as_owner_admin_returns_403() => AssertRoleForbidden((int)RoleType.OwnerAdmin);
    [Fact] public Task LastWeek_as_store_user_returns_403() => AssertRoleForbidden((int)RoleType.StoreUser);
    [Fact] public Task LastWeek_as_reseller_returns_403() => AssertRoleForbidden((int)RoleType.ReSeller);
}
```

- [ ] **Step 2: Run** — `--filter ~StoreLastUsagesAuthTests`. Expected: 6 PASS.
- [ ] **Step 3: Checkpoint** — `test(webapi): usages stores-last-week/month auth e2e`.

---

## Task 5: Retire the smoke file + full-suite green

**Files:**
- Delete: `backend/src/SMCA.WebApi.E2ETests/Auth/UsagesSmokeTests.cs`

- [ ] **Step 1:** Delete `Auth/UsagesSmokeTests.cs` (its `no-token→401` is now
  `StoreDailyUsageAuthTests.Post_no_token_returns_401`; its `super-admin→200` is now
  `StoreDailyUsageTests.Post_new_day_as_super_admin_returns_200_true_and_inserts_row`).
- [ ] **Step 2: Run the whole suite** — `dotnet test backend/src/SMCA.WebApi.E2ETests` → PASS (no orphaned
  references to the deleted class).
- [ ] **Step 3: Checkpoint** — `test(webapi): retire usages smoke file, fold into Usages/ suite`.

---

## Self-Review

- **Endpoint coverage vs test-plan §4:**
  - `POST store-daily-usage`: new-day→true+row ✓, duplicate→false (PIN) ✓, empty→false (PIN) ✓, mixed
    dedup ✓, ProfileAdmin actor→200 ✓, no-selected-store→400 ✓, malformed-date→500 (PIN) ✓; auth:
    no-token→401 ✓, no-grant→403 ✓, malformed-token→401 ✓.
  - `GET stores-last-week`/`month`: length-7/30 (PIN) ✓, seeded-counts ✓; auth: 401 (both) ✓,
    owner/store-user/reseller→403 ✓, malformed-token→401 ✓.
- **Type consistency:** `StoreUsage.Create(storeId, userId, day, ip, device, deviceId, sessionId)` used
  identically in Tasks 1 & 3; `ApiResponse<bool>` / `ApiResponse<UsagesDto>` + `ApiResponse.Json` per the
  harness; `UsagesDto` is a local mirror (property names `StoreUsagesCountDays` / `ActiveStoreCount` match
  the app DTO for case-insensitive JSON binding).
- **Placeholder scan:** none — every step carries compilable code and a concrete `dotnet test --filter`.
- **Dropped by verification (test-plan §5):** `Post_with_deleted_user_returns_400` — the class filter
  `ForbidResult`s a user with no `SuperAdmin` claim before the handler's `UserNotFound` guard, so it yields
  403, not 400. Documented as an unreachable handler gate, not asserted.
- **Not asserted (by design):** the two unreachable handler gates (GET `IsSuperAdmin`, POST `UserNotFound`);
  the misnamed `ApproveStoreAsync` action; the generic role×feature×scope matrix (`05`).
- **Shared-DB safety:** every test seeds a fresh store (unique Guid) and cleans its own `StoreUsage` rows in
  `finally`; the one aggregate assertion uses `>=`, never equality.
```

