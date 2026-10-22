using Application.Abstractions.HttpContext;
using Application.Features.OnlineOrdering.Commands.UpdateOrderStatus;
using Application.UnitOfWorks;
using Domain.Common.Enums;
using Domain.Entities.OrderItems;
using Domain.Entities.OrderSalesCommissions;
using Domain.Entities.OrderSalesManagers;
using Domain.Entities.Orders;
using Domain.Entities.ProductSalesCommissions;
using Domain.Entities.SalesManagers;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;

namespace Application.Tests.Features.OnlineOrdering;

/// <summary>
/// T6: la comisión nace al pasar a `Entregado`, en la misma transacción. Cubre el gate del módulo
/// 21, la atribución, la configuración vigente por producto, el porcentaje/fijo por unidad y la
/// omisión de líneas sin configuración.
/// </summary>
public class UpdateOrderStatusCommissionTests
{
    private readonly Mock<IApplicationUnitOfWork> _unitOfWork = new();
    private readonly Mock<IHttpContextService> _httpContextService = new();
    private readonly Mock<IOrderRepository> _orderRepository = new();
    private readonly Mock<IStoreModuleRepository> _storeModuleRepository = new();
    private readonly Mock<IOrderSalesManagerRepository> _orderSalesManagerRepository = new();
    private readonly Mock<IProductSalesCommissionRepository> _productSalesCommissionRepository = new();
    private readonly Mock<IOrderSalesCommissionRepository> _orderSalesCommissionRepository = new();
    private readonly Mock<IStringLocalizer<I18n>> _localizer = new();
    private readonly List<OrderSalesCommission> _added = [];

    private readonly Guid _storeId = Guid.NewGuid();
    private readonly Guid _tenantId = Guid.NewGuid();
    private readonly Guid _ownerId = Guid.NewGuid();

    public UpdateOrderStatusCommissionTests()
    {
        _localizer
            .Setup(x => x[It.IsAny<string>(), It.IsAny<object[]>()])
            .Returns<string, object[]>((name, args) =>
                new LocalizedString(name, args is { Length: > 0 } ? $"{name}:{string.Join(',', args)}" : name));

        _httpContextService.Setup(x => x.StoreId).Returns(_storeId.ToString());
        _httpContextService.Setup(x => x.UserExternalId).Returns(Guid.NewGuid().ToString());
        _unitOfWork.Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>())).ReturnsAsync(1);
        _orderRepository.Setup(x => x.UpdateAsync(It.IsAny<Order>())).ReturnsAsync(true);

        _productSalesCommissionRepository
            .Setup(x => x.GetByProductIdAsync(It.IsAny<Guid>()))
            .ReturnsAsync((ProductSalesCommission?)null);
        _orderSalesCommissionRepository
            .Setup(x => x.GetByOrderItemIdAsync(It.IsAny<Guid>()))
            .ReturnsAsync((OrderSalesCommission?)null);
        _orderSalesCommissionRepository
            .Setup(x => x.AddAsync(It.IsAny<OrderSalesCommission>()))
            .Callback<OrderSalesCommission>(_added.Add)
            .ReturnsAsync((OrderSalesCommission c) => c);
    }

    private UpdateOrderStatusCommandHandler Handler() => new(
        _unitOfWork.Object,
        _httpContextService.Object,
        _orderRepository.Object,
        _localizer.Object,
        _storeModuleRepository.Object,
        _orderSalesManagerRepository.Object,
        _productSalesCommissionRepository.Object,
        _orderSalesCommissionRepository.Object);

    private Order OrderWithItems(params (Guid ProductId, int Quantity, decimal Price)[] lines)
    {
        Order order = Order.CreateOnline(
            _storeId,
            _tenantId,
            "PED-42",
            OrderDeliveryType.Pickup,
            "Ana",
            "+5350000000",
            lines.Sum(l => l.Price * l.Quantity),
            Currency.CUP,
            [.. lines.Select(l => new OrderLine(
                l.ProductId, "Producto", l.Quantity, l.Price, Currency.CUP, l.Price, 0, 0))]);

        order.Status = OrderStatus.Preparado;
        return order;
    }

    private void Setup(Order order, bool moduleActive, OrderSalesManager? attribution)
    {
        _orderRepository
            .Setup(x => x.GetByIdWithItemsAsync(_storeId, order.Id))
            .ReturnsAsync(order);
        _storeModuleRepository
            .Setup(x => x.GetPublicActiveModuleIdsByStoreIdAsync(_storeId))
            .ReturnsAsync(moduleActive
                ? [(int)ModuleType.PedidosWhatsApp, (int)ModuleType.GestoresVentas]
                : [(int)ModuleType.PedidosWhatsApp]);
        _orderSalesManagerRepository
            .Setup(x => x.GetByOrderIdAsync(order.Id))
            .ReturnsAsync(attribution);
    }

    private OrderSalesManager AttributionFor(Order order)
    {
        var manager = SalesManager.Create(Guid.NewGuid(), _ownerId, _tenantId);
        return OrderSalesManager.Create(order.Id, manager.Id, _ownerId, _storeId, _tenantId);
    }

    [Fact]
    public async Task Delivered_attributed_order_creates_one_commission_per_configured_line()
    {
        Guid productPercentage = Guid.NewGuid();
        Guid productFixed = Guid.NewGuid();
        Order order = OrderWithItems((productPercentage, 2, 100m), (productFixed, 3, 50m));
        Setup(order, moduleActive: true, AttributionFor(order));

        _productSalesCommissionRepository
            .Setup(x => x.GetByProductIdAsync(productPercentage))
            .ReturnsAsync(ProductSalesCommission.Create(
                _storeId, productPercentage, SalesCommissionType.Percentage, 10m, Currency.CUP, _tenantId));
        _productSalesCommissionRepository
            .Setup(x => x.GetByProductIdAsync(productFixed))
            .ReturnsAsync(ProductSalesCommission.Create(
                _storeId, productFixed, SalesCommissionType.Fixed, 5m, Currency.USD, _tenantId));

        await Handler().Handle(
            new UpdateOrderStatusCommand(order.Id, OrderStatus.Entregado), CancellationToken.None);

        _added.Should().HaveCount(2);
        _added.Select(c => c.Amount).Should().BeEquivalentTo([20m, 15m]);
        _added.Should().OnlyContain(c => c.Status == SalesCommissionStatus.Pending);
        _added.Should().OnlyContain(c => c.UnitPrice > 0 && c.Quantity > 0);

        OrderSalesCommission percentage = _added.Single(c => c.Currency == Currency.CUP);
        percentage.Type.Should().Be(SalesCommissionType.Percentage);
        percentage.Value.Should().Be(10m);
        percentage.UnitPrice.Should().Be(100m);
        percentage.Quantity.Should().Be(2);

        OrderSalesCommission fixedCommission = _added.Single(c => c.Currency == Currency.USD);
        fixedCommission.Type.Should().Be(SalesCommissionType.Fixed);
        fixedCommission.Value.Should().Be(5m);
        fixedCommission.Amount.Should().Be(15m, "el fijo es por unidad: 3 unidades = 3 veces");
    }

    [Fact]
    public async Task Delivered_order_without_module_21_creates_nothing()
    {
        Guid productId = Guid.NewGuid();
        Order order = OrderWithItems((productId, 1, 100m));
        Setup(order, moduleActive: false, AttributionFor(order));

        await Handler().Handle(
            new UpdateOrderStatusCommand(order.Id, OrderStatus.Entregado), CancellationToken.None);

        _added.Should().BeEmpty();
        _orderSalesManagerRepository.Verify(x => x.GetByOrderIdAsync(It.IsAny<Guid>()), Times.Never);
    }

    [Fact]
    public async Task Delivered_order_without_attribution_creates_nothing()
    {
        Guid productId = Guid.NewGuid();
        Order order = OrderWithItems((productId, 1, 100m));
        Setup(order, moduleActive: true, attribution: null);

        await Handler().Handle(
            new UpdateOrderStatusCommand(order.Id, OrderStatus.Entregado), CancellationToken.None);

        _added.Should().BeEmpty();
    }

    [Fact]
    public async Task Delivered_order_skips_lines_without_configuration()
    {
        Guid configured = Guid.NewGuid();
        Guid unconfigured = Guid.NewGuid();
        Order order = OrderWithItems((configured, 1, 100m), (unconfigured, 1, 100m));
        Setup(order, moduleActive: true, AttributionFor(order));

        _productSalesCommissionRepository
            .Setup(x => x.GetByProductIdAsync(configured))
            .ReturnsAsync(ProductSalesCommission.Create(
                _storeId, configured, SalesCommissionType.Fixed, 5m, Currency.CUP, _tenantId));

        await Handler().Handle(
            new UpdateOrderStatusCommand(order.Id, OrderStatus.Entregado), CancellationToken.None);

        _added.Should().ContainSingle();
        _added[0].Amount.Should().Be(5m);
    }

    [Fact]
    public async Task Percentage_rounds_the_unit_commission_to_two_decimals_before_quantity()
    {
        Guid productId = Guid.NewGuid();
        Order order = OrderWithItems((productId, 3, 9.99m));
        Setup(order, moduleActive: true, AttributionFor(order));

        _productSalesCommissionRepository
            .Setup(x => x.GetByProductIdAsync(productId))
            .ReturnsAsync(ProductSalesCommission.Create(
                _storeId, productId, SalesCommissionType.Percentage, 12.5m, Currency.CUP, _tenantId));

        await Handler().Handle(
            new UpdateOrderStatusCommand(order.Id, OrderStatus.Entregado), CancellationToken.None);

        _added.Should().ContainSingle();
        _added[0].Amount.Should().Be(3.75m, "9.99 × 12.5% = 1.24875 → 1.25 por unidad × 3");
    }

    /// <summary>
    /// R3-001: si la comisión de una línea ya existe, la generación no la duplica. Es la rama que
    /// el índice único de `OrderItemId` respalda en la base.
    /// </summary>
    [Fact]
    public async Task Existing_commission_for_an_item_is_not_duplicated()
    {
        Guid productId = Guid.NewGuid();
        Order order = OrderWithItems((productId, 2, 100m));
        OrderSalesManager attribution = AttributionFor(order);
        Setup(order, moduleActive: true, attribution);

        _productSalesCommissionRepository
            .Setup(x => x.GetByProductIdAsync(productId))
            .ReturnsAsync(ProductSalesCommission.Create(
                _storeId, productId, SalesCommissionType.Fixed, 5m, Currency.CUP, _tenantId));

        OrderItem item = order.OrderItems.Single();
        var existing = OrderSalesCommission.Create(
            order.Id,
            item.Id,
            attribution.SalesManagerId,
            attribution.OwnerId,
            _storeId,
            SalesCommissionType.Fixed,
            5m,
            item.Price,
            item.Quantity,
            10m,
            Currency.CUP,
            _tenantId);

        _orderSalesCommissionRepository
            .Setup(x => x.GetByOrderItemIdAsync(item.Id))
            .ReturnsAsync(existing);

        var result = await Handler().Handle(
            new UpdateOrderStatusCommand(order.Id, OrderStatus.Entregado), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        _orderSalesCommissionRepository.Verify(x => x.GetByOrderItemIdAsync(item.Id), Times.Once);
        _added.Should().BeEmpty();
        _orderSalesCommissionRepository.Verify(
            x => x.AddAsync(It.IsAny<OrderSalesCommission>()), Times.Never);
    }
}
