using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Stores;

/// <summary>
/// E2E tests for the DG-7 one-way plan lock: a non-SuperAdmin caller must not
/// change the module set of a store that has any active paid module. Same-set
/// updates, free-store activation, and SuperAdmin module changes stay allowed.
/// </summary>
[Collection("e2e")]
public sealed class StorePlanLockTests
{
    private readonly WebAppFixture _fixture;
    private readonly AppTestFactory _f;

    public StorePlanLockTests(WebAppFixture fixture)
    {
        _fixture = fixture;
        _f = fixture.Factory;
    }

    private static object Body(Guid bodyId, string name, IEnumerable<int> moduleIds) => new
    {
        Id = bodyId, Name = name, Address = "a", Description = "d", Approved = false,
        ModuleIds = moduleIds, IsActive = true
    };

    [Fact]
    public async Task OwnerAdmin_changes_modules_on_paid_store_returns_400_PlanLocked()
    {
        // OwnerAdmin is seeded with its own free store (SelectedStoreId set), so the
        // StoresController [HasPermission] filter resolves features; the TARGET store
        // is the paid store whose modules must not change (per StoreCreationTrialTests
        // pattern: actor's own store is free, target store is seeded separately).
        var actor = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);
        var fx = await BillingSeed.SeedPaidStoreAsync(_f, new DateOnly(2026, 6, 1));
        try
        {
            // Paid store has modules [7 free, 6 paid]; dropping the paid module
            // changes the set → the one-way lock must reject with 400 + PlanLocked.
            var r = await DbTestHelpers.AuthedClient(_f, actor.UserId, actor.Login)
                .PutAsJsonAsync($"/api/v1/stores/{fx.StoreId}", Body(Guid.Empty, $"n-{Guid.NewGuid():N}", new[] { BillingSeed.ManagementModuleId }));
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Errors.Should().Contain(e => e.Code == "PlanLocked");
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, actor.StoreId, actor.UserId);
            await BillingSeed.CleanupAsync(_f, fx);
        }
    }

    [Fact]
    public async Task OwnerAdmin_rename_only_on_paid_store_returns_200()
    {
        var actor = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);
        var fx = await BillingSeed.SeedPaidStoreAsync(_f, new DateOnly(2026, 6, 1));
        try
        {
            // Same module set [7,6] with a new name → the lock must not fire.
            var newName = $"Renamed-{Guid.NewGuid():N}";
            var r = await DbTestHelpers.AuthedClient(_f, actor.UserId, actor.Login)
                .PutAsJsonAsync($"/api/v1/stores/{fx.StoreId}", Body(Guid.Empty, newName, new[] { BillingSeed.ManagementModuleId, BillingSeed.StatisticsModuleId }));
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json);
            b!.Succeeded.Should().BeTrue();
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, actor.StoreId, actor.UserId);
            await BillingSeed.CleanupAsync(_f, fx);
        }
    }

    [Fact]
    public async Task OwnerAdmin_activates_free_store_returns_200()
    {
        var actor = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);
        var fx = await BillingSeed.SeedFreeStoreAsync(_f);
        try
        {
            // Free store has only module [7]; adding the paid module (id=6) is
            // activation, not a plan change → allowed.
            var r = await DbTestHelpers.AuthedClient(_f, actor.UserId, actor.Login)
                .PutAsJsonAsync($"/api/v1/stores/{fx.StoreId}", Body(Guid.Empty, $"n-{Guid.NewGuid():N}", new[] { BillingSeed.ManagementModuleId, BillingSeed.StatisticsModuleId }));
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json);
            b!.Succeeded.Should().BeTrue();
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, actor.StoreId, actor.UserId);
            await BillingSeed.CleanupAsync(_f, fx);
        }
    }

    [Fact]
    public async Task SuperAdmin_changes_modules_on_paid_store_returns_200()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var fx = await BillingSeed.SeedPaidStoreAsync(_f, new DateOnly(2026, 6, 1));
        try
        {
            // SuperAdmin carve-out: changing the set on a paid store is allowed.
            var r = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .PutAsJsonAsync($"/api/v1/stores/{fx.StoreId}", Body(Guid.Empty, $"n-{Guid.NewGuid():N}", new[] { BillingSeed.ManagementModuleId }));
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json);
            b!.Succeeded.Should().BeTrue();
        }
        finally { await BillingSeed.CleanupAsync(_f, fx); await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }
}