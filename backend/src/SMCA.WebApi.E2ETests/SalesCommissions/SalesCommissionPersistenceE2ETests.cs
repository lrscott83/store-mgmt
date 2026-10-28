using System.Net;
using System.Net.Http.Json;
using Application.Abstractions.HttpContext;
using Application.Features.OnlineOrdering.Commands.UpdateOrderStatus;
using Application.UnitOfWorks;
using Domain.Common.Enums;
using Domain.Entities.OrderItems;
using Domain.Entities.StoreModules;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using Domain.Entities.OrderSalesCommissions;
using Domain.Entities.OrderSalesManagers;
using Domain.Entities.Orders;
using Domain.Entities.ProductSalesCommissions;
using Domain.Entities.SalesManagers;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using SMCA.WebApi.E2ETests.Orders;
using Xunit;

namespace SMCA.WebApi.E2ETests.SalesCommissions;

/// <summary>
/// T3 del feature Gestores de ventas: las tres tablas del módulo existen y sobreviven a un
/// write/read real contra PostgreSQL, incluidos sus FKs y el pago completo.
///
/// No es un test de la generación automática (T6): aquí se crean las filas con las fábricas de
/// dominio y se prueba que EF las mapea y que el pago queda persistido.
/// </summary>
[Collection("e2e")]
public sealed class SalesCommissionPersistenceE2ETests
{
    private readonly AppTestFactory _f;

    public SalesCommissionPersistenceE2ETests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Sales_manager_product_config_and_commission_round_trip_through_postgres()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        Guid orderId = Guid.Empty;
        Guid orderItemId = Guid.Empty;
        Guid managerId = Guid.Empty;

        try
        {
            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

                Order order = await PublicOrderingSeed.SeedOnlineOrderAsync(_f, fixture, "E2ECOM1");
                OrderItem item = order.OrderItems.Single();
                orderId = order.Id;
                orderItemId = item.Id;

                SalesManager manager = SalesManager.Create(fixture.UserId, fixture.OwnerId, fixture.TenantId);
                managerId = manager.Id;

                ProductSalesCommission config = ProductSalesCommission.Create(
                    fixture.StoreId,
                    fixture.ProductId,
                    SalesCommissionType.Fixed,
                    5m,
                    Currency.CUP,
                    fixture.TenantId);

                OrderSalesCommission commission = OrderSalesCommission.Create(
                    order.Id,
                    item.Id,
                    manager.Id,
                    fixture.OwnerId,
                    fixture.StoreId,
                    SalesCommissionType.Fixed,
                    5m,
                    item.Price,
                    item.Quantity,
                    10m,
                    Currency.CUP,
                    fixture.TenantId);

                OrderSalesManager attribution = OrderSalesManager.Create(
                    order.Id,
                    manager.Id,
                    fixture.OwnerId,
                    fixture.StoreId,
                    fixture.TenantId);

                db.Set<SalesManager>().Add(manager);
                db.Set<ProductSalesCommission>().Add(config);
                db.Set<OrderSalesCommission>().Add(commission);
                db.Set<OrderSalesManager>().Add(attribution);
                await db.SaveChangesAsync();
            }

            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

                SalesManager manager = await db.Set<SalesManager>()
                    .IgnoreQueryFilters()
                    .SingleAsync(x => x.Id == managerId);
                manager.UserId.Should().Be(fixture.UserId);
                manager.OwnerId.Should().Be(fixture.OwnerId);
                manager.TenantId.Should().Be(fixture.TenantId);

                ProductSalesCommission config = await db.Set<ProductSalesCommission>()
                    .IgnoreQueryFilters()
                    .SingleAsync(x => x.ProductId == fixture.ProductId);
                config.StoreId.Should().Be(fixture.StoreId);
                config.Type.Should().Be(SalesCommissionType.Fixed);
                config.Value.Should().Be(5m);
                config.Currency.Should().Be(Currency.CUP);

                OrderSalesManager attribution = await db.Set<OrderSalesManager>()
                    .IgnoreQueryFilters()
                    .SingleAsync(x => x.OrderId == orderId);
                attribution.SalesManagerId.Should().Be(managerId);
                attribution.OwnerId.Should().Be(fixture.OwnerId);
                attribution.StoreId.Should().Be(fixture.StoreId);

                OrderSalesCommission commission = await db.Set<OrderSalesCommission>()
                    .IgnoreQueryFilters()
                    .SingleAsync(x => x.OrderItemId == orderItemId);
                commission.OrderId.Should().Be(orderId);
                commission.SalesManagerId.Should().Be(managerId);
                commission.OwnerId.Should().Be(fixture.OwnerId);
                commission.StoreId.Should().Be(fixture.StoreId);
                commission.UnitPrice.Should().Be(100m);
                commission.Quantity.Should().Be(2);
                commission.Amount.Should().Be(10m);
                commission.Currency.Should().Be(Currency.CUP);
                commission.Status.Should().Be(SalesCommissionStatus.Pending);

                DateTimeOffset paidAt = DateTimeOffset.UtcNow;
                commission.MarkPaid(fixture.UserId, paidAt, "pago E2E");
                db.Set<OrderSalesCommission>().Update(commission);
                await db.SaveChangesAsync();
            }

            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                OrderSalesCommission paid = await db.Set<OrderSalesCommission>()
                    .IgnoreQueryFilters()
                    .SingleAsync(x => x.OrderItemId == orderItemId);

                paid.Status.Should().Be(SalesCommissionStatus.Paid);
                paid.PaidByUserId.Should().Be(fixture.UserId);
                paid.PaidAt.Should().NotBeNull();
                paid.PaymentNote.Should().Be("pago E2E");
            }
        }
        finally
        {
            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                await db.Set<OrderSalesManager>().IgnoreQueryFilters()
                    .Where(x => x.OrderId == orderId).ExecuteDeleteAsync();
                await db.Set<OrderSalesCommission>().IgnoreQueryFilters()
                    .Where(x => x.OrderId == orderId).ExecuteDeleteAsync();
                await db.Set<ProductSalesCommission>().IgnoreQueryFilters()
                    .Where(x => x.ProductId == fixture.ProductId).ExecuteDeleteAsync();
                await db.Set<SalesManager>().IgnoreQueryFilters()
                    .Where(x => x.Id == managerId).ExecuteDeleteAsync();
            }

            await PublicOrderingSeed.CleanupAsync(_f, fixture);
        }
    }

    /// <summary>
    /// R3-002: la comisión no solo se construye en memoria; al entregar se persiste de verdad en
    /// PostgreSQL, en la misma transacción que el cambio de estado. Se ejecuta el handler real con
    /// los repositorios reales del fixture.
    /// </summary>
    [Fact]
    public async Task Delivered_order_persists_the_commission_in_postgres()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        Guid orderId = Guid.Empty;
        Guid orderItemId = Guid.Empty;
        Guid managerId = Guid.Empty;
        Guid commissionId = Guid.Empty;

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

                string code = "E2ECOM" + Guid.NewGuid().ToString("N")[..8];
                Order order = Order.CreateOnline(
                    fixture.StoreId,
                    fixture.TenantId,
                    code,
                    OrderDeliveryType.Pickup,
                    "Cliente Comisión",
                    fixture.Phone,
                    total: 200m,
                    currency: Currency.CUP,
                    [new OrderLine(fixture.ProductId, fixture.ProductName, 2, 100m, Currency.CUP, 100m, 0, 0)]);
                order.ChangeStatus(OrderStatus.Preparado);
                db.Set<Order>().Add(order);

                var manager = SalesManager.Create(fixture.UserId, fixture.OwnerId, fixture.TenantId);
                managerId = manager.Id;
                db.Set<SalesManager>().Add(manager);

                db.Set<OrderSalesManager>().Add(OrderSalesManager.Create(
                    order.Id, manager.Id, fixture.OwnerId, fixture.StoreId, fixture.TenantId));

                db.Set<ProductSalesCommission>().Add(ProductSalesCommission.Create(
                    fixture.StoreId,
                    fixture.ProductId,
                    SalesCommissionType.Fixed,
                    5m,
                    Currency.CUP,
                    fixture.TenantId));

                await db.SaveChangesAsync();

                orderId = order.Id;
                orderItemId = order.OrderItems.Single().Id;
            }

            using (var scope = _f.Services.CreateScope())
            {
                var sp = scope.ServiceProvider;
                // El handler corre en una petición con tenant; el test directo debe fijarlo para
                // que `GetByIdWithItemsAsync` y la configuración por producto no salgan vacíos.
                sp.GetRequiredService<ApplicationDbContext>()
                    .SetTenantContext(fixture.TenantId, isSuperAdmin: false);

                var handler = new UpdateOrderStatusCommandHandler(
                    sp.GetRequiredService<IApplicationUnitOfWork>(),
                    new StubHttpContextService(fixture.StoreId),
                    sp.GetRequiredService<IOrderRepository>(),
                    sp.GetRequiredService<IStringLocalizer<I18n>>(),
                    sp.GetRequiredService<IStoreModuleRepository>(),
                    sp.GetRequiredService<IOrderSalesManagerRepository>(),
                    sp.GetRequiredService<IProductSalesCommissionRepository>(),
                    sp.GetRequiredService<IOrderSalesCommissionRepository>());

                var result = await handler.Handle(
                    new UpdateOrderStatusCommand(orderId, OrderStatus.Entregado),
                    CancellationToken.None);

                result.Succeeded.Should().BeTrue();
            }

            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                OrderSalesCommission commission = await db.Set<OrderSalesCommission>()
                    .IgnoreQueryFilters()
                    .SingleAsync(x => x.OrderItemId == orderItemId);

                commission.Amount.Should().Be(10m, "5 fijo por unidad × 2 unidades");
                commission.Currency.Should().Be(Currency.CUP);
                commission.Status.Should().Be(SalesCommissionStatus.Pending);
                commission.StoreId.Should().Be(fixture.StoreId);
                commission.OwnerId.Should().Be(fixture.OwnerId);
                commission.TenantId.Should().Be(fixture.TenantId);
                commissionId = commission.Id;
            }

            // T7: el mismo Owner la marca pagada por el endpoint real.
            using (var scope = _f.Services.CreateScope())
            {
                var ownerClient = DbTestHelpers.AuthedClient(_f, fixture.UserId, fixture.Login);
                var payResponse = await ownerClient.PostAsJsonAsync(
                    $"/api/v1/SalesCommissions/{commissionId}/pay",
                    new { Note = "pago E2E" });

                payResponse.StatusCode.Should().Be(HttpStatusCode.OK);
                var payBody = await payResponse.Content
                    .ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json);
                payBody!.Succeeded.Should().BeTrue();
            }

            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                OrderSalesCommission paid = await db.Set<OrderSalesCommission>()
                    .IgnoreQueryFilters()
                    .SingleAsync(x => x.Id == commissionId);

                paid.Status.Should().Be(SalesCommissionStatus.Paid);
                paid.PaidByUserId.Should().Be(fixture.UserId);
                paid.PaymentNote.Should().Be("pago E2E");
            }
        }
        finally
        {
            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                await db.Set<OrderSalesCommission>().IgnoreQueryFilters()
                    .Where(x => x.OrderId == orderId).ExecuteDeleteAsync();
                await db.Set<OrderSalesManager>().IgnoreQueryFilters()
                    .Where(x => x.OrderId == orderId).ExecuteDeleteAsync();
                await db.Set<ProductSalesCommission>().IgnoreQueryFilters()
                    .Where(x => x.ProductId == fixture.ProductId).ExecuteDeleteAsync();
                if (managerId != Guid.Empty)
                {
                    await db.Set<SalesManager>().IgnoreQueryFilters()
                        .Where(x => x.Id == managerId).ExecuteDeleteAsync();
                }
                await db.Set<OrderItem>().IgnoreQueryFilters()
                    .Where(x => x.OrderId == orderId).ExecuteDeleteAsync();
                await db.Set<Order>().IgnoreQueryFilters()
                    .Where(x => x.Id == orderId).ExecuteDeleteAsync();
                await db.Set<StoreModule>().IgnoreQueryFilters()
                    .Where(x => x.StoreId == fixture.StoreId
                        && x.ModuleId == (int)ModuleType.GestoresVentas)
                    .ExecuteDeleteAsync();
            }

            await PublicOrderingSeed.CleanupAsync(_f, fixture);
        }
    }

    private sealed class StubHttpContextService : IHttpContextService
    {
        private readonly string _storeId;

        public StubHttpContextService(Guid storeId) => _storeId = storeId.ToString();

        public string AccessToken => string.Empty;
        public string UserExternalId => string.Empty;
        public string IPAddress => "127.0.0.1";
        public string GfDevice => string.Empty;
        public string GfDeviceId => string.Empty;
        public string GfSessionId => string.Empty;
        public bool IsSuperAdmin => false;
        public bool IsOwnerAdmin => true;
        public bool IsReSeller => false;
        public bool IsGestorVentas => false;
        public bool IsSuperAdminOrOwnerAdmin => IsSuperAdmin || IsOwnerAdmin;
        public string TenantId => string.Empty;
        public string StoreId => _storeId;
        public Task SignOutAsync() => Task.CompletedTask;
    }
}
