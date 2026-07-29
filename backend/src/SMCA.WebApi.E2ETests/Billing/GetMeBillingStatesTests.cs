using System.Net;
using System.Net.Http.Json;
using Application.Dtos.Authentication;
using Domain.Common.Constants;
using Domain.Common.Enums;
using Domain.Entities.Owners;
using Domain.Entities.StoreModules;
using Domain.Entities.Stores;
using Domain.Entities.UserRoles;
using Domain.Entities.Users;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Billing;

[Collection("e2e")]
public sealed class GetMeBillingStatesTests
{
    private readonly WebAppFixture _fixture;
    private readonly AppTestFactory _f;

    private const int FreeModuleId = 7;
    private const int PaidModuleId = 6;

    public GetMeBillingStatesTests(WebAppFixture fixture)
    {
        _fixture = fixture;
        _f = fixture.Factory;
    }

    [Fact]
    public async Task Me_freeStore_returnsNoAplica_andKeepsAllModules()
    {
        var login = $"free-me-{Guid.NewGuid():N}@test.com";
        Guid userId = default;
        Guid storeId = default;
        try
        {
            (userId, storeId) = await SeedFreeStoreAsync(login);

            var response = await DbTestHelpers.AuthedClient(_f, userId, login)
                .GetAsync("/api/v1/auth/me");

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<CurrentUserDto>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();

            // NoAplica status for stores without PaymentStartDate
            body.Data!.PaymentStatus.Should().Be("NoAplica");
            // All modules (free) should be present — no filtering
            body.Data.StoreModuleIds.Should().Contain(FreeModuleId);
            body.Data.PaymentDueDate.Should().BeNull();
        }
        finally
        {
            await CleanupStoreAndUserAsync(storeId, userId);
        }
    }

    [Fact]
    public async Task Me_PorVencer_returnsStatus_andIncludesAllModules()
    {
        using var _ = _fixture.Clock.Pin(new DateTimeOffset(2026, 7, 15, 0, 0, 0, TimeSpan.Zero));

        var login = $"porvencer-me-{Guid.NewGuid():N}@test.com";
        Guid userId = default;
        Guid storeId = default;
        try
        {
            // PaymentStartDate set to May 18 → NextDueDate = May 18 + 2mo = Jul 18 → PorVencer in 3 days
            (userId, storeId) = await SeedStoreWithStartDateAsync(login, new DateOnly(2026, 5, 18));

            var response = await DbTestHelpers.AuthedClient(_f, userId, login)
                .GetAsync("/api/v1/auth/me");

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<CurrentUserDto>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();

            body.Data!.PaymentStatus.Should().Be("PorVencer");
            body.Data.StoreModuleIds.Should().Contain(FreeModuleId);
            body.Data.StoreModuleIds.Should().Contain(PaidModuleId);
            body.Data.PaymentDueDate.Should().NotBeNull();
        }
        finally
        {
            await CleanupStoreAndUserAsync(storeId, userId);
        }
    }

    [Fact]
    public async Task Me_EnGracia_returnsStatus_andIncludesAllModules()
    {
        using var _ = _fixture.Clock.Pin(new DateTimeOffset(2026, 7, 15, 0, 0, 0, TimeSpan.Zero));

        var login = $"engracia-me-{Guid.NewGuid():N}@test.com";
        Guid userId = default;
        Guid storeId = default;
        try
        {
            // PaymentStartDate set to May 10 → NextDueDate = May 10 + 2mo = Jul 10 → EnGracia (5 days past due)
            (userId, storeId) = await SeedStoreWithStartDateAsync(login, new DateOnly(2026, 5, 10));

            var response = await DbTestHelpers.AuthedClient(_f, userId, login)
                .GetAsync("/api/v1/auth/me");

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<CurrentUserDto>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();

            body.Data!.PaymentStatus.Should().Be("EnGracia");
            body.Data.StoreModuleIds.Should().Contain(FreeModuleId);
            body.Data.StoreModuleIds.Should().Contain(PaidModuleId);
            body.Data.PaymentDueDate.Should().NotBeNull();
        }
        finally
        {
            await CleanupStoreAndUserAsync(storeId, userId);
        }
    }

    private async Task<(Guid UserId, Guid StoreId)> SeedFreeStoreAsync(string login)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = DataUtils.DefaultTenant.Id;

        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"),
            "E2E Free ME", "0000000000", login, tenantId);
        db.Set<User>().Add(user);

        var owner = Owner.Create(user.Id, false, tenantId, "E2E Free ME Owner");
        db.Set<Owner>().Add(owner);
        await db.SaveChangesAsync();

        var store = Store.Create($"FreeMe-{Guid.NewGuid():N}", owner.Id, approved: true,
            tenantId, paymentStartDate: null);
        db.Set<Store>().Add(store);
        await db.SaveChangesAsync();

        // Free module (Management, PriceIncluded=true)
        db.Set<StoreModule>().Add(StoreModule.Create(
            store.Id, FreeModuleId, price: 0, modulePriceIncluded: true,
            modulePrice: 0, moduleDiscountPrice: 0, modulePercentDiscountPrice: 0, tenantId));

        user.SelectedStoreId = store.Id;
        db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.OwnerAdmin, tenantId));
        await db.SaveChangesAsync();

        return (user.Id, store.Id);
    }

    private async Task<(Guid UserId, Guid StoreId)> SeedStoreWithStartDateAsync(
        string login, DateOnly paymentStartDate)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = DataUtils.DefaultTenant.Id;

        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"),
            "E2E Billing ME", "0000000000", login, tenantId);
        db.Set<User>().Add(user);

        var owner = Owner.Create(user.Id, false, tenantId, "E2E Billing ME Owner");
        db.Set<Owner>().Add(owner);
        await db.SaveChangesAsync();

        var store = Store.Create($"BillingMe-{Guid.NewGuid():N}", owner.Id, approved: true,
            tenantId, paymentStartDate);
        db.Set<Store>().Add(store);
        await db.SaveChangesAsync();

        // Free module (Management, PriceIncluded=true)
        db.Set<StoreModule>().Add(StoreModule.Create(
            store.Id, FreeModuleId, price: 0, modulePriceIncluded: true,
            modulePrice: 0, moduleDiscountPrice: 0, modulePercentDiscountPrice: 0, tenantId));

        // Paid module (Statistics, PriceIncluded=false)
        db.Set<StoreModule>().Add(StoreModule.Create(
            store.Id, PaidModuleId, price: 2000, modulePriceIncluded: false,
            modulePrice: 2000, moduleDiscountPrice: 0, modulePercentDiscountPrice: 75, tenantId));

        user.SelectedStoreId = store.Id;
        db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.OwnerAdmin, tenantId));
        await db.SaveChangesAsync();

        return (user.Id, store.Id);
    }

    private async Task CleanupStoreAndUserAsync(Guid storeId, Guid userId)
    {
        if (storeId == default && userId == default) return;

        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        if (storeId != default)
        {
            db.Set<StoreModule>().RemoveRange(
                await db.Set<StoreModule>().IgnoreQueryFilters()
                    .Where(x => x.StoreId == storeId).ToListAsync());
            db.Set<Store>().RemoveRange(
                await db.Set<Store>().IgnoreQueryFilters()
                    .Where(x => x.Id == storeId).ToListAsync());
        }
        if (userId != default)
        {
            var owners = await db.Set<Owner>().IgnoreQueryFilters()
                .Where(x => x.UserId == userId).ToListAsync();
            db.Set<Owner>().RemoveRange(owners);

            db.Set<UserRole>().RemoveRange(
                await db.Set<UserRole>().IgnoreQueryFilters()
                    .Where(x => x.UserId == userId).ToListAsync());
            var user = await db.Set<User>().IgnoreQueryFilters()
                .FirstOrDefaultAsync(x => x.Id == userId);
            if (user is not null)
                db.Set<User>().Remove(user);
        }
        await db.SaveChangesAsync();
    }
}
