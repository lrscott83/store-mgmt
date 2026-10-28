using Application.Abstractions.HttpContext;
using Application.Exceptions;
using Application.Features.SalesManagers.Queries.GetMySalesManagerCommissions;
using Application.Features.SalesManagers.Queries.GetMySalesManagerOrders;
using Application.Features.SalesManagers.Queries.GetMySalesManagerStores;
using Domain.Common.Enums;
using Domain.Entities.OrderItems;
using Domain.Entities.OrderSalesCommissions;
using Domain.Entities.OrderSalesManagers;
using Domain.Entities.Orders;
using Domain.Entities.SalesManagers;
using Domain.Entities.Stores;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Moq;
using System.Net;

namespace Application.Tests.Features.SalesManagers;

/// <summary>
/// T9: la vista del gestor solo devuelve SUS pedidos, SUS comisiones y los catálogos de las
/// tiendas de su Owner con el módulo 21 activo. Un no-gestor nunca entra.
/// </summary>
public class SalesManagerPortalQueryTests
{
    private readonly Mock<IHttpContextService> _httpContextService = new();
    private readonly Mock<ISalesManagerRepository> _salesManagerRepository = new();
    private readonly Mock<IOrderSalesManagerRepository> _orderSalesManagerRepository = new();
    private readonly Mock<IOrderSalesCommissionRepository> _commissionRepository = new();
    private readonly Mock<IStoreRepository> _storeRepository = new();
    private readonly Mock<IStoreModuleRepository> _storeModuleRepository = new();

    private readonly Guid _tenantId = Guid.NewGuid();
    private readonly Guid _ownerId = Guid.NewGuid();
    private readonly Guid _userId = Guid.NewGuid();
    private readonly SalesManager _manager;
    private readonly Store _store;
    private readonly Order _order;
    private readonly DateTime _orderDate = new(2026, 10, 20, 9, 0, 0, DateTimeKind.Utc);

    public SalesManagerPortalQueryTests()
    {
        _manager = SalesManager.Create(_userId, _ownerId, _tenantId);
        _store = Store.Create("Tienda del Owner", _ownerId, true, _tenantId);
        _store.CatalogSlug = "tienda-owner";

        _order = Order.Create(_store.Id, OrderType.WhatsApp, "Pedido gestor", 100m, 2, _orderDate, _tenantId);
        _order.Code = "PED-001";
        _order.Status = OrderStatus.Entregado;
        _order.Currency = Currency.CUP;
        _order.Store = _store;

        _httpContextService.Setup(x => x.IsGestorVentas).Returns(true);
        _httpContextService.Setup(x => x.UserExternalId).Returns(_userId.ToString());
        _salesManagerRepository
            .Setup(x => x.GetByUserIdAsync(_userId, false))
            .ReturnsAsync(_manager);
    }

    private GetMySalesManagerOrdersQueryHandler OrdersHandler() => new(
        _httpContextService.Object,
        _salesManagerRepository.Object,
        _orderSalesManagerRepository.Object);

    private GetMySalesManagerCommissionsQueryHandler CommissionsHandler() => new(
        _httpContextService.Object,
        _salesManagerRepository.Object,
        _commissionRepository.Object);

    private GetMySalesManagerStoresQueryHandler StoresHandler() => new(
        _httpContextService.Object,
        _salesManagerRepository.Object,
        _storeRepository.Object,
        _storeModuleRepository.Object);

    [Fact]
    public async Task Orders_lists_only_the_attributed_orders_with_store_and_status()
    {
        OrderSalesManager attribution = OrderSalesManager.Create(
            _order.Id, _manager.Id, _ownerId, _store.Id, _tenantId);
        attribution.Order = _order;

        _orderSalesManagerRepository
            .Setup(x => x.GetBySalesManagerIdAsync(_manager.Id))
            .ReturnsAsync(new[] { attribution });

        var result = await OrdersHandler().Handle(
            new GetMySalesManagerOrdersQuery(), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data.Should().ContainSingle();
        var order = result.Data![0];
        order.OrderId.Should().Be(_order.Id);
        order.Code.Should().Be("PED-001");
        order.StoreName.Should().Be("Tienda del Owner");
        order.Status.Should().Be(OrderStatus.Entregado);
        order.Date.Should().Be(_orderDate);
        order.Total.Should().Be(100m);
    }

    [Fact]
    public async Task Orders_are_sorted_newest_first()
    {
        Order older = Order.Create(_store.Id, OrderType.WhatsApp, "Viejo", 10m, 1, _orderDate.AddDays(-1), _tenantId);
        older.Code = "PED-000";
        older.Store = _store;
        OrderSalesManager a1 = OrderSalesManager.Create(older.Id, _manager.Id, _ownerId, _store.Id, _tenantId);
        a1.Order = older;
        OrderSalesManager a2 = OrderSalesManager.Create(_order.Id, _manager.Id, _ownerId, _store.Id, _tenantId);
        a2.Order = _order;

        _orderSalesManagerRepository
            .Setup(x => x.GetBySalesManagerIdAsync(_manager.Id))
            .ReturnsAsync(new[] { a1, a2 });

        var result = await OrdersHandler().Handle(
            new GetMySalesManagerOrdersQuery(), CancellationToken.None);

        result.Data!.Select(o => o.Code).Should().ContainInOrder("PED-001", "PED-000");
    }

    [Fact]
    public async Task Commissions_map_the_frozen_snapshot_and_the_paid_state()
    {
        OrderItem item = OrderItem.Create(
            _order.Id, Guid.NewGuid(), "Camisa", 2, 50m, 1, _tenantId);
        item.Order = _order;

        OrderSalesCommission commission = OrderSalesCommission.Create(
            _order.Id,
            item.Id,
            _manager.Id,
            _ownerId,
            _store.Id,
            SalesCommissionType.Percentage,
            10m,
            50m,
            2,
            10m,
            Currency.CUP,
            _tenantId);
        commission.Order = _order;
        commission.OrderItem = item;
        commission.MarkPaid(Guid.NewGuid(), new DateTimeOffset(2026, 10, 21, 8, 0, 0, TimeSpan.Zero), "Pagada");

        _commissionRepository
            .Setup(x => x.GetBySalesManagerIdAsync(_manager.Id, null))
            .ReturnsAsync(new[] { commission });

        var result = await CommissionsHandler().Handle(
            new GetMySalesManagerCommissionsQuery(), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        var dto = result.Data!.Should().ContainSingle().Subject;
        dto.OrderCode.Should().Be("PED-001");
        dto.StoreName.Should().Be("Tienda del Owner");
        dto.ProductName.Should().Be("Camisa");
        dto.Quantity.Should().Be(2);
        dto.Type.Should().Be(SalesCommissionType.Percentage);
        dto.Value.Should().Be(10m);
        dto.UnitPrice.Should().Be(50m);
        dto.Amount.Should().Be(10m);
        dto.Currency.Should().Be(Currency.CUP);
        dto.Status.Should().Be(SalesCommissionStatus.Paid);
        dto.PaymentNote.Should().Be("Pagada");
    }

    [Fact]
    public async Task Stores_lists_only_owner_stores_with_catalog_and_the_module_active()
    {
        Store withModule = _store;
        Store withoutModule = Store.Create("Otra tienda", _ownerId, true, _tenantId);
        withoutModule.CatalogSlug = "otra-tienda";

        _storeRepository
            .Setup(x => x.GetActiveStoresWithCatalogByOwnerIdAsync(_ownerId))
            .ReturnsAsync(new[] { withModule, withoutModule });
        _storeModuleRepository
            .Setup(x => x.GetStoreIdsWithActiveModuleAsync(
                It.Is<IEnumerable<Guid>>(ids =>
                    ids.OrderBy(id => id).SequenceEqual(
                        new[] { withModule.Id, withoutModule.Id }.OrderBy(id => id))),
                (int)ModuleType.GestoresVentas,
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { withModule.Id });

        var result = await StoresHandler().Handle(
            new GetMySalesManagerStoresQuery(), CancellationToken.None);

        result.Data.Should().ContainSingle();
        result.Data![0].StoreId.Should().Be(withModule.Id);
        result.Data[0].CatalogSlug.Should().Be("tienda-owner");
        // El gating se resuelve en UNA consulta para toda la lista (sin N+1).
        _storeModuleRepository.Verify(
            x => x.GetPublicActiveModuleIdsByStoreIdAsync(It.IsAny<Guid>()), Times.Never);
    }

    [Fact]
    public async Task Orders_use_the_manager_resolved_from_the_token_and_never_another()
    {
        var otherManager = SalesManager.Create(Guid.NewGuid(), _ownerId, _tenantId);
        Order otherOrder = Order.Create(
            _store.Id, OrderType.WhatsApp, "Otro", 10m, 1, _orderDate.AddDays(-1), _tenantId);
        otherOrder.Code = "PED-999";
        otherOrder.Store = _store;
        OrderSalesManager otherAttribution = OrderSalesManager.Create(
            otherOrder.Id, otherManager.Id, _ownerId, _store.Id, _tenantId);
        otherAttribution.Order = otherOrder;
        OrderSalesManager mine = OrderSalesManager.Create(
            _order.Id, _manager.Id, _ownerId, _store.Id, _tenantId);
        mine.Order = _order;

        _orderSalesManagerRepository
            .Setup(x => x.GetBySalesManagerIdAsync(_manager.Id))
            .ReturnsAsync(new[] { mine });
        _orderSalesManagerRepository
            .Setup(x => x.GetBySalesManagerIdAsync(otherManager.Id))
            .ReturnsAsync(new[] { otherAttribution });

        var result = await OrdersHandler().Handle(
            new GetMySalesManagerOrdersQuery(), CancellationToken.None);

        result.Data.Should().ContainSingle();
        result.Data![0].Code.Should().Be("PED-001");
        _orderSalesManagerRepository.Verify(
            x => x.GetBySalesManagerIdAsync(_manager.Id), Times.Once);
        _orderSalesManagerRepository.Verify(
            x => x.GetBySalesManagerIdAsync(otherManager.Id), Times.Never);
    }

    [Fact]
    public async Task Rows_whose_order_or_item_is_not_visible_are_skipped_without_a_500()
    {
        OrderSalesManager orphan = OrderSalesManager.Create(
            Guid.NewGuid(), _manager.Id, _ownerId, _store.Id, _tenantId);
        orphan.Order = null!;
        _orderSalesManagerRepository
            .Setup(x => x.GetBySalesManagerIdAsync(_manager.Id))
            .ReturnsAsync(new[] { orphan });

        OrderItem item = OrderItem.Create(
            _order.Id, Guid.NewGuid(), "Camisa", 1, 10m, 1, _tenantId);
        OrderSalesCommission orphanCommission = OrderSalesCommission.Create(
            _order.Id,
            item.Id,
            _manager.Id,
            _ownerId,
            _store.Id,
            SalesCommissionType.Fixed,
            1m,
            10m,
            1,
            1m,
            Currency.CUP,
            _tenantId);
        orphanCommission.Order = null!;
        orphanCommission.OrderItem = item;
        _commissionRepository
            .Setup(x => x.GetBySalesManagerIdAsync(_manager.Id, null))
            .ReturnsAsync(new[] { orphanCommission });

        var orders = await OrdersHandler().Handle(
            new GetMySalesManagerOrdersQuery(), CancellationToken.None);
        var commissions = await CommissionsHandler().Handle(
            new GetMySalesManagerCommissionsQuery(), CancellationToken.None);

        orders.Data.Should().BeEmpty();
        commissions.Data.Should().BeEmpty();
    }

    [Fact]
    public async Task A_non_gestor_is_forbidden_in_every_query()
    {
        _httpContextService.Setup(x => x.IsGestorVentas).Returns(false);

        Func<Task> orders = () => OrdersHandler().Handle(
            new GetMySalesManagerOrdersQuery(), CancellationToken.None);
        Func<Task> commissions = () => CommissionsHandler().Handle(
            new GetMySalesManagerCommissionsQuery(), CancellationToken.None);
        Func<Task> stores = () => StoresHandler().Handle(
            new GetMySalesManagerStoresQuery(), CancellationToken.None);

        foreach (Func<Task> act in new[] { orders, commissions, stores })
        {
            (await act.Should().ThrowAsync<ApiException>())
                .Which.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
    }

    [Fact]
    public async Task A_user_without_a_sales_manager_profile_is_forbidden()
    {
        _salesManagerRepository
            .Setup(x => x.GetByUserIdAsync(_userId, false))
            .ReturnsAsync((SalesManager?)null);

        Func<Task> act = () => OrdersHandler().Handle(
            new GetMySalesManagerOrdersQuery(), CancellationToken.None);

        (await act.Should().ThrowAsync<ApiException>())
            .Which.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }
}
