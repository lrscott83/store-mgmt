# 10 — SMCA.WebApi Usages E2E — Implementation Plan (self-contained)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development / executing-plans.
> Steps use `- [ ]`. Materializes the `10` test-plan + the `10c` QA gap suite **merged in** (every `10c`
> scenario folded into its class, tagged `(from 10c)`; nothing discarded).

**Goal:** Implement, against real Postgres via `dotnet test`, the full Usages endpoint behavior — the
`store-daily-usage` dedup/insert + its `ProfileAdmin`/`SuperAdmin` auth, and the
`stores-last-week`/`stores-last-month` SuperAdmin-only count contract — plus the `10c` edge/error/integration
gaps and the bug-reveal pins.

**Reuses (do NOT redefine):** the on-disk harness — `DbTestHelpers.{SeedSuperAdminAsync,
SeedInactiveUserAsync, SeedUserWithRoleAsync, AuthedClient, CleanupUserAsync}`, `AuthTestHelpers.BearerClient`,
`AuthzSeed.{SeedStoreUserAsync, SeedOwnerAdminAsync, CleanupStoreGraphAsync}`, `StoreSeed.{SeedStoreAsync,
DeactivateStoreAsync, CleanupStoreFixtureAsync}`, `ApiResponse<T>` + `ApiResponse.Json`. No new helper class.

**Actor strategy:** default = SuperAdmin (bypasses the class filter; the only actor that reaches the GET
handlers and the POST store-check). `ProfileAdmin` actors = `AuthzSeed.SeedStoreUserAsync(_f, 70)`
(StoreUser branch) and `AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true)` (OwnerAdmin branch).
No-grant actor = `SeedStoreUserAsync(_f, null)`. GET-403 role actors = `SeedUserWithRoleAsync((int)RoleType.{...})`.

## Global Constraints (verified — `10` test-plan §2 + `10c`)

- **Failures are thrown → real HTTP status** (`ErrorHandlerMiddleware`): `ApiException` → its `StatusCode`
  (400); any other unhandled exception → **500** (`App.Unexpected`). No token → **401**; authenticated but
  filter-rejected → **403**; route matched for another verb only → **405**.
- `POST store-daily-usage` filter = class `[HasPermission(ProfileAdmin)]`; SuperAdmin bypasses.
  `ProfileAdmin = HasRoles(OwnerAdmin, StoreUser, ReSeller) + HasFeature(Profile=70) + HasModule(Management=7)`.
  OwnerAdmin passes via `AllowedFeaturesService` (Profile is a Management-module feature); StoreUser passes
  via an explicit `StoreRoleFeature(Profile)`.
- POST body = `{ ActiveDays: [ { Day: string, Saved: bool } ] }`. Returns `ResponseResult<bool>` where
  `Data = SaveChangesAsync() > 0`. **Dedup is per `(userId, storeId)` against the DB only — NOT within the
  request** (`[D1,D1]` inserts two rows). The `Saved` flag is **never read**. `Day` is parsed with unguarded
  `DateTime.Parse` (empty/malformed/`null ActiveDays` → **500**). No `IsActive` filter on the store lookup →
  usage against an **inactive** store is accepted (200).
- `GET stores-last-week` (`LastDays=7`) / `stores-last-month` (`LastDays=30`) filter = method
  `[HasPermission(SuperAdmin)]`. Returns `StoreUsagesDto { StoreUsagesCountDays: int[], ActiveStoreCount:
  int }`, `StoreUsagesCountDays` **left-padded to `LastDays`**. The repo filters
  `usage.Day >= (UtcNow.Date - LastDays) && usage.Store.IsActive`, then `GroupBy(StoreId, Day).First()` →
  each day's count = number of **distinct active stores** with usage that day; boundary day (`today-N`) is
  **included** (`>=`); inactive-store usage is **excluded**. `ActiveStoreCount = count of IsActive stores`.
- `StoreUsage.Create(Guid storeId, Guid userId, DateTime day, string ip, string device, string deviceId,
  string sessionId)` — direct-insert entity for seeding. **Always `RemoveRange` StoreUsage by `StoreId`
  before deleting the store** (FK), inside `finally`.
- Setting the selected store: `PUT /api/v1/stores { StoreId }` (persists `User.SelectedStoreId`).
- **All Usages test classes share `[Collection("e2e")]` → they run SERIALLY.** The delta-based aggregate
  assertions (B3/B4/B5) rely on this (no concurrent mutation of the shared count).
- Human runs ALL git. Every Checkpoint is a PAUSE.

## File Structure

Folder `SMCA.WebApi.E2ETests/Usages/`:
- Create: `Usages/StoreDailyUsageTests.cs`, `Usages/StoreDailyUsageAuthTests.cs`,
  `Usages/StoreLastUsagesTests.cs`, `Usages/StoreLastUsagesAuthTests.cs`.
- Delete: `Auth/UsagesSmokeTests.cs` (its 2 tests are absorbed by Tasks 1–2).

---

## Task 1: `StoreDailyUsageTests` (POST behavior — full + 10c gaps)

**Files:**
- Create: `backend/src/SMCA.WebApi.E2ETests/Usages/StoreDailyUsageTests.cs`

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
        (await client.PutAsJsonAsync("/api/v1/stores", new { StoreId = store.StoreId })).StatusCode.Should().Be(HttpStatusCode.OK);
        return (adminId, client, store);
    }

    // A second SuperAdmin that selects an already-seeded store (for the multi-user dedup test).
    private async Task<(Guid Id, HttpClient Client)> SeedAdminSelectingStoreAsync(Guid storeId)
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var id = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var client = DbTestHelpers.AuthedClient(_f, id, login);
        (await client.PutAsJsonAsync("/api/v1/stores", new { StoreId = storeId })).StatusCode.Should().Be(HttpStatusCode.OK);
        return (id, client);
    }

    // ----- plan happy/edge/error -----

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
        finally { await CleanupUsagesAsync(store.StoreId); await StoreSeed.CleanupStoreFixtureAsync(_f, store); await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    [Fact] // PIN: dedup — second POST of the same day inserts nothing and returns Data==false
    public async Task Post_duplicate_day_returns_200_false_no_insert()
    {
        var (adminId, client, store) = await SeedAdminWithSelectedStoreAsync();
        try
        {
            (await (await client.PostAsJsonAsync("/api/v1/usages/store-daily-usage", Body("2026-07-20")))
                .Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json))!.Data.Should().BeTrue();
            var second = await client.PostAsJsonAsync("/api/v1/usages/store-daily-usage", Body("2026-07-20"));
            second.StatusCode.Should().Be(HttpStatusCode.OK);
            (await second.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json))!.Data.Should().BeFalse();
            (await CountUsagesAsync(store.StoreId)).Should().Be(1);
        }
        finally { await CleanupUsagesAsync(store.StoreId); await StoreSeed.CleanupStoreFixtureAsync(_f, store); await DbTestHelpers.CleanupUserAsync(_f, adminId); }
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
        finally { await CleanupUsagesAsync(store.StoreId); await StoreSeed.CleanupStoreFixtureAsync(_f, store); await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    [Fact] // dedup partial — D1 pre-exists, POST [D1, D2] inserts only D2
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
        finally { await CleanupUsagesAsync(store.StoreId); await StoreSeed.CleanupStoreFixtureAsync(_f, store); await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    [Fact] // ProfileAdmin via StoreUser else-branch (Profile feature grant + active Management module)
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
        finally { await CleanupUsagesAsync(actor.StoreId); await AuthzSeed.CleanupStoreGraphAsync(_f, actor.StoreId, actor.UserId, actor.OwnerUserId); }
    }

    [Fact] // Reachable ONLY via SuperAdmin bypass -> handler store check -> 400
    public async Task Post_without_selected_store_returns_400()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .PostAsJsonAsync("/api/v1/usages/store-daily-usage", Body("2026-07-20"));
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    [Fact] // PIN: unguarded DateTime.Parse("not-a-date") -> FormatException -> 500
    public async Task Post_malformed_date_returns_500()
    {
        var (adminId, client, store) = await SeedAdminWithSelectedStoreAsync();
        try
        {
            var r = await client.PostAsJsonAsync("/api/v1/usages/store-daily-usage",
                new { ActiveDays = new[] { new { Day = "not-a-date", Saved = true } } });
            r.StatusCode.Should().Be(HttpStatusCode.InternalServerError);
        }
        finally { await CleanupUsagesAsync(store.StoreId); await StoreSeed.CleanupStoreFixtureAsync(_f, store); await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    // ----- 10c gaps -----

    [Fact] // (from 10c A1) multiple all-new days -> all inserted
    public async Task Post_multiple_new_days_inserts_all()
    {
        var (adminId, client, store) = await SeedAdminWithSelectedStoreAsync();
        try
        {
            var r = await client.PostAsJsonAsync("/api/v1/usages/store-daily-usage", Body("2026-07-20", "2026-07-21", "2026-07-22"));
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            (await r.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json))!.Data.Should().BeTrue();
            (await CountUsagesAsync(store.StoreId)).Should().Be(3);
        }
        finally { await CleanupUsagesAsync(store.StoreId); await StoreSeed.CleanupStoreFixtureAsync(_f, store); await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    [Fact] // (from 10c A2) dedup key is (userId, storeId): same day, two users -> both inserted
    public async Task Post_same_day_two_users_inserts_both()
    {
        var store = await StoreSeed.SeedStoreAsync(_f, $"Usg-{Guid.NewGuid():N}", approved: true);
        var a1 = await SeedAdminSelectingStoreAsync(store.StoreId);
        var a2 = await SeedAdminSelectingStoreAsync(store.StoreId);
        try
        {
            (await a1.Client.PostAsJsonAsync("/api/v1/usages/store-daily-usage", Body("2026-07-20"))).StatusCode.Should().Be(HttpStatusCode.OK);
            (await a2.Client.PostAsJsonAsync("/api/v1/usages/store-daily-usage", Body("2026-07-20"))).StatusCode.Should().Be(HttpStatusCode.OK);
            (await CountUsagesAsync(store.StoreId)).Should().Be(2);
        }
        finally
        {
            await CleanupUsagesAsync(store.StoreId);
            await StoreSeed.CleanupStoreFixtureAsync(_f, store);
            await DbTestHelpers.CleanupUserAsync(_f, a1.Id);
            await DbTestHelpers.CleanupUserAsync(_f, a2.Id);
        }
    }

    [Fact] // (from 10c A3) dedup is per store: same user+day, two stores -> both inserted
    public async Task Post_same_day_two_stores_inserts_both()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var client = DbTestHelpers.AuthedClient(_f, adminId, login);
        var store1 = await StoreSeed.SeedStoreAsync(_f, $"Usg1-{Guid.NewGuid():N}", approved: true);
        var store2 = await StoreSeed.SeedStoreAsync(_f, $"Usg2-{Guid.NewGuid():N}", approved: true);
        try
        {
            (await client.PutAsJsonAsync("/api/v1/stores", new { StoreId = store1.StoreId })).StatusCode.Should().Be(HttpStatusCode.OK);
            (await client.PostAsJsonAsync("/api/v1/usages/store-daily-usage", Body("2026-07-20"))).StatusCode.Should().Be(HttpStatusCode.OK);
            (await client.PutAsJsonAsync("/api/v1/stores", new { StoreId = store2.StoreId })).StatusCode.Should().Be(HttpStatusCode.OK);
            (await client.PostAsJsonAsync("/api/v1/usages/store-daily-usage", Body("2026-07-20"))).StatusCode.Should().Be(HttpStatusCode.OK);
            (await CountUsagesAsync(store1.StoreId)).Should().Be(1);
            (await CountUsagesAsync(store2.StoreId)).Should().Be(1);
        }
        finally
        {
            await CleanupUsagesAsync(store1.StoreId);
            await CleanupUsagesAsync(store2.StoreId);
            await StoreSeed.CleanupStoreFixtureAsync(_f, store1);
            await StoreSeed.CleanupStoreFixtureAsync(_f, store2);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    [Fact] // (from 10c A4) ProfileAdmin via the OwnerAdmin filter branch (Management module -> Profile allowed)
    public async Task Post_as_owner_admin_profile_returns_200()
    {
        var actor = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, actor.UserId, actor.Login);
            var r = await client.PostAsJsonAsync("/api/v1/usages/store-daily-usage", Body("2026-07-20"));
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            (await r.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json))!.Data.Should().BeTrue();
        }
        finally { await CleanupUsagesAsync(actor.StoreId); await AuthzSeed.CleanupStoreGraphAsync(_f, actor.StoreId, actor.UserId); }
    }

    [Fact] // (from 10c A5) BUG-REVEAL: dedup is only vs DB, not within the request -> [D1,D1,D2] inserts 3 rows
    public async Task Post_duplicate_days_within_request_inserts_all()
    {
        var (adminId, client, store) = await SeedAdminWithSelectedStoreAsync();
        try
        {
            var r = await client.PostAsJsonAsync("/api/v1/usages/store-daily-usage", Body("2026-07-20", "2026-07-20", "2026-07-21"));
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            (await CountUsagesAsync(store.StoreId)).Should().Be(3);
        }
        finally { await CleanupUsagesAsync(store.StoreId); await StoreSeed.CleanupStoreFixtureAsync(_f, store); await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    [Fact] // (from 10c A6) CORRECT: Saved is a client-side sync flag; backend ignores it -> Saved:false still inserts
    public async Task Post_saved_false_still_inserts()
    {
        var (adminId, client, store) = await SeedAdminWithSelectedStoreAsync();
        try
        {
            var r = await client.PostAsJsonAsync("/api/v1/usages/store-daily-usage",
                new { ActiveDays = new[] { new { Day = "2026-07-20", Saved = false } } });
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            (await r.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json))!.Data.Should().BeTrue();
            (await CountUsagesAsync(store.StoreId)).Should().Be(1);
        }
        finally { await CleanupUsagesAsync(store.StoreId); await StoreSeed.CleanupStoreFixtureAsync(_f, store); await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    [Fact] // (from 10c A7) a timed Day and a midnight Day for the same date are distinct -> both inserted
    public async Task Post_day_with_time_component_is_distinct_from_midnight()
    {
        var (adminId, client, store) = await SeedAdminWithSelectedStoreAsync();
        try
        {
            (await client.PostAsJsonAsync("/api/v1/usages/store-daily-usage", Body("2026-07-20T15:30:00"))).StatusCode.Should().Be(HttpStatusCode.OK);
            (await client.PostAsJsonAsync("/api/v1/usages/store-daily-usage", Body("2026-07-20"))).StatusCode.Should().Be(HttpStatusCode.OK);
            (await CountUsagesAsync(store.StoreId)).Should().Be(2);
        }
        finally { await CleanupUsagesAsync(store.StoreId); await StoreSeed.CleanupStoreFixtureAsync(_f, store); await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    [Fact] // (from 10c A8) no date-range validation -> a far-future day is accepted
    public async Task Post_future_day_is_accepted()
    {
        var (adminId, client, store) = await SeedAdminWithSelectedStoreAsync();
        try
        {
            var r = await client.PostAsJsonAsync("/api/v1/usages/store-daily-usage", Body("2999-01-01"));
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            (await r.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json))!.Data.Should().BeTrue();
        }
        finally { await CleanupUsagesAsync(store.StoreId); await StoreSeed.CleanupStoreFixtureAsync(_f, store); await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    [Fact] // (from 10c A9) BUG-REVEAL: empty Day string -> DateTime.Parse throws -> 500
    public async Task Post_empty_day_string_returns_500()
    {
        var (adminId, client, store) = await SeedAdminWithSelectedStoreAsync();
        try
        {
            var r = await client.PostAsJsonAsync("/api/v1/usages/store-daily-usage",
                new { ActiveDays = new[] { new { Day = "", Saved = true } } });
            r.StatusCode.Should().Be(HttpStatusCode.InternalServerError);
        }
        finally { await CleanupUsagesAsync(store.StoreId); await StoreSeed.CleanupStoreFixtureAsync(_f, store); await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    [Fact] // (from 10c A10) BUG-REVEAL: no validator -> null ActiveDays -> NRE -> 500
    public async Task Post_missing_activeDays_returns_500()
    {
        var (adminId, client, store) = await SeedAdminWithSelectedStoreAsync();
        try
        {
            var r = await client.PostAsJsonAsync("/api/v1/usages/store-daily-usage", new { });
            r.StatusCode.Should().Be(HttpStatusCode.InternalServerError);
        }
        finally { await CleanupUsagesAsync(store.StoreId); await StoreSeed.CleanupStoreFixtureAsync(_f, store); await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    [Fact] // (from 10c A11) FINDING: no IsActive filter on the store lookup -> usage against an INACTIVE store is accepted
    public async Task Post_against_inactive_store_returns_200()
    {
        var (adminId, client, store) = await SeedAdminWithSelectedStoreAsync();
        await StoreSeed.DeactivateStoreAsync(_f, store.StoreId);
        try
        {
            var r = await client.PostAsJsonAsync("/api/v1/usages/store-daily-usage", Body("2026-07-20"));
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            (await r.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json))!.Data.Should().BeTrue();
        }
        finally { await CleanupUsagesAsync(store.StoreId); await StoreSeed.CleanupStoreFixtureAsync(_f, store); await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    [Fact] // (from 10c A12) POST-only route -> GET verb -> 405
    public async Task Get_verb_on_store_daily_usage_returns_405()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, adminId, login).GetAsync("/api/v1/usages/store-daily-usage");
            r.StatusCode.Should().Be(HttpStatusCode.MethodNotAllowed);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    [Fact] // (from 10c A13) POST-only route -> PUT verb -> 405
    public async Task Put_verb_on_store_daily_usage_returns_405()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, adminId, login).PutAsJsonAsync("/api/v1/usages/store-daily-usage", new { });
            r.StatusCode.Should().Be(HttpStatusCode.MethodNotAllowed);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    [Fact] // (from 10c A14) VERIFY&PIN: malformed JSON body -> model-binding 400 (pin the actual status)
    public async Task Post_malformed_json_returns_400()
    {
        var (adminId, client, store) = await SeedAdminWithSelectedStoreAsync();
        try
        {
            var content = new StringContent("{ not valid json ", System.Text.Encoding.UTF8, "application/json");
            var r = await client.PostAsync("/api/v1/usages/store-daily-usage", content);
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }
        finally { await CleanupUsagesAsync(store.StoreId); await StoreSeed.CleanupStoreFixtureAsync(_f, store); await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    [Fact] // (from 10c A16) the handler wires httpContext fields; with no headers they persist as "" (never null)
    public async Task Post_persists_non_null_context_fields()
    {
        var (adminId, client, store) = await SeedAdminWithSelectedStoreAsync();
        try
        {
            (await client.PostAsJsonAsync("/api/v1/usages/store-daily-usage", Body("2026-07-20"))).StatusCode.Should().Be(HttpStatusCode.OK);
            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var row = await db.Set<StoreUsage>().IgnoreQueryFilters().FirstAsync(u => u.StoreId == store.StoreId);
            row.IpAddress.Should().NotBeNull();
            row.GfDevice.Should().NotBeNull();
            row.GfDeviceId.Should().NotBeNull();
            row.GfSessionId.Should().NotBeNull();
        }
        finally { await CleanupUsagesAsync(store.StoreId); await StoreSeed.CleanupStoreFixtureAsync(_f, store); await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }
}
```

- [ ] **Step 2: Run** — `dotnet test backend/src/SMCA.WebApi.E2ETests --filter ~StoreDailyUsageTests`
  Expected: all PASS. For the PIN/VERIFY rows (`Post_malformed_date_returns_500`,
  `Post_empty_day_string_returns_500`, `Post_missing_activeDays_returns_500`, `Post_malformed_json_returns_400`),
  if the pipeline returns a different status, **pin the actual** and note it.
- [ ] **Step 3: Checkpoint** — `test(webapi): usages store-daily-usage behavior + gaps e2e`.

---

## Task 2: `StoreDailyUsageAuthTests` (POST auth + 10c gap)

**Files:**
- Create: `backend/src/SMCA.WebApi.E2ETests/Usages/StoreDailyUsageAuthTests.cs`

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

    [Fact] // A garbage bearer is rejected by the auth middleware before the class filter runs.
    public async Task Post_malformed_token_returns_401()
    {
        var client = AuthTestHelpers.BearerClient(_f, "not.a.valid.jwt");
        var r = await client.PostAsJsonAsync("/api/v1/usages/store-daily-usage", Body());
        r.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact] // (from 10c A15) VERIFY&PIN: inactive user with a valid minted token -> pipeline rejects; pin the status.
    public async Task Post_as_inactive_user_is_rejected()
    {
        var login = $"inact-{Guid.NewGuid():N}@test.com";
        var userId = await DbTestHelpers.SeedInactiveUserAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, userId, login)
                .PostAsJsonAsync("/api/v1/usages/store-daily-usage", Body());
            // Inactive SuperAdmin: filter bypass may reach the handler's UserNotFound guard (400 — the sole
            // path that reaches that dead-gate), or an auth-pipeline inactive check may reject first (401/404).
            r.StatusCode.Should().BeOneOf(HttpStatusCode.Unauthorized, HttpStatusCode.NotFound, HttpStatusCode.BadRequest);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, userId); }
    }
}
```

- [ ] **Step 2: Run** — `--filter ~StoreDailyUsageAuthTests`. Expected: 4 PASS; pin `Post_as_inactive_user_is_rejected`.
- [ ] **Step 3: Checkpoint** — `test(webapi): usages store-daily-usage auth + inactive-user e2e`.

---

## Task 3: `StoreLastUsagesTests` (GET behavior — contract + 10c gaps)

**Files:**
- Create: `backend/src/SMCA.WebApi.E2ETests/Usages/StoreLastUsagesTests.cs`

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

    private async Task<UsagesDto> GetAsync(Guid adminId, string login, string path)
    {
        var r = await DbTestHelpers.AuthedClient(_f, adminId, login).GetAsync(path);
        r.StatusCode.Should().Be(HttpStatusCode.OK);
        return (await r.Content.ReadFromJsonAsync<ApiResponse<UsagesDto>>(ApiResponse.Json))!.Data!;
    }

    [Fact] // PIN: count array left-padded to the window length (7).
    public async Task LastWeek_as_super_admin_returns_200_array_length_7()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try { (await GetAsync(adminId, login, "/api/v1/usages/stores-last-week")).StoreUsagesCountDays.Should().HaveCount(7); }
        finally { await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    [Fact] // PIN: count array left-padded to the window length (30).
    public async Task LastMonth_as_super_admin_returns_200_array_length_30()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try { (await GetAsync(adminId, login, "/api/v1/usages/stores-last-month")).StoreUsagesCountDays.Should().HaveCount(30); }
        finally { await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    [Fact] // week counts reflect seeded usage days
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
            var d = await GetAsync(adminId, login, "/api/v1/usages/stores-last-week");
            d.StoreUsagesCountDays.Should().HaveCount(7);
            d.StoreUsagesCountDays.Sum().Should().BeGreaterThanOrEqualTo(3);
            d.ActiveStoreCount.Should().BeGreaterThanOrEqualTo(1);
        }
        finally { await CleanupUsagesAsync(store.StoreId); await StoreSeed.CleanupStoreFixtureAsync(_f, store); await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    [Fact] // (from 10c B1) month counts reflect seeded days inside the 30-day window
    public async Task LastMonth_counts_reflect_seeded_usage_days()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var store = await StoreSeed.SeedStoreAsync(_f, $"Usg-{Guid.NewGuid():N}", approved: true);
        try
        {
            var today = DateTime.UtcNow.Date;
            await InsertUsageAsync(store.StoreId, store.OwnerUserId, today.AddDays(-10));
            await InsertUsageAsync(store.StoreId, store.OwnerUserId, today.AddDays(-20));
            var d = await GetAsync(adminId, login, "/api/v1/usages/stores-last-month");
            d.StoreUsagesCountDays.Should().HaveCount(30);
            d.StoreUsagesCountDays.Sum().Should().BeGreaterThanOrEqualTo(2);
        }
        finally { await CleanupUsagesAsync(store.StoreId); await StoreSeed.CleanupStoreFixtureAsync(_f, store); await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    [Fact] // (from 10c B2) VERIFY&PIN: every bucket is non-negative (shared DB blocks an exact all-zero assertion)
    public async Task LastWeek_counts_are_non_negative()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var d = await GetAsync(adminId, login, "/api/v1/usages/stores-last-week");
            d.StoreUsagesCountDays.Should().OnlyContain(c => c >= 0);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    // (from 10c B3) usage older than the window OR on an inactive store is excluded from the counts.
    // Relies on the serial [Collection("e2e")] execution: no concurrent mutation of the shared sum.
    [Fact]
    public async Task LastWeek_excludes_out_of_window_and_inactive_store_usage()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var inWindow = await StoreSeed.SeedStoreAsync(_f, $"In-{Guid.NewGuid():N}", approved: true);
        var oldStore = await StoreSeed.SeedStoreAsync(_f, $"Old-{Guid.NewGuid():N}", approved: true);
        var inactive = await StoreSeed.SeedStoreAsync(_f, $"Ina-{Guid.NewGuid():N}", approved: true);
        try
        {
            var today = DateTime.UtcNow.Date;
            var sumBefore = (await GetAsync(adminId, login, "/api/v1/usages/stores-last-week")).StoreUsagesCountDays.Sum();

            await InsertUsageAsync(oldStore.StoreId, oldStore.OwnerUserId, today.AddDays(-30));     // outside 7-day window
            await InsertUsageAsync(inactive.StoreId, inactive.OwnerUserId, today.AddDays(-2));
            await StoreSeed.DeactivateStoreAsync(_f, inactive.StoreId);                             // Store.IsActive filter
            var sumExcluded = (await GetAsync(adminId, login, "/api/v1/usages/stores-last-week")).StoreUsagesCountDays.Sum();
            sumExcluded.Should().Be(sumBefore);                                                     // neither counted

            await InsertUsageAsync(inWindow.StoreId, inWindow.OwnerUserId, today.AddDays(-2));      // in window, active
            var sumIncluded = (await GetAsync(adminId, login, "/api/v1/usages/stores-last-week")).StoreUsagesCountDays.Sum();
            sumIncluded.Should().Be(sumBefore + 1);                                                 // exactly one new (store,day)
        }
        finally
        {
            await CleanupUsagesAsync(inWindow.StoreId); await CleanupUsagesAsync(oldStore.StoreId); await CleanupUsagesAsync(inactive.StoreId);
            await StoreSeed.CleanupStoreFixtureAsync(_f, inWindow); await StoreSeed.CleanupStoreFixtureAsync(_f, oldStore); await StoreSeed.CleanupStoreFixtureAsync(_f, inactive);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    [Fact] // (from 10c B4) usage exactly on the window boundary (today - 7) is included (>=)
    public async Task LastWeek_includes_boundary_day()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var store = await StoreSeed.SeedStoreAsync(_f, $"Bnd-{Guid.NewGuid():N}", approved: true);
        try
        {
            var boundary = DateTime.UtcNow.Date.AddDays(-7);
            var sumBefore = (await GetAsync(adminId, login, "/api/v1/usages/stores-last-week")).StoreUsagesCountDays.Sum();
            await InsertUsageAsync(store.StoreId, store.OwnerUserId, boundary);
            var sumAfter = (await GetAsync(adminId, login, "/api/v1/usages/stores-last-week")).StoreUsagesCountDays.Sum();
            sumAfter.Should().Be(sumBefore + 1);
        }
        finally { await CleanupUsagesAsync(store.StoreId); await StoreSeed.CleanupStoreFixtureAsync(_f, store); await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    [Fact] // (from 10c B5) ActiveStoreCount reflects active stores only
    public async Task LastWeek_activeStoreCount_counts_active_only()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var before = (await GetAsync(adminId, login, "/api/v1/usages/stores-last-week")).ActiveStoreCount;
        var s1 = await StoreSeed.SeedStoreAsync(_f, $"Act1-{Guid.NewGuid():N}", approved: true);
        var s2 = await StoreSeed.SeedStoreAsync(_f, $"Act2-{Guid.NewGuid():N}", approved: true);
        try
        {
            (await GetAsync(adminId, login, "/api/v1/usages/stores-last-week")).ActiveStoreCount.Should().Be(before + 2);
            await StoreSeed.DeactivateStoreAsync(_f, s2.StoreId);
            (await GetAsync(adminId, login, "/api/v1/usages/stores-last-week")).ActiveStoreCount.Should().Be(before + 1);
        }
        finally { await StoreSeed.CleanupStoreFixtureAsync(_f, s1); await StoreSeed.CleanupStoreFixtureAsync(_f, s2); await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    [Fact] // (from 10c B6) GET-only route -> POST verb -> 405 (week)
    public async Task Post_verb_on_stores_last_week_returns_405()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, adminId, login).PostAsJsonAsync("/api/v1/usages/stores-last-week", new { });
            r.StatusCode.Should().Be(HttpStatusCode.MethodNotAllowed);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    [Fact] // (from 10c B7) GET-only route -> POST verb -> 405 (month)
    public async Task Post_verb_on_stores_last_month_returns_405()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, adminId, login).PostAsJsonAsync("/api/v1/usages/stores-last-month", new { });
            r.StatusCode.Should().Be(HttpStatusCode.MethodNotAllowed);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }
}
```

- [ ] **Step 2: Run** — `--filter ~StoreLastUsagesTests`. Expected: all PASS. `LastWeek_counts_are_non_negative`
  is the only VERIFY&PIN row.
- [ ] **Step 3: Checkpoint** — `test(webapi): usages stores-last-week/month behavior + gaps e2e`.

---

## Task 4: `StoreLastUsagesAuthTests` (GET auth — full matrix on both windows)

**Files:**
- Create: `backend/src/SMCA.WebApi.E2ETests/Usages/StoreLastUsagesAuthTests.cs`

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

    private async Task AssertRoleForbidden(int roleId, string path)
    {
        var actor = await DbTestHelpers.SeedUserWithRoleAsync(_f, roleId);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, actor.UserId, actor.Login).GetAsync(path);
            r.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, actor.UserId); }
    }

    [Fact] public async Task LastWeek_no_token_returns_401()
    { (await _f.CreateClient().GetAsync("/api/v1/usages/stores-last-week")).StatusCode.Should().Be(HttpStatusCode.Unauthorized); }

    [Fact] public async Task LastMonth_no_token_returns_401()
    { (await _f.CreateClient().GetAsync("/api/v1/usages/stores-last-month")).StatusCode.Should().Be(HttpStatusCode.Unauthorized); }

    [Fact] public async Task LastWeek_malformed_token_returns_401()
    { (await AuthTestHelpers.BearerClient(_f, "not.a.valid.jwt").GetAsync("/api/v1/usages/stores-last-week")).StatusCode.Should().Be(HttpStatusCode.Unauthorized); }

    [Fact] public Task LastWeek_as_owner_admin_returns_403() => AssertRoleForbidden((int)RoleType.OwnerAdmin, "/api/v1/usages/stores-last-week");
    [Fact] public Task LastWeek_as_store_user_returns_403() => AssertRoleForbidden((int)RoleType.StoreUser, "/api/v1/usages/stores-last-week");
    [Fact] public Task LastWeek_as_reseller_returns_403() => AssertRoleForbidden((int)RoleType.ReSeller, "/api/v1/usages/stores-last-week");

    // (from 10c B8/B9/B10) full 403 matrix on the month window too
    [Fact] public Task LastMonth_as_owner_admin_returns_403() => AssertRoleForbidden((int)RoleType.OwnerAdmin, "/api/v1/usages/stores-last-month");
    [Fact] public Task LastMonth_as_store_user_returns_403() => AssertRoleForbidden((int)RoleType.StoreUser, "/api/v1/usages/stores-last-month");
    [Fact] public Task LastMonth_as_reseller_returns_403() => AssertRoleForbidden((int)RoleType.ReSeller, "/api/v1/usages/stores-last-month");

    [Fact] // (from 10c B11)
    public async Task LastMonth_malformed_token_returns_401()
    { (await AuthTestHelpers.BearerClient(_f, "not.a.valid.jwt").GetAsync("/api/v1/usages/stores-last-month")).StatusCode.Should().Be(HttpStatusCode.Unauthorized); }

    [Fact] // (from 10c B12) VERIFY&PIN: inactive SuperAdmin on a GET -> pin 401/404 (or 200 if no active-user gate)
    public async Task LastWeek_as_inactive_super_admin_is_rejected_or_pinned()
    {
        var login = $"inact-{Guid.NewGuid():N}@test.com";
        var userId = await DbTestHelpers.SeedInactiveUserAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, userId, login).GetAsync("/api/v1/usages/stores-last-week");
            r.StatusCode.Should().BeOneOf(HttpStatusCode.Unauthorized, HttpStatusCode.NotFound, HttpStatusCode.OK);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, userId); }
    }
}
```

- [ ] **Step 2: Run** — `--filter ~StoreLastUsagesAuthTests`. Expected: all PASS; pin
  `LastWeek_as_inactive_super_admin_is_rejected_or_pinned`.
- [ ] **Step 3: Checkpoint** — `test(webapi): usages stores-last-week/month auth full matrix e2e`.

---

## Task 5: Retire the smoke file + full-suite green

**Files:**
- Delete: `backend/src/SMCA.WebApi.E2ETests/Auth/UsagesSmokeTests.cs`

- [ ] **Step 1:** Delete `Auth/UsagesSmokeTests.cs` (its `no-token→401` is now
  `StoreDailyUsageAuthTests.Post_no_token_returns_401`; its `super-admin→200` is now
  `StoreDailyUsageTests.Post_new_day_as_super_admin_returns_200_true_and_inserts_row`).
- [ ] **Step 2: Run the whole suite** — `dotnet test backend/src/SMCA.WebApi.E2ETests` → PASS.
- [ ] **Step 3: Checkpoint** — `test(webapi): retire usages smoke file, fold into Usages/ suite`.

---

## Self-Review

- **Coverage vs `10` test-plan + `10c` gap suite — 47 e2e tests + 3 `10b` unit tests, nothing dropped:**
  - `StoreDailyUsageTests` (22): 7 plan behavior + 15 `(from 10c)` (A1–A14, A16).
  - `StoreDailyUsageAuthTests` (4): 3 plan auth + A15.
  - `StoreLastUsagesTests` (10): 3 plan behavior + B1–B7.
  - `StoreLastUsagesAuthTests` (11): 6 plan auth + B8–B12.
- **Latent robustness pins (real client never triggers; do NOT fix production in a test task):** A5
  (intra-request dedup), A9/A10 (missing date/`ActiveDays` validation → 500), A11 (usage against inactive
  store accepted). `Saved` being ignored (A6) is **correct** (client-side sync flag), not a pin.
- **VERIFY&PIN rows (run, observe, pin actual):** A14 (malformed JSON), A15 & B12 (inactive user), B2
  (non-negative buckets).
- **Determinism:** the delta assertions (B3/B4/B5) hold because every Usages test class shares
  `[Collection("e2e")]` → serial execution; all other tests use per-store isolation + `finally` cleanup and
  `>=` on shared aggregates.
- **Type consistency:** `StoreUsage.Create(storeId, userId, day, ip, device, deviceId, sessionId)`,
  `ApiResponse<bool>` / `ApiResponse<UsagesDto>` + `ApiResponse.Json`, `AuthzSeed.{SeedStoreUserAsync,
  SeedOwnerAdminAsync, CleanupStoreGraphAsync}`, `StoreSeed.{SeedStoreAsync, DeactivateStoreAsync,
  CleanupStoreFixtureAsync}`, `DbTestHelpers.SeedInactiveUserAsync` — all match the on-disk harness.
- **Unreachable handler gates (documented, not asserted):** GET `IsSuperAdmin`, POST `UserNotFound` — the
  `HasPermission` filters reject first, so no e2e path reaches them (see test-plan §5).
- **Out of scope (not a Usages behavior):** the generic role×feature×scope matrix (`05`).
```

