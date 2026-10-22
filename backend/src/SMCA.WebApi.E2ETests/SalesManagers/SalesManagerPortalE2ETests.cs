using System.Net;
using System.Net.Http.Json;
using Application.Dtos.SalesManagers;
using Domain.Common.Enums;
using Domain.Entities.OrderSalesCommissions;
using Domain.Entities.OrderSalesManagers;
using Domain.Entities.Orders;
using Domain.Entities.SalesManagers;
using Domain.Entities.StoreModules;
using Domain.Entities.StoreRoleFeatures;
using Domain.Entities.Stores;
using Domain.Entities.UserRoles;
using Domain.Entities.Users;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using SMCA.WebApi.E2ETests.Orders;
using Xunit;

namespace SMCA.WebApi.E2ETests.SalesManagers;

/// <summary>
/// T9: la vista del gestor contra la base real. Devuelve SOLO sus pedidos y comisiones, los
/// catálogos de las tiendas del Owner con el módulo 21 activo, y rechaza a cualquier no-gestor.
/// </summary>
[Collection("e2e")]
public sealed class SalesManagerPortalE2ETests
{
    private const string GestorPassword = "Password123";
    private readonly AppTestFactory _f;

    public SalesManagerPortalE2ETests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Gestor_reads_his_orders_commissions_and_the_owner_catalogs()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        Guid gestorUserId = Guid.Empty;
        Guid managerId = Guid.Empty;
        string login = $"gestor-portal-{Guid.NewGuid():N}@test.com";
        string orderCode = $"P{Guid.NewGuid():N}"[..10];
        string catalogSlug = $"gestor-{Guid.NewGuid():N}";

        try
        {
            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                Store store = await db.Set<Store>().IgnoreQueryFilters()
                    .SingleAsync(s => s.Id == fixture.StoreId);
                store.CatalogSlug = catalogSlug;
                // ApplicationDbContext es NoTracking: mutar la fila cargada no escribe nada
                // sin este Update explícito.
                db.Set<Store>().Update(store);

                db.Set<StoreModule>().Add(StoreModule.Create(
                    fixture.StoreId,
                    (int)ModuleType.GestoresVentas,
                    price: 10,
                    modulePriceIncluded: false,
                    modulePrice: 20,
                    moduleDiscountPrice: 0,
                    modulePercentDiscountPrice: 50,
                    tenantId: fixture.TenantId));
                db.Set<StoreRoleFeature>().Add(StoreRoleFeature.Create(
                    fixture.StoreId,
                    (int)RoleType.OwnerAdmin,
                    (int)FeatureType.GestoresVentas,
                    fixture.TenantId));
                await db.SaveChangesAsync();
            }

            var ownerClient = DbTestHelpers.AuthedClient(_f, fixture.UserId, fixture.Login);
            var create = await ownerClient.PostAsJsonAsync("/api/v1/SalesManagers", new
            {
                Login = login,
                Password = GestorPassword,
                FullName = "E2E Gestor Portal",
                CellPhone = "0000000000",
                Email = login,
            });
            create.StatusCode.Should().Be(HttpStatusCode.OK);

            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                User user = await db.Set<User>().IgnoreQueryFilters()
                    .SingleAsync(u => u.Login == login);
                gestorUserId = user.Id;
                SalesManager manager = await db.Set<SalesManager>().IgnoreQueryFilters()
                    .SingleAsync(m => m.UserId == user.Id);
                managerId = manager.Id;

                Order order = Order.CreateOnline(
                    fixture.StoreId,
                    fixture.TenantId,
                    orderCode,
                    OrderDeliveryType.Pickup,
                    "Cliente del gestor",
                    "5351234567",
                    100m,
                    Currency.CUP,
                    new[]
                    {
                        new OrderLine(fixture.ProductId, fixture.ProductName, 2, 50m, Currency.CUP),
                    });
                order.Status = OrderStatus.Entregado;
                db.Set<Order>().Add(order);

                db.Set<OrderSalesManager>().Add(OrderSalesManager.Create(
                    order.Id, managerId, fixture.OwnerId, fixture.StoreId, fixture.TenantId));

                Domain.Entities.OrderItems.OrderItem item = order.OrderItems.Single();                db.Set<OrderSalesCommission>().Add(OrderSalesCommission.Create(
                    order.Id,
                    item.Id,
                    managerId,
                    fixture.OwnerId,
                    fixture.StoreId,
                    SalesCommissionType.Fixed,
                    5m,
                    50m,
                    2,
                    10m,
                    Currency.CUP,
                    fixture.TenantId));

                await db.SaveChangesAsync();
            }

            var gestorClient = DbTestHelpers.AuthedClient(_f, gestorUserId, login);

            var ordersResponse = await gestorClient.GetAsync("/api/v1/sales-managers/orders");
            ordersResponse.StatusCode.Should().Be(HttpStatusCode.OK);
            var orders = await ordersResponse.Content
                .ReadFromJsonAsync<ApiResponse<List<SalesManagerOrderDto>>>(ApiResponse.Json);
            orders!.Data.Should().ContainSingle(o =>
                o.Code == orderCode
                && o.Status == OrderStatus.Entregado
                && o.StoreName.Length > 0
                && o.Total == 100m);

            var commissionsResponse = await gestorClient.GetAsync("/api/v1/sales-managers/commissions");
            commissionsResponse.StatusCode.Should().Be(HttpStatusCode.OK);
            var commissions = await commissionsResponse.Content
                .ReadFromJsonAsync<ApiResponse<List<SalesManagerCommissionDto>>>(ApiResponse.Json);
            commissions!.Data.Should().ContainSingle(c =>
                c.OrderCode == orderCode
                && c.ProductName == fixture.ProductName
                && c.Amount == 10m
                && c.Currency == Currency.CUP
                && c.Status == SalesCommissionStatus.Pending);

            var storesResponse = await gestorClient.GetAsync("/api/v1/sales-managers/stores");
            storesResponse.StatusCode.Should().Be(HttpStatusCode.OK);
            var stores = await storesResponse.Content
                .ReadFromJsonAsync<ApiResponse<List<SalesManagerCatalogDto>>>(ApiResponse.Json);
            stores!.Data.Should().ContainSingle(s =>
                s.StoreId == fixture.StoreId && s.CatalogSlug == catalogSlug);

            var ownerOrders = await ownerClient.GetAsync("/api/v1/sales-managers/orders");
            var ownerCommissions = await ownerClient.GetAsync("/api/v1/sales-managers/commissions");
            var ownerStores = await ownerClient.GetAsync("/api/v1/sales-managers/stores");
            ownerOrders.StatusCode.Should().Be(HttpStatusCode.Forbidden);
            ownerCommissions.StatusCode.Should().Be(HttpStatusCode.Forbidden);
            ownerStores.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        finally
        {
            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                await db.Set<OrderSalesCommission>().IgnoreQueryFilters()
                    .Where(c => c.StoreId == fixture.StoreId).ExecuteDeleteAsync();
                await db.Set<OrderSalesManager>().IgnoreQueryFilters()
                    .Where(a => a.StoreId == fixture.StoreId).ExecuteDeleteAsync();
                await db.Set<StoreRoleFeature>().IgnoreQueryFilters()
                    .Where(x => x.StoreId == fixture.StoreId
                        && x.FeatureId == (int)FeatureType.GestoresVentas)
                    .ExecuteDeleteAsync();
                await db.Set<StoreModule>().IgnoreQueryFilters()
                    .Where(x => x.StoreId == fixture.StoreId
                        && x.ModuleId == (int)ModuleType.GestoresVentas)
                    .ExecuteDeleteAsync();

                if (managerId != Guid.Empty)
                {
                    await db.Set<SalesManager>().IgnoreQueryFilters()
                        .Where(m => m.Id == managerId).ExecuteDeleteAsync();
                }
                if (gestorUserId != Guid.Empty)
                {
                    await db.Set<UserRole>().IgnoreQueryFilters()
                        .Where(ur => ur.UserId == gestorUserId).ExecuteDeleteAsync();
                    await db.Set<User>().IgnoreQueryFilters()
                        .Where(u => u.Id == gestorUserId).ExecuteDeleteAsync();
                }
            }

            await PublicOrderingSeed.CleanupAsync(_f, fixture);
        }
    }
}
