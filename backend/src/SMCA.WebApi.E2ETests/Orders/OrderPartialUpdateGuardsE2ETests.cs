using System.Net;
using System.Net.Http.Json;
using Domain.Common.Enums;
using Domain.Entities.DeliveryDrivers;
using Domain.Entities.Orders;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Infrastructure.Persistence.Repositories;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Orders;

[Collection("e2e")]
public sealed class OrderPartialUpdateGuardsE2ETests
{
    private readonly AppTestFactory _f;
    public OrderPartialUpdateGuardsE2ETests(WebAppFixture fixture) => _f = fixture.Factory;

    private async Task<Order> ReadAsync(Guid id)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await db.Set<Order>().IgnoreQueryFilters().AsNoTracking().FirstAsync(o => o.Id == id);
    }

    [Fact]
    public async Task Partial_patch_still_stamps_UpdatedDate_and_UpdatedBy()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        try
        {
            var seeded = await PublicOrderingSeed.SeedOnlineOrderAsync(_f, fixture, "GUARDAUDIT");
            var client = DbTestHelpers.AuthedClient(_f, fixture.UserId, fixture.Login);
            (await ReadAsync(seeded.Id)).UpdatedDate.Should().BeNull();

            (await client.PatchAsJsonAsync($"/api/v1/online-orders/{seeded.Id}/payment",
                new { paymentStatus = (int)OrderPaymentStatus.Paid })).StatusCode.Should().Be(HttpStatusCode.OK);
            var afterPay = await ReadAsync(seeded.Id);
            afterPay.UpdatedDate.Should().NotBeNull("a partial UPDATE must keep the audit stamp");
            afterPay.UpdatedBy.Should().Be(fixture.UserId);

            // Sentinela: la marca de auditoría se retrasa a un instante conocido y el PATCH tiene
            // que avanzarla. Un `Task.Delay` "para que pase el tiempo" acopla el test al reloj y
            // añade un segundo de espera; un valor puesto a mano es determinista.
            var sentinel = DateTimeOffset.UtcNow.AddDays(-1);
            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                await db.Set<Order>().IgnoreQueryFilters()
                    .Where(o => o.Id == seeded.Id)
                    .ExecuteUpdateAsync(setters => setters.SetProperty(o => o.UpdatedDate, sentinel));
            }

            (await client.PatchAsJsonAsync($"/api/v1/online-orders/{seeded.Id}/status",
                new { status = (int)OrderStatus.Preparado })).StatusCode.Should().Be(HttpStatusCode.OK);
            var afterStatus = await ReadAsync(seeded.Id);
            afterStatus.UpdatedDate.Should().BeAfter(sentinel,
                "the partial UPDATE must advance the audit stamp it inherited");
            afterStatus.UpdatedBy.Should().Be(fixture.UserId);
            afterStatus.PaymentStatus.Should().Be(OrderPaymentStatus.Paid);
        }
        finally { await PublicOrderingSeed.CleanupAsync(_f, fixture); }
    }

    [Fact]
    public async Task Status_write_interleaved_after_a_payment_write_does_not_clobber_the_payment()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        try
        {
            var seeded = await PublicOrderingSeed.SeedOnlineOrderAsync(_f, fixture, "GUARDLOST");
            using var scopeA = _f.Services.CreateScope();
            var dbA = scopeA.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var repoA = new OrderRepository(dbA);
            var orderA = await dbA.Set<Order>().IgnoreQueryFilters().AsNoTracking().FirstAsync(o => o.Id == seeded.Id);
            orderA.ChangeStatus(OrderStatus.Preparado);
            OrderChangedField changedStatus = OrderChangedField.Status;

            using (var scopeB = _f.Services.CreateScope())
            {
                var dbB = scopeB.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var orderB = await dbB.Set<Order>().IgnoreQueryFilters().AsNoTracking().FirstAsync(o => o.Id == seeded.Id);
                orderB.ChangePaymentStatus(OrderPaymentStatus.Paid);
                await new OrderRepository(dbB).UpdateAsync(orderB);
                await dbB.SaveChangesAsync();
            }

            await repoA.UpdatePartialAsync(orderA, changedStatus);
            await dbA.SaveChangesAsync();

            var after = await ReadAsync(seeded.Id);
            after.Status.Should().Be(OrderStatus.Preparado);
            after.PaymentStatus.Should().Be(OrderPaymentStatus.Paid,
                "the concurrent payment write must survive the later status write");
            after.PaidAt.Should().NotBeNull();
            after.UpdatedDate.Should().NotBeNull();
        }
        finally { await PublicOrderingSeed.CleanupAsync(_f, fixture); }
    }

    [Fact]
    public async Task Cancelado_persists_the_reason_through_the_partial_path()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        try
        {
            var seeded = await PublicOrderingSeed.SeedOnlineOrderAsync(_f, fixture, "GUARDCANCEL");
            var client = DbTestHelpers.AuthedClient(_f, fixture.UserId, fixture.Login);

            var response = await client.PatchAsJsonAsync($"/api/v1/online-orders/{seeded.Id}/status",
                new { status = (int)OrderStatus.Cancelado, cancellationReason = "  cliente desistió  " });
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            var after = await ReadAsync(seeded.Id);
            after.Status.Should().Be(OrderStatus.Cancelado);
            after.CancellationReason.Should().Be("cliente desistió",
                "the CancellationReason column must reach the database through the partial path");
        }
        finally { await PublicOrderingSeed.CleanupAsync(_f, fixture); }
    }

    [Fact]
    public async Task Driver_column_is_persisted_through_the_partial_path()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        List<Guid> orderIds = [];
        List<Guid> driverIds = [];
        try
        {
            var seeded = await PublicOrderingSeed.SeedOnlineOrderAsync(_f, fixture, "GUARDDRIVER");
            orderIds.Add(seeded.Id);
            Guid driverId = await SeedDriverAsync(seeded.Id);
            driverIds.Add(driverId);

            // Por el ENDPOINT, no por el repositorio: el contrato que usa el panel es el PATCH, y
            // una ruta que delegara en un guardado de fila entera tiene que romper este test.
            var client = DbTestHelpers.AuthedClient(_f, fixture.UserId, fixture.Login);
            var response = await client.PatchAsJsonAsync(
                $"/api/v1/online-orders/{seeded.Id}/driver", new { driverId });
            response.StatusCode.Should().Be(HttpStatusCode.OK,
                "the seeded driver is active and belongs to the session store");

            (await ReadAsync(seeded.Id)).DriverId.Should().Be(driverId,
                "the DriverId column must reach the database through the partial path");
        }
        finally
        {
            await ClearDriversAsync(orderIds, driverIds);
            await PublicOrderingSeed.CleanupAsync(_f, fixture);
        }
    }

    [Fact]
    public async Task Driver_write_and_status_write_survive_each_other_in_both_orders()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        List<Guid> orderIds = [];
        List<Guid> driverIds = [];
        try
        {
            // (a) driver written first, then a status write built from a stale read.
            var first = await PublicOrderingSeed.SeedOnlineOrderAsync(_f, fixture, "GUARDDRV1");
            orderIds.Add(first.Id);
            Guid driverId = await SeedDriverAsync(first.Id);
            driverIds.Add(driverId);

            Order staleStatus;
            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                staleStatus = await db.Set<Order>().IgnoreQueryFilters().AsNoTracking()
                    .FirstAsync(o => o.Id == first.Id);
            }
            staleStatus.ChangeStatus(OrderStatus.Preparado);

            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var order = await db.Set<Order>().IgnoreQueryFilters().AsNoTracking()
                    .FirstAsync(o => o.Id == first.Id);
                order.DriverId = driverId;

                await new OrderRepository(db).UpdatePartialAsync(order, OrderChangedField.DriverId);
                await db.SaveChangesAsync();
            }

            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                await new OrderRepository(db).UpdatePartialAsync(staleStatus, OrderChangedField.Status);
                await db.SaveChangesAsync();
            }

            var afterFirst = await ReadAsync(first.Id);
            afterFirst.DriverId.Should().Be(driverId,
                "the concurrent driver write must survive the later status write");
            afterFirst.Status.Should().Be(OrderStatus.Preparado);

            // (b) status written first, then a driver write built from a stale read.
            var second = await PublicOrderingSeed.SeedOnlineOrderAsync(_f, fixture, "GUARDDRV2");
            orderIds.Add(second.Id);
            Guid secondDriverId = await SeedDriverAsync(second.Id);
            driverIds.Add(secondDriverId);

            Order staleDriver;
            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                staleDriver = await db.Set<Order>().IgnoreQueryFilters().AsNoTracking()
                    .FirstAsync(o => o.Id == second.Id);
            }
            staleDriver.DriverId = secondDriverId;

            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var order = await db.Set<Order>().IgnoreQueryFilters().AsNoTracking()
                    .FirstAsync(o => o.Id == second.Id);
                order.ChangeStatus(OrderStatus.Preparado);

                await new OrderRepository(db).UpdatePartialAsync(order, OrderChangedField.Status);
                await db.SaveChangesAsync();
            }

            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                await new OrderRepository(db).UpdatePartialAsync(staleDriver, OrderChangedField.DriverId);
                await db.SaveChangesAsync();
            }

            var afterSecond = await ReadAsync(second.Id);
            afterSecond.Status.Should().Be(OrderStatus.Preparado,
                "the concurrent status write must survive the later driver write");
            afterSecond.DriverId.Should().Be(secondDriverId);
        }
        finally
        {
            await ClearDriversAsync(orderIds, driverIds);
            await PublicOrderingSeed.CleanupAsync(_f, fixture);
        }
    }

    [Fact]
    public async Task Partial_update_refuses_an_empty_set_and_an_already_tracked_entity()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        try
        {
            var seeded = await PublicOrderingSeed.SeedOnlineOrderAsync(_f, fixture, "GUARDRAILS");

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var repository = new OrderRepository(db);
            var order = await db.Set<Order>().IgnoreQueryFilters().AsNoTracking()
                .FirstAsync(o => o.Id == seeded.Id);

            await FluentActions
                .Awaiting(() => repository.UpdatePartialAsync(order, OrderChangedField.None))
                .Should().ThrowAsync<ArgumentException>(
                    "an empty set would report success while writing nothing");

            await FluentActions
                .Awaiting(() => repository.UpdatePartialAsync(order, (OrderChangedField)128))
                .Should().ThrowAsync<ArgumentOutOfRangeException>(
                    "a new domain field must be mapped to a column or fail loudly");

            db.Attach(order);
            await FluentActions
                .Awaiting(() => repository.UpdatePartialAsync(order, OrderChangedField.Status))
                .Should().ThrowAsync<InvalidOperationException>(
                    "resetting a tracked entity would discard its pending changes");
        }
        finally { await PublicOrderingSeed.CleanupAsync(_f, fixture); }
    }

    [Fact]
    public async Task Delivery_persists_its_own_columns_and_leaves_the_rest_untouched()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        try
        {
            var seeded = await PublicOrderingSeed.SeedOnlineOrderAsync(_f, fixture, "GUARDDELIVER");
            var client = DbTestHelpers.AuthedClient(_f, fixture.UserId, fixture.Login);

            var before = await ReadAsync(seeded.Id);

            (await client.PatchAsJsonAsync($"/api/v1/online-orders/{seeded.Id}/status",
                new { status = (int)OrderStatus.Preparado })).StatusCode.Should().Be(HttpStatusCode.OK);
            (await client.PatchAsJsonAsync($"/api/v1/online-orders/{seeded.Id}/status",
                new { status = (int)OrderStatus.Entregado })).StatusCode.Should().Be(HttpStatusCode.OK);

            var after = await ReadAsync(seeded.Id);
            after.Status.Should().Be(OrderStatus.Entregado);
            after.PaymentStatus.Should().Be(OrderPaymentStatus.Paid);
            after.PaidAt.Should().NotBeNull();

            // La comisión que genera la entrega escribe filas PROPIAS: lo que no está en el conjunto
            // de campos cambiados tiene que sobrevivir intacto, o la escritura parcial estaría
            // perdiendo columnas que el guardado de fila entera sí llevaba.
            after.Notes.Should().Be(before.Notes);
            after.CustomerName.Should().Be(before.CustomerName);
            after.CustomerPhone.Should().Be(before.CustomerPhone);
            after.Description.Should().Be(before.Description);
            after.Total.Should().Be(before.Total);
            after.Code.Should().Be(before.Code);
        }
        finally { await PublicOrderingSeed.CleanupAsync(_f, fixture); }
    }

    /// <summary>
    /// Crea el repartidor que exige la FK `FK_Order_DeliveryDriver_DriverId`. Va en su propio
    /// contexto a propósito: el pedido se lee en `NoTracking` en el contexto del caso, y reutilizar
    /// ese contexto para insertar dejaría la entidad rastreada y rompería el guard de
    /// `UpdatePartialAsync`.
    /// </summary>
    private async Task<Guid> SeedDriverAsync(Guid orderId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var order = await db.Set<Order>().IgnoreQueryFilters().AsNoTracking()
            .FirstAsync(o => o.Id == orderId);

        var driver = DeliveryDriver.Create(order.StoreId, "Guard Driver", "555-0000", order.TenantId);
        db.Set<DeliveryDriver>().Add(driver);
        await db.SaveChangesAsync();
        return driver.Id;
    }

    /// <summary>
    /// Suelta los repartidores ANTES del cleanup compartido: la fila vive en la base con FK desde
    /// `Order` y hasta la tienda, así que borrarla en medio dejaría el cleanup con una violación de
    /// clave ajena. Se anula la referencia del pedido y después se borra el repartidor.
    /// </summary>
    private async Task ClearDriversAsync(
        IReadOnlyCollection<Guid> orderIds, IReadOnlyCollection<Guid> driverIds)
    {
        if (driverIds.Count == 0) return;

        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        if (orderIds.Count > 0)
        {
            await db.Set<Order>().IgnoreQueryFilters()
                .Where(o => orderIds.Contains(o.Id))
                .ExecuteUpdateAsync(setters => setters.SetProperty(o => o.DriverId, (Guid?)null));
        }

        await db.Set<DeliveryDriver>().IgnoreQueryFilters()
            .Where(d => driverIds.Contains(d.Id))
            .ExecuteDeleteAsync();
    }
}
