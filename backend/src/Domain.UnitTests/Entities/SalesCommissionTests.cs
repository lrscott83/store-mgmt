using Domain.Common.Enums;
using Domain.Entities.OrderSalesCommissions;
using Domain.Entities.ProductSalesCommissions;
using Domain.Entities.SalesManagers;
using FluentAssertions;

namespace Domain.UnitTests.Entities;

/// <summary>
/// Reglas de dominio del módulo Gestores de ventas (T3): perfil Owner-level, configuración por
/// producto (% o fijo, nunca ambos) y comisión por línea con pago completo.
/// </summary>
public class SalesCommissionTests
{
    [Fact]
    public void SalesManager_Create_ShouldBelongToTheOwnerAndStartActive()
    {
        Guid userId = Guid.NewGuid();
        Guid ownerId = Guid.NewGuid();
        Guid tenantId = Guid.NewGuid();

        SalesManager manager = SalesManager.Create(userId, ownerId, tenantId);

        manager.UserId.Should().Be(userId);
        manager.OwnerId.Should().Be(ownerId);
        manager.TenantId.Should().Be(tenantId);
        manager.IsActive.Should().BeTrue("el perfil nace activo; la baja es lógica");
    }

    [Fact]
    public void SalesManager_Create_ShouldRejectEmptyIds()
    {
        Action noUser = () => SalesManager.Create(Guid.Empty, Guid.NewGuid(), Guid.NewGuid());
        Action noOwner = () => SalesManager.Create(Guid.NewGuid(), Guid.Empty, Guid.NewGuid());

        noUser.Should().Throw<ArgumentException>();
        noOwner.Should().Throw<ArgumentException>();
    }

    [Fact]
    public void ProductSalesCommission_Create_ShouldKeepTypeValueAndCurrency()
    {
        Guid productId = Guid.NewGuid();
        Guid storeId = Guid.NewGuid();

        ProductSalesCommission percentage = ProductSalesCommission.Create(
            storeId, productId, SalesCommissionType.Percentage, 12.5m, Currency.USD, Guid.NewGuid());

        percentage.Type.Should().Be(SalesCommissionType.Percentage);
        percentage.Value.Should().Be(12.5m);
        percentage.Currency.Should().Be(Currency.USD);
        percentage.ProductId.Should().Be(productId);
        percentage.StoreId.Should().Be(storeId);
    }

    [Fact]
    public void ProductSalesCommission_Create_ShouldRejectNegativeOrOverHundredPercent()
    {
        Action negative = () => ProductSalesCommission.Create(
            Guid.NewGuid(), Guid.NewGuid(), SalesCommissionType.Fixed, -1m, Currency.CUP, Guid.NewGuid());
        Action overHundred = () => ProductSalesCommission.Create(
            Guid.NewGuid(), Guid.NewGuid(), SalesCommissionType.Percentage, 100.01m, Currency.CUP, Guid.NewGuid());

        negative.Should().Throw<ArgumentOutOfRangeException>();
        overHundred.Should().Throw<ArgumentOutOfRangeException>();
    }

    private static OrderSalesCommission CreateCommission(decimal amount = 10m)
        => OrderSalesCommission.Create(
            Guid.NewGuid(),
            Guid.NewGuid(),
            Guid.NewGuid(),
            Guid.NewGuid(),
            Guid.NewGuid(),
            SalesCommissionType.Fixed,
            5m,
            50m,
            2,
            amount,
            Currency.CUP,
            Guid.NewGuid());

    [Fact]
    public void OrderSalesCommission_Create_ShouldStartPendingWithTheFrozenSnapshot()
    {
        OrderSalesCommission commission = CreateCommission();

        commission.Status.Should().Be(SalesCommissionStatus.Pending);
        commission.PaidAt.Should().BeNull();
        commission.PaidByUserId.Should().BeNull();
        commission.PaymentNote.Should().BeNull();
        commission.Amount.Should().Be(10m);
        commission.UnitPrice.Should().Be(50m);
        commission.Quantity.Should().Be(2);
        commission.Currency.Should().Be(Currency.CUP);
    }

    [Fact]
    public void MarkPaid_ShouldRecordTheCompletePayment()
    {
        OrderSalesCommission commission = CreateCommission();
        Guid ownerUserId = Guid.NewGuid();
        DateTimeOffset paidAt = DateTimeOffset.UtcNow;

        commission.MarkPaid(ownerUserId, paidAt, "efectivo");

        commission.Status.Should().Be(SalesCommissionStatus.Paid);
        commission.PaidAt.Should().Be(paidAt);
        commission.PaidByUserId.Should().Be(ownerUserId);
        commission.PaymentNote.Should().Be("efectivo");
    }

    [Fact]
    public void MarkPaid_ShouldRejectPayingTheSameCommissionTwice()
    {
        OrderSalesCommission commission = CreateCommission();
        commission.MarkPaid(Guid.NewGuid(), DateTimeOffset.UtcNow, null);

        Action again = () => commission.MarkPaid(Guid.NewGuid(), DateTimeOffset.UtcNow, null);

        again.Should().Throw<SalesCommissionAlreadyPaidException>();
    }
}
