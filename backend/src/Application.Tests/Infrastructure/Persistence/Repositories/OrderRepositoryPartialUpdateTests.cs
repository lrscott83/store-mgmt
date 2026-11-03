using Application.Abstractions.HttpContext;
using Application.Services.Tenants;
using Domain.Common.Enums;
using Domain.Entities.Orders;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Infrastructure.Persistence.Repositories;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Moq;

namespace Application.Tests.Infrastructure.Persistence.Repositories;

/// <summary>
/// Las guardas de <c>UpdatePartialAsync</c>: son la red que convierte un fallo silencioso (no
/// escribir nada y devolver <c>true</c>, o descartar cambios pendientes de una entidad ya
/// rastreada) en una excepción. Se prueban aquí, con un contexto en memoria, porque no necesitan
/// PostgreSQL: son validación de argumentos y de estado del <c>ChangeTracker</c>.
/// </summary>
public class OrderRepositoryPartialUpdateTests
{
    private static (ApplicationDbContext Context, OrderRepository Repository, Order Order) CreateContextWithOrder()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        var httpContextMock = new Mock<IHttpContextService>();
        httpContextMock.Setup(x => x.IsSuperAdmin).Returns(true);
        httpContextMock.Setup(x => x.TenantId).Returns(Guid.NewGuid().ToString());
        httpContextMock.Setup(x => x.UserExternalId).Returns(Guid.NewGuid().ToString());

        var tenantProvider = new TenantIdProvider(new HttpContextAccessor());
        var context = new ApplicationDbContext(options, tenantProvider, httpContextMock.Object);

        // `ApplicationDbContext` es `NoTracking`: la entidad recién creada queda `Detached`, que es
        // justo la forma en la que los handlers la entregan al repositorio.
        var order = Order.CreateOnline(
            Guid.NewGuid(),
            Guid.NewGuid(),
            "GUARD01",
            OrderDeliveryType.Pickup,
            "Cliente",
            "555-0000",
            10m,
            Currency.CUP,
            Array.Empty<OrderLine>());

        return (context, new OrderRepository(context), order);
    }

    [Fact]
    public async Task UpdatePartialAsync_WithNoChangedFields_ShouldThrow()
    {
        var (_, repository, order) = CreateContextWithOrder();

        await FluentActions
            .Awaiting(() => repository.UpdatePartialAsync(order, OrderChangedField.None))
            .Should().ThrowAsync<ArgumentException>(
                "an empty set would report success while writing nothing");
    }

    [Fact]
    public async Task UpdatePartialAsync_WithAnUnmappedField_ShouldThrow()
    {
        var (_, repository, order) = CreateContextWithOrder();

        await FluentActions
            .Awaiting(() => repository.UpdatePartialAsync(order, (OrderChangedField)128))
            .Should().ThrowAsync<ArgumentOutOfRangeException>(
                "a new domain field must be mapped to a column or fail loudly");
    }

    [Fact]
    public async Task UpdatePartialAsync_WithAnAlreadyTrackedEntity_ShouldThrow()
    {
        var (context, repository, order) = CreateContextWithOrder();
        context.Attach(order);

        await FluentActions
            .Awaiting(() => repository.UpdatePartialAsync(order, OrderChangedField.Status))
            .Should().ThrowAsync<InvalidOperationException>(
                "resetting a tracked entity would discard its pending changes");
    }

    [Fact]
    public async Task UpdatePartialAsync_WithACancelledToken_ShouldThrow()
    {
        var (_, repository, order) = CreateContextWithOrder();
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        await FluentActions
            .Awaiting(() => repository.UpdatePartialAsync(order, OrderChangedField.Status, cts.Token))
            .Should().ThrowAsync<OperationCanceledException>();
    }

    [Fact]
    public async Task UpdatePartialAsync_WithAValidField_ShouldMarkOnlyThatColumn()
    {
        var (context, repository, order) = CreateContextWithOrder();

        await repository.UpdatePartialAsync(order, OrderChangedField.DriverId);

        var entry = context.Entry(order);
        entry.State.Should().Be(EntityState.Modified);
        entry.Property(nameof(Order.DriverId)).IsModified.Should().BeTrue();
        entry.Property(nameof(Order.Status)).IsModified.Should().BeFalse();
        entry.Property(nameof(Order.PaymentStatus)).IsModified.Should().BeFalse();
        entry.Property(nameof(Order.PaidAt)).IsModified.Should().BeFalse();
        entry.Property(nameof(Order.CancellationReason)).IsModified.Should().BeFalse();
    }
}
