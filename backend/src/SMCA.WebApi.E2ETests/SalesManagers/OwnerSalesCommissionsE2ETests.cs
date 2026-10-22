using System.Net;
using System.Net.Http.Json;
using Application.Dtos.SalesManagers;
using Domain.Common.Enums;
using Domain.Entities.OrderSalesCommissions;
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
/// T10: el Owner lista las comisiones de sus gestores (pendientes/pagadas), las filtra por estado
/// y registra el pago completo. El gestor no puede leer el listado del Owner.
/// </summary>
[Collection("e2e")]
public sealed class OwnerSalesCommissionsE2ETests
{
    private const string GestorPassword = "Password123";
    private readonly AppTestFactory _f;

    public OwnerSalesCommissionsE2ETests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Owner_lists_filters_pays_and_the_gestor_cannot_read_the_owner_listing()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        Guid gestorUserId = Guid.Empty;
        Guid managerId = Guid.Empty;
        Guid commissionId = Guid.Empty;
        string login = $"gestor-owner-list-{Guid.NewGuid():N}@test.com";
        string orderCode = $"O{Guid.NewGuid():N}"[..10];

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
                FullName = "E2E Gestor Cobros",
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

                Order order = Order.CreateOnline(
                    fixture.StoreId,
                    fixture.TenantId,
                    orderCode,
                    OrderDeliveryType.Pickup,
                    "Cliente Owner",
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

                Domain.Entities.OrderItems.OrderItem item = order.OrderItems.Single();
                OrderSalesCommission commission = OrderSalesCommission.Create(
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
                    fixture.TenantId);
                db.Set<OrderSalesCommission>().Add(commission);
                await db.SaveChangesAsync();
                commissionId = commission.Id;
            }

            var pending = await ownerClient.GetAsync("/api/v1/SalesCommissions?status=0");
            pending.StatusCode.Should().Be(HttpStatusCode.OK);
            var pendingBody = await pending.Content
                .ReadFromJsonAsync<ApiResponse<List<OwnerSalesCommissionDto>>>(ApiResponse.Json);
            var row = pendingBody!.Data!.Should()
                .ContainSingle(c => c.Id == commissionId).Subject;
            row.SalesManagerName.Should().Be("E2E Gestor Cobros");
            row.SalesManagerLogin.Should().Be(login);
            row.OrderCode.Should().Be(orderCode);
            row.Status.Should().Be(SalesCommissionStatus.Pending);

            var paidFilterBefore = await ownerClient.GetAsync("/api/v1/SalesCommissions?status=1");
            var paidBeforeBody = await paidFilterBefore.Content
                .ReadFromJsonAsync<ApiResponse<List<OwnerSalesCommissionDto>>>(ApiResponse.Json);
            paidBeforeBody!.Data.Should().BeEmpty();

            var pay = await ownerClient.PostAsJsonAsync(
                $"/api/v1/SalesCommissions/{commissionId}/pay",
                new { Note = "pago desde la lista del Owner" });
            pay.StatusCode.Should().Be(HttpStatusCode.OK);

            var paidFilterAfter = await ownerClient.GetAsync("/api/v1/SalesCommissions?status=1");
            var paidAfterBody = await paidFilterAfter.Content
                .ReadFromJsonAsync<ApiResponse<List<OwnerSalesCommissionDto>>>(ApiResponse.Json);
            paidAfterBody!.Data.Should().ContainSingle(c => c.Id == commissionId)
                .Which.Status.Should().Be(SalesCommissionStatus.Paid);

            var laCobrada = await ownerClient.GetAsync(
                $"/api/v1/SalesCommissions?salesManagerId={managerId}");
            var laCobradaBody = await laCobrada.Content
                .ReadFromJsonAsync<ApiResponse<List<OwnerSalesCommissionDto>>>(ApiResponse.Json);
            laCobradaBody!.Data.Should().ContainSingle(c => c.Id == commissionId);

            var gestorClient = DbTestHelpers.AuthedClient(_f, gestorUserId, login);
            var gestorAttempt = await gestorClient.GetAsync("/api/v1/SalesCommissions");
            gestorAttempt.StatusCode.Should().Be(HttpStatusCode.Forbidden,
                "el listado de cobros es del Owner; el gestor tiene su propio portal");
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
