using Application.Abstractions.HttpContext;
using Application.Exceptions;
using Application.Features.SalesManagers.Queries.GetOwnerSalesCommissions;
using Domain.Common.Enums;
using Domain.Entities.OrderItems;
using Domain.Entities.OrderSalesCommissions;
using Domain.Entities.Orders;
using Domain.Entities.Owners;
using Domain.Entities.SalesManagers;
using Domain.Entities.Stores;
using Domain.Entities.Users;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Moq;
using System.Net;

namespace Application.Tests.Features.SalesManagers;

/// <summary>
/// T10: el Owner ve las comisiones de todos sus gestores, con filtros por estado y por gestor.
/// Un no-Owner no entra.
/// </summary>
public class OwnerSalesCommissionsQueryTests
{
    private readonly Mock<IHttpContextService> _httpContextService = new();
    private readonly Mock<IOwnerRepository> _ownerRepository = new();
    private readonly Mock<IOrderSalesCommissionRepository> _commissionRepository = new();

    private readonly Guid _tenantId = Guid.NewGuid();
    private readonly Owner _owner;
    private readonly SalesManager _manager;
    private readonly Store _store;
    private readonly Order _order;
    private readonly OrderItem _item;
    private readonly DateTime _orderDate = new(2026, 10, 20, 9, 0, 0, DateTimeKind.Utc);

    public OwnerSalesCommissionsQueryTests()
    {
        _owner = Owner.Create(Guid.NewGuid(), false, _tenantId, "Owner Comisiones");
        User user = User.Create(
            "gestor@test.com", "hash", "Gestor Uno", "0000000000", "gestor@test.com", _tenantId);
        _manager = SalesManager.Create(user.Id, _owner.Id, _tenantId);
        _manager.User = user;

        _store = Store.Create("Tienda", _owner.Id, true, _tenantId);
        _order = Order.Create(_store.Id, OrderType.WhatsApp, "Pedido", 100m, 2, _orderDate, _tenantId);
        _order.Code = "PED-100";
        _order.Store = _store;
        _item = OrderItem.Create(_order.Id, Guid.NewGuid(), "Camisa", 2, 50m, 1, _tenantId);
        _item.Order = _order;

        _httpContextService.Setup(x => x.IsOwnerAdmin).Returns(true);
        _httpContextService.Setup(x => x.UserExternalId).Returns(_owner.UserId.ToString());
        _ownerRepository
            .Setup(x => x.GetByUserIdIgnoreQueryFiltersAsync(_owner.UserId))
            .ReturnsAsync(_owner);
    }

    private GetOwnerSalesCommissionsQueryHandler Handler() => new(
        _httpContextService.Object,
        _ownerRepository.Object,
        _commissionRepository.Object);

    private OrderSalesCommission Commission(SalesCommissionStatus status = SalesCommissionStatus.Pending)
    {
        OrderSalesCommission commission = OrderSalesCommission.Create(
            _order.Id,
            _item.Id,
            _manager.Id,
            _owner.Id,
            _store.Id,
            SalesCommissionType.Fixed,
            5m,
            50m,
            2,
            10m,
            Currency.CUP,
            _tenantId);
        commission.Order = _order;
        commission.OrderItem = _item;
        commission.SalesManager = _manager;
        if (status == SalesCommissionStatus.Paid)
        {
            commission.MarkPaid(_owner.UserId, DateTimeOffset.UtcNow, "pagada");
        }
        return commission;
    }

    [Fact]
    public async Task Owner_lists_every_commission_with_its_gestor_and_order()
    {
        _commissionRepository
            .Setup(x => x.GetByOwnerIdAsync(_owner.Id, null))
            .ReturnsAsync(new[] { Commission() });

        var result = await Handler().Handle(
            new GetOwnerSalesCommissionsQuery(null, null), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        var dto = result.Data!.Should().ContainSingle().Subject;
        dto.SalesManagerId.Should().Be(_manager.Id);
        dto.SalesManagerName.Should().Be("Gestor Uno");
        dto.SalesManagerLogin.Should().Be("gestor@test.com");
        dto.OrderCode.Should().Be("PED-100");
        dto.StoreName.Should().Be("Tienda");
        dto.ProductName.Should().Be("Camisa");
        dto.Amount.Should().Be(10m);
        dto.Status.Should().Be(SalesCommissionStatus.Pending);
    }

    [Fact]
    public async Task Filters_by_status_and_by_gestor()
    {
        var otherManager = SalesManager.Create(Guid.NewGuid(), _owner.Id, _tenantId);
        OrderSalesCommission paid = Commission(SalesCommissionStatus.Paid);
        OrderSalesCommission other = Commission();
        other.SalesManagerId = otherManager.Id;
        other.SalesManager = otherManager;

        _commissionRepository
            .Setup(x => x.GetByOwnerIdAsync(_owner.Id, SalesCommissionStatus.Paid))
            .ReturnsAsync(new[] { paid, other });

        var result = await Handler().Handle(
            new GetOwnerSalesCommissionsQuery(SalesCommissionStatus.Paid, _manager.Id),
            CancellationToken.None);

        // El estado lo filtra el repositorio; el gestor, el handler.
        result.Data.Should().ContainSingle(c => c.Id == paid.Id && c.Status == SalesCommissionStatus.Paid);
    }

    [Fact]
    public async Task Pending_commissions_are_listed_before_paid_ones()
    {
        OrderSalesCommission paid = Commission(SalesCommissionStatus.Paid);
        OrderSalesCommission pending = Commission();

        _commissionRepository
            .Setup(x => x.GetByOwnerIdAsync(_owner.Id, null))
            .ReturnsAsync(new[] { paid, pending });

        var result = await Handler().Handle(
            new GetOwnerSalesCommissionsQuery(null, null), CancellationToken.None);

        result.Data!.Select(c => c.Status).Should().ContainInOrder(
            SalesCommissionStatus.Pending,
            SalesCommissionStatus.Paid);
    }

    [Fact]
    public async Task A_non_owner_is_forbidden()
    {
        _httpContextService.Setup(x => x.IsOwnerAdmin).Returns(false);

        Func<Task> act = () => Handler().Handle(
            new GetOwnerSalesCommissionsQuery(null, null), CancellationToken.None);

        (await act.Should().ThrowAsync<ApiException>())
            .Which.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task An_inactive_or_missing_owner_is_forbidden()
    {
        _ownerRepository
            .Setup(x => x.GetByUserIdIgnoreQueryFiltersAsync(_owner.UserId))
            .ReturnsAsync((Owner?)null);

        Func<Task> act = () => Handler().Handle(
            new GetOwnerSalesCommissionsQuery(null, null), CancellationToken.None);

        (await act.Should().ThrowAsync<ApiException>())
            .Which.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }
}
