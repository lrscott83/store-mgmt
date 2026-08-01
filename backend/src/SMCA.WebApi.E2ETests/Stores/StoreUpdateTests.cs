using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Stores;

[Collection("e2e")]
public sealed class StoreUpdateTests
{
    private readonly WebAppFixture _fixture;
    private readonly AppTestFactory _f;
    public StoreUpdateTests(WebAppFixture fixture)
    {
        _fixture = fixture;
        _f = fixture.Factory;
    }

    private static object Body(Guid bodyId, string name, IEnumerable<int> moduleIds) => new
    {
        Id = bodyId, Name = name, Address = "a", Description = "d", Approved = false,
        ModuleIds = moduleIds, IsActive = true
    };

    private static object BodyWithPaymentDate(Guid bodyId, string name, IEnumerable<int> moduleIds, string paymentStartDate) => new
    {
        Id = bodyId, Name = name, Address = "a", Description = "d", Approved = false,
        ModuleIds = moduleIds, IsActive = true, paymentStartDate
    };

    [Fact]
    public async Task Update_as_superadmin_with_payment_date_succeeds()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var fx = await StoreSeed.SeedStoreAsync(_f, $"Store-{Guid.NewGuid():N}", approved: false);
        try
        {
            var newName = $"Renamed-{Guid.NewGuid():N}";
            var r = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .PutAsJsonAsync($"/api/v1/stores/{fx.StoreId}", Body(Guid.Empty, newName, new[] { StoreSeed.ManagementModuleId }));
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json);
            b!.Succeeded.Should().BeTrue(); b.Data.Should().BeTrue();
            (await StoreSeed.GetStoreRowAsync(_f, fx.StoreId)).Name.Should().Be(newName);
        }
        finally { await StoreSeed.CleanupStoreFixtureAsync(_f, fx); await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    [Fact]
    public async Task Update_as_superadmin_succeeds_without_payment_date()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var fx = await StoreSeed.SeedStoreAsync(_f, $"Store-{Guid.NewGuid():N}", approved: false);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .PutAsJsonAsync($"/api/v1/stores/{fx.StoreId}", Body(Guid.Empty, $"n-{Guid.NewGuid():N}", new[] { StoreSeed.ManagementModuleId }));
            r.StatusCode.Should().Be(HttpStatusCode.OK);
        }
        finally { await StoreSeed.CleanupStoreFixtureAsync(_f, fx); await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    [Fact]
    public async Task Update_with_payment_date_in_body_persists_explicit_date()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var fx = await BillingSeed.SeedFreeStoreAsync(_f);
        try
        {
            // General PUT with an explicit paymentStartDate (SuperAdmin) must persist it,
            // not silently ignore the field (the debt T-B3 closed).
            var r = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .PutAsJsonAsync($"/api/v1/stores/{fx.StoreId}",
                    BodyWithPaymentDate(Guid.Empty, $"n-{Guid.NewGuid():N}", new[] { BillingSeed.ManagementModuleId }, "2026-07-01"));
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var store = await db.Set<Domain.Entities.Stores.Store>()
                .IgnoreQueryFilters()
                .FirstAsync(s => s.Id == fx.StoreId);
            store.PaymentStartDate.Should().Be(new DateOnly(2026, 7, 1));
        }
        finally { await BillingSeed.CleanupAsync(_f, fx); await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    [Fact]
    public async Task Update_with_explicit_payment_date_beats_auto_activation()
    {
        using var _ = _fixture.Clock.Pin(new DateTimeOffset(2026, 7, 15, 0, 0, 0, TimeSpan.Zero));

        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var fx = await BillingSeed.SeedFreeStoreAsync(_f);
        try
        {
            // Adding the paid Statistics module (id=6) would auto-set PaymentStartDate to today
            // (2026-07-15); the explicit date in the body must win (spec 3c).
            var r = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .PutAsJsonAsync($"/api/v1/stores/{fx.StoreId}",
                    BodyWithPaymentDate(Guid.Empty, $"n-{Guid.NewGuid():N}",
                        new[] { BillingSeed.ManagementModuleId, BillingSeed.StatisticsModuleId }, "2026-07-01"));
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var store = await db.Set<Domain.Entities.Stores.Store>()
                .IgnoreQueryFilters()
                .FirstAsync(s => s.Id == fx.StoreId);
            store.PaymentStartDate.Should().Be(new DateOnly(2026, 7, 1));
        }
        finally { await BillingSeed.CleanupAsync(_f, fx); await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    [Fact]
    public async Task SuperAdmin_sets_payment_date_returns_200()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var fx = await StoreSeed.SeedStoreAsync(_f, $"Store-{Guid.NewGuid():N}", approved: false);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .PutAsJsonAsync($"/api/v1/stores/{fx.StoreId}/payment-date", new { PaymentStartDate = "2026-07-01" });
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json);
            b!.Succeeded.Should().BeTrue();
        }
        finally { await StoreSeed.CleanupStoreFixtureAsync(_f, fx); await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    [Fact]
    public async Task OwnerAdmin_cannot_set_payment_date_returns_403()
    {
        var sa = await StoreSeed.SeedStoresAdminUserAsync(_f);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, sa.UserId, sa.Login)
                .PutAsJsonAsync($"/api/v1/stores/{sa.StoreId}/payment-date", new { PaymentStartDate = "2026-07-01" });
            r.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        finally { await StoreSeed.CleanupStoresAdminAsync(_f, sa); }
    }

    [Fact]
    public async Task Unauthenticated_cannot_set_payment_date_returns_401()
    {
        var r = await _f.CreateClient()
            .PutAsJsonAsync($"/api/v1/stores/{Guid.NewGuid()}/payment-date", new { PaymentStartDate = "2026-07-01" });
        r.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Update_uses_route_id_not_body_id()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var target = await StoreSeed.SeedStoreAsync(_f, $"Target-{Guid.NewGuid():N}", approved: false);
        var decoy = await StoreSeed.SeedStoreAsync(_f, $"Decoy-{Guid.NewGuid():N}", approved: false);
        try
        {
            var newName = $"Routed-{Guid.NewGuid():N}";
            var r = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .PutAsJsonAsync($"/api/v1/stores/{target.StoreId}", Body(decoy.StoreId, newName, new[] { StoreSeed.ManagementModuleId }));
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            (await StoreSeed.GetStoreRowAsync(_f, target.StoreId)).Name.Should().Be(newName);
            (await StoreSeed.GetStoreRowAsync(_f, decoy.StoreId)).Name.Should().NotBe(newName);
        }
        finally { await StoreSeed.CleanupStoreFixtureAsync(_f, target); await StoreSeed.CleanupStoreFixtureAsync(_f, decoy); await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    [Fact]
    public async Task Update_name_colliding_with_another_store_returns_400_empty_errors()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var taken = $"Taken-{Guid.NewGuid():N}";
        var other = await StoreSeed.SeedStoreAsync(_f, taken, approved: false);
        var target = await StoreSeed.SeedStoreAsync(_f, $"Store-{Guid.NewGuid():N}", approved: false);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .PutAsJsonAsync($"/api/v1/stores/{target.StoreId}", Body(Guid.Empty, taken, new[] { StoreSeed.ManagementModuleId }));
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }
        finally { await StoreSeed.CleanupStoreFixtureAsync(_f, other); await StoreSeed.CleanupStoreFixtureAsync(_f, target); await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    [Fact]
    public async Task Update_unknown_id_returns_400_code_Id()
        => await AssertUpdate400(Guid.NewGuid(), Body(Guid.Empty, "x", new[] { StoreSeed.ManagementModuleId }), "Id", seedStore: false);

    [Fact]
    public async Task Update_empty_route_id_returns_400_code_Id()
        => await AssertUpdate400(Guid.Empty, Body(Guid.Empty, "x", new[] { StoreSeed.ManagementModuleId }), "Id", seedStore: false);

    [Fact]
    public async Task Update_empty_name_returns_400_code_Name()
        => await AssertUpdate400WithStore(fx => Body(Guid.Empty, "", new[] { StoreSeed.ManagementModuleId }), "Name");

    [Fact]
    public async Task Update_empty_modules_returns_400_code_ModuleIds()
        => await AssertUpdate400WithStore(fx => Body(Guid.Empty, $"n-{Guid.NewGuid():N}", Array.Empty<int>()), "ModuleIds");

    [Fact]
    public async Task Update_unavailable_module_returns_400_code_ModuleIds()
        => await AssertUpdate400WithStore(fx => Body(Guid.Empty, $"n-{Guid.NewGuid():N}", new[] { StoreSeed.UnavailableModuleId }), "ModuleIds");

    [Fact]
    public async Task Update_without_token_returns_401()
    {
        var r = await _f.CreateClient().PutAsJsonAsync($"/api/v1/stores/{Guid.NewGuid()}", Body(Guid.Empty, "x", new[] { StoreSeed.ManagementModuleId }));
        r.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    private async Task AssertUpdate400(Guid routeId, object body, string code, bool seedStore)
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, adminId, login).PutAsJsonAsync($"/api/v1/stores/{routeId}", body);
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Errors.Should().Contain(e => e.Code == code);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    private async Task AssertUpdate400WithStore(Func<StoreSeed.StoreFixture, object> body, string code)
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var fx = await StoreSeed.SeedStoreAsync(_f, $"Store-{Guid.NewGuid():N}", approved: false);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, adminId, login).PutAsJsonAsync($"/api/v1/stores/{fx.StoreId}", body(fx));
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Errors.Should().Contain(e => e.Code == code);
        }
        finally { await StoreSeed.CleanupStoreFixtureAsync(_f, fx); await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }
}