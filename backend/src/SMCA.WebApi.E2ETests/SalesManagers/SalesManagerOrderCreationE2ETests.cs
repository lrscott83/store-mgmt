using System.Net;
using System.Net.Http.Json;
using Application.Features.OnlineOrdering.Commands.CreateOnlineOrder;
using Domain.Common.Enums;
using Domain.Entities.OrderSalesManagers;
using Domain.Entities.Orders;
using Domain.Entities.SalesManagers;
using Domain.Entities.StoreModules;
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
/// T5b/T9: el alta de pedido del GESTOR contra la base real. El servidor atribuye el pedido al
/// gestor del token (no al cuerpo), exige el módulo 21 y rechaza a quien no es gestor.
/// </summary>
[Collection("e2e")]
public sealed class SalesManagerOrderCreationE2ETests
{
    private const string GestorPassword = "Password123";
    private readonly AppTestFactory _f;

    public SalesManagerOrderCreationE2ETests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Gestor_creates_a_catalog_order_and_the_server_attributes_it()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        Guid gestorUserId = Guid.Empty;
        Guid managerId = Guid.Empty;
        string login = $"gestor-order-{Guid.NewGuid():N}@test.com";
        string? createdCode = null;

        try
        {
            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                db.Set<StoreModule>().Add(StoreModule.Create(
                    fixture.StoreId,
                    (int)ModuleType.GestoresVentas,
                    price: 10,
                    modulePriceIncluded: false,
                    modulePrice: 20,
                    moduleDiscountPrice: 0,
                    modulePercentDiscountPrice: 50,
                    tenantId: fixture.TenantId));
                await db.SaveChangesAsync();
            }

            var ownerClient = DbTestHelpers.AuthedClient(_f, fixture.UserId, fixture.Login);
            var create = await ownerClient.PostAsJsonAsync("/api/v1/SalesManagers", new
            {
                Login = login,
                Password = GestorPassword,
                FullName = "E2E Gestor Pedidos",
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
                managerId = (await db.Set<SalesManager>().IgnoreQueryFilters()
                    .SingleAsync(m => m.UserId == user.Id)).Id;
            }

            var gestorClient = DbTestHelpers.AuthedClient(_f, gestorUserId, login);
            var body = PublicOrderingSeed.CreateOrderBody(fixture.ProductId, fixture.Phone);

            var response = await gestorClient.PostAsJsonAsync(
                $"/api/v1/sales-managers/orders/{fixture.Slug}", body);
            response.StatusCode.Should().Be(HttpStatusCode.OK,
                "el gestor tiene el módulo 21 y la tienda es de su Owner");

            var created = await response.Content
                .ReadFromJsonAsync<ApiResponse<OnlineOrderCreatedDto>>(ApiResponse.Json);
            created!.Succeeded.Should().BeTrue();
            createdCode = created.Data!.Code;
            createdCode.Should().NotBeNullOrWhiteSpace();

            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                Order order = await db.Set<Order>().IgnoreQueryFilters()
                    .SingleAsync(o => o.StoreId == fixture.StoreId && o.Code == createdCode);
                order.Status.Should().Be(OrderStatus.Creado);

                OrderSalesManager attribution = await db.Set<OrderSalesManager>().IgnoreQueryFilters()
                    .SingleAsync(a => a.OrderId == order.Id);
                attribution.SalesManagerId.Should().Be(managerId);
                attribution.OwnerId.Should().Be(fixture.OwnerId);
                attribution.StoreId.Should().Be(fixture.StoreId);
            }

            var ownerAttempt = await ownerClient.PostAsJsonAsync(
                $"/api/v1/sales-managers/orders/{fixture.Slug}", body);
            ownerAttempt.StatusCode.Should().Be(HttpStatusCode.Forbidden,
                "el endpoint es gestor-only: el Owner no se auto-atribuye pedidos");
        }
        finally
        {
            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                await db.Set<OrderSalesManager>().IgnoreQueryFilters()
                    .Where(a => a.StoreId == fixture.StoreId).ExecuteDeleteAsync();
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
