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

/// <summary>
/// Regla (2026-09-06): una tienda cuyo "modo de pago" vale CERO (todos los módulos
/// de pago con 100% de descuento) NO entra en trial — el cartel "Probando el plan
/// de pago. Primer cobro..." no debe mostrarse tras el login. El trial solo aplica
/// cuando el plan tiene un valor real pendiente de cobro.
/// </summary>
[Collection("e2e")]
public sealed class GetMeBillingZeroAmountTests
{
    private readonly WebAppFixture _fixture;
    private readonly AppTestFactory _factory;

    // Free module: Management (id=7, PriceIncluded=true)
    private const int FreeModuleId = 7;
    // Paid module: Statistics (id=6, PriceIncluded=false)
    private const int PaidModuleId = 6;

    public GetMeBillingZeroAmountTests(WebAppFixture fixture)
    {
        _fixture = fixture;
        _factory = fixture.Factory;
    }

    [Fact]
    public async Task Me_full_discount_store_is_NOT_in_trial()
    {
        var login = $"billing-zero-{Guid.NewGuid():N}@test.com";
        Guid userId = default;
        Guid storeId = default;
        try
        {
            // Arrange: módulo de pago con 100% de descuento → monto efectivo 0.
            (userId, storeId) = await SeedStoreAsync(login, percentDiscount: 100);

            var response = await DbTestHelpers.AuthedClient(_factory, userId, login)
                .GetAsync("/api/v1/auth/me");

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<CurrentUserDto>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();

            // El cartel de trial se alimenta de IsInTrial — con valor 0 no debe salir.
            body.Data!.IsInTrial.Should().BeFalse();
            body.Data.PaymentStatus.Should().Be("AlDia");
        }
        finally
        {
            await CleanupStoreAndUserAsync(storeId, userId);
        }
    }

    [Fact]
    public async Task Me_partial_discount_store_IS_in_trial()
    {
        var login = $"billing-part-{Guid.NewGuid():N}@test.com";
        Guid userId = default;
        Guid storeId = default;
        try
        {
            // Arrange: módulo de pago con descuento parcial (25%) → monto efectivo > 0.
            (userId, storeId) = await SeedStoreAsync(login, percentDiscount: 25);

            var response = await DbTestHelpers.AuthedClient(_factory, userId, login)
                .GetAsync("/api/v1/auth/me");

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<CurrentUserDto>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();

            // Con valor real pendiente, el trial sí aplica (comportamiento actual).
            body.Data!.IsInTrial.Should().BeTrue();
        }
        finally
        {
            await CleanupStoreAndUserAsync(storeId, userId);
        }
    }

    private async Task<(Guid UserId, Guid StoreId)> SeedStoreAsync(string login, float percentDiscount)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = DataUtils.DefaultTenant.Id;
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"),
            "E2E Billing Zero", "0000000000", login, tenantId);
        db.Set<User>().Add(user);

        var owner = Owner.Create(user.Id, false, tenantId, "E2E Billing Zero Owner");
        db.Set<Owner>().Add(owner);
        await db.SaveChangesAsync();

        var store = Store.Create($"ZeroStore-{Guid.NewGuid():N}", owner.Id, approved: true,
            tenantId, paymentStartDate: today);
        db.Set<Store>().Add(store);
        await db.SaveChangesAsync();

        db.Set<StoreModule>().Add(StoreModule.Create(
            store.Id, FreeModuleId, price: 0, modulePriceIncluded: true,
            modulePrice: 0, moduleDiscountPrice: 0, modulePercentDiscountPrice: 0, tenantId));

        // price 2000 con percentDiscount 100 → efectivo 0; con 25 → efectivo 1500.
        db.Set<StoreModule>().Add(StoreModule.Create(
            store.Id, PaidModuleId, price: 2000, modulePriceIncluded: false,
            modulePrice: 2000, moduleDiscountPrice: 0, modulePercentDiscountPrice: percentDiscount, tenantId));

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
