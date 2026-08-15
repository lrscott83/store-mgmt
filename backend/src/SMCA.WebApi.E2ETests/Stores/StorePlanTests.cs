using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Stores;

/// <summary>
/// E2E tests for the plan/update split: the dedicated plan GET
/// (<c>GET /api/v1/stores/{id}/plan</c>) and the data-only update
/// (<c>PUT /api/v1/stores/{id}</c> WITHOUT <c>moduleIds</c>), which must leave
/// the store's plan untouched and must never fire the DG-7 plan lock.
/// </summary>
[Collection("e2e")]
public sealed class StorePlanTests
{
    private readonly WebAppFixture _fixture;
    private readonly AppTestFactory _f;

    public StorePlanTests(WebAppFixture fixture)
    {
        _fixture = fixture;
        _f = fixture.Factory;
    }

    private sealed class PlanData
    {
        public Guid StoreId { get; set; }
        public string StoreName { get; set; } = string.Empty;
        public DateOnly? PaymentStartDate { get; set; }
        public List<ModuleData> Modules { get; set; } = new();
    }

    private sealed class ModuleData
    {
        public int Id { get; set; }
        public bool PriceIncluded { get; set; }
    }

    /// <summary>Data-only update body: NO <c>moduleIds</c>, NO <c>paymentStartDate</c>.</summary>
    private static object DataOnlyBody(Guid bodyId, string name) => new
    {
        Id = bodyId, Name = name, Address = "a", Description = "d", Approved = false, IsActive = true
    };

    // ── GET /api/v1/stores/{id}/plan ───────────────────────────────────────

    [Fact]
    public async Task Get_plan_existing_store_returns_plan_dto()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var fx = await BillingSeed.SeedPaidStoreAsync(_f, new DateOnly(2026, 6, 1));
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .GetAsync($"/api/v1/stores/{fx.StoreId}/plan");
            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<PlanData>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            body.Data!.StoreId.Should().Be(fx.StoreId);
            body.Data.PaymentStartDate.Should().Be(new DateOnly(2026, 6, 1));
            body.Data.Modules.Select(m => m.Id).Should().BeEquivalentTo(
                new[] { BillingSeed.ManagementModuleId, BillingSeed.StatisticsModuleId });
        }
        finally { await BillingSeed.CleanupAsync(_f, fx); await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    [Fact]
    public async Task Get_plan_free_store_reports_null_payment_date_and_free_module()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var fx = await BillingSeed.SeedFreeStoreAsync(_f);
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .GetAsync($"/api/v1/stores/{fx.StoreId}/plan");
            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<PlanData>>(ApiResponse.Json);
            body!.Data!.PaymentStartDate.Should().BeNull();
            body.Data.Modules.Select(m => m.Id).Should().Equal(BillingSeed.ManagementModuleId);
        }
        finally { await BillingSeed.CleanupAsync(_f, fx); await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    [Fact]
    public async Task Get_plan_unknown_store_returns_400_code_Id()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .GetAsync($"/api/v1/stores/{Guid.NewGuid()}/plan");
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            body!.Errors.Should().Contain(e => e.Code == "Id");
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    [Fact]
    public async Task Get_plan_without_token_returns_401()
    {
        var response = await _f.CreateClient().GetAsync($"/api/v1/stores/{Guid.NewGuid()}/plan");
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Get_plan_as_owner_admin_returns_200()
    {
        // Same authorization as GET /api/v1/stores/{id}: controller-level
        // [HasPermission(SuperAdmin, StoresAdmin)] — an OwnerAdmin with the
        // Management module resolves the Stores feature.
        var actor = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);
        var fx = await BillingSeed.SeedFreeStoreAsync(_f);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, actor.UserId, actor.Login)
                .GetAsync($"/api/v1/stores/{fx.StoreId}/plan");
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await r.Content.ReadFromJsonAsync<ApiResponse<PlanData>>(ApiResponse.Json);
            body!.Data!.StoreId.Should().Be(fx.StoreId);
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, actor.StoreId, actor.UserId);
            await BillingSeed.CleanupAsync(_f, fx);
        }
    }

    // ── Data-only update (PUT without moduleIds) ───────────────────────────

    [Fact]
    public async Task Data_only_update_renames_store_and_leaves_modules_untouched()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var fx = await BillingSeed.SeedPaidStoreAsync(_f, new DateOnly(2026, 6, 1));
        try
        {
            var newName = $"Renamed-{Guid.NewGuid():N}";
            var r = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .PutAsJsonAsync($"/api/v1/stores/{fx.StoreId}", DataOnlyBody(Guid.Empty, newName));
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json);
            b!.Succeeded.Should().BeTrue();

            // Store data changed…
            (await StoreSeed.GetStoreRowAsync(_f, fx.StoreId)).Name.Should().Be(newName);

            // …but the plan (modules + payment date) is untouched.
            var plan = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .GetFromJsonAsync<ApiResponse<PlanData>>($"/api/v1/stores/{fx.StoreId}/plan", ApiResponse.Json);
            plan!.Data!.Modules.Select(m => m.Id).Should().BeEquivalentTo(
                new[] { BillingSeed.ManagementModuleId, BillingSeed.StatisticsModuleId });
            plan.Data.PaymentStartDate.Should().Be(new DateOnly(2026, 6, 1));
        }
        finally { await BillingSeed.CleanupAsync(_f, fx); await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    [Fact]
    public async Task OwnerAdmin_data_only_update_on_paid_store_does_not_fire_plan_lock()
    {
        // The DG-7 one-way lock fires only when ModuleIds would change the
        // active set; a data-only update (no ModuleIds) must never trip it —
        // otherwise the store-data view could not save for an owner on a paid
        // plan.
        var actor = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);
        var fx = await BillingSeed.SeedPaidStoreAsync(_f, new DateOnly(2026, 6, 1));
        try
        {
            var newName = $"Renamed-{Guid.NewGuid():N}";
            var r = await DbTestHelpers.AuthedClient(_f, actor.UserId, actor.Login)
                .PutAsJsonAsync($"/api/v1/stores/{fx.StoreId}", DataOnlyBody(Guid.Empty, newName));
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json);
            b!.Succeeded.Should().BeTrue();
            (await StoreSeed.GetStoreRowAsync(_f, fx.StoreId)).Name.Should().Be(newName);
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, actor.StoreId, actor.UserId);
            await BillingSeed.CleanupAsync(_f, fx);
        }
    }
}
