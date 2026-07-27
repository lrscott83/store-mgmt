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
public sealed class GetMeBillingTests
{
    private readonly WebAppFixture _fixture;
    private readonly AppTestFactory _factory;

    // Free module: Management (id=7, PriceIncluded=true)
    private const int FreeModuleId = 7;
    // Paid module: Statistics (id=6, PriceIncluded=false)
    private const int PaidModuleId = 6;

    public GetMeBillingTests(WebAppFixture fixture)
    {
        _fixture = fixture;
        _factory = fixture.Factory;
    }

    [Fact]
    public async Task Me_overdue_store_excludes_paid_modules_and_shows_Vencido()
    {
        var login = $"billing-over-{Guid.NewGuid():N}@test.com";
        Guid userId = default;
        Guid storeId = default;
        try
        {
            // Arrange: seed an overdue store (PaymentStartDate far in the past, no payments)
            (userId, storeId) = await SeedOverdueStoreAsync(login);

            var response = await DbTestHelpers.AuthedClient(_factory, userId, login)
                .GetAsync("/api/v1/auth/me");

            // Assert
            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<CurrentUserDto>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();

            // Only free module should be present (paid module filtered out)
            body.Data!.StoreModuleIds.Should().Contain(FreeModuleId);
            body.Data.StoreModuleIds.Should().NotContain(PaidModuleId);

            // Payment status should be Vencido (overdue past grace)
            body.Data.PaymentStatus.Should().Be("Vencido");
            body.Data.PaymentDueDate.Should().NotBeNull();
        }
        finally
        {
            await CleanupStoreAndUserAsync(storeId, userId);
        }
    }

    [Fact]
    public async Task Me_active_store_includes_all_modules_and_shows_AlDia()
    {
        var login = $"billing-act-{Guid.NewGuid():N}@test.com";
        Guid userId = default;
        Guid storeId = default;
        try
        {
            // Arrange: seed an active store (just activated, in trial)
            (userId, storeId) = await SeedActiveStoreAsync(login);

            var response = await DbTestHelpers.AuthedClient(_factory, userId, login)
                .GetAsync("/api/v1/auth/me");

            // Assert
            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<CurrentUserDto>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();

            // Both free and paid modules should be present
            body.Data!.StoreModuleIds.Should().Contain(FreeModuleId);
            body.Data.StoreModuleIds.Should().Contain(PaidModuleId);

            // Payment status should be AlDia or PorVencer (within trial)
            body.Data.PaymentStatus.Should().BeOneOf("AlDia", "PorVencer");
            body.Data.PaymentDueDate.Should().NotBeNull();
        }
        finally
        {
            await CleanupStoreAndUserAsync(storeId, userId);
        }
    }

    private async Task<(Guid UserId, Guid StoreId)> SeedOverdueStoreAsync(string login)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = DataUtils.DefaultTenant.Id;

        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"),
            "E2E Billing Overdue", "0000000000", login, tenantId);
        db.Set<User>().Add(user);

        var owner = Owner.Create(user.Id, false, tenantId, "E2E Billing Overdue Owner");
        db.Set<Owner>().Add(owner);
        await db.SaveChangesAsync();

        var store = Store.Create($"OverdueStore-{Guid.NewGuid():N}", owner.Id, approved: true,
            tenantId, paymentStartDate: new DateOnly(2020, 1, 1));
        db.Set<Store>().Add(store);
        await db.SaveChangesAsync();

        // Add free module (Management, PriceIncluded=true)
        db.Set<StoreModule>().Add(StoreModule.Create(
            store.Id, FreeModuleId, price: 0, modulePriceIncluded: true,
            modulePrice: 0, moduleDiscountPrice: 0, modulePercentDiscountPrice: 0, tenantId));

        // Add paid module (Statistics, PriceIncluded=false)
        db.Set<StoreModule>().Add(StoreModule.Create(
            store.Id, PaidModuleId, price: 2000, modulePriceIncluded: false,
            modulePrice: 2000, moduleDiscountPrice: 0, modulePercentDiscountPrice: 75, tenantId));

        user.SelectedStoreId = store.Id;
        db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.OwnerAdmin, tenantId));
        await db.SaveChangesAsync();

        return (user.Id, store.Id);
    }

    private async Task<(Guid UserId, Guid StoreId)> SeedActiveStoreAsync(string login)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = DataUtils.DefaultTenant.Id;
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"),
            "E2E Billing Active", "0000000000", login, tenantId);
        db.Set<User>().Add(user);

        var owner = Owner.Create(user.Id, false, tenantId, "E2E Billing Active Owner");
        db.Set<Owner>().Add(owner);
        await db.SaveChangesAsync();

        var store = Store.Create($"ActiveStore-{Guid.NewGuid():N}", owner.Id, approved: true,
            tenantId, paymentStartDate: today);
        db.Set<Store>().Add(store);
        await db.SaveChangesAsync();

        // Add free module (Management, PriceIncluded=true)
        db.Set<StoreModule>().Add(StoreModule.Create(
            store.Id, FreeModuleId, price: 0, modulePriceIncluded: true,
            modulePrice: 0, moduleDiscountPrice: 0, modulePercentDiscountPrice: 0, tenantId));

        // Add paid module (Statistics, PriceIncluded=false)
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

        using var scope = _factory.Services.CreateScope();
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
            // Must delete Owner first (FK_Owner_User_UserId) before User
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
