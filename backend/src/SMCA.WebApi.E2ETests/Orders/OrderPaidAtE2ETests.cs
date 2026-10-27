using System.Net;
using System.Net.Http.Json;
using Application.Dtos.OnlineOrdering;
using Domain.Common.Enums;
using Domain.Entities.Orders;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Orders;

/// <summary>
/// Fecha de pago del pedido online (heap R3 `paidat-persistence-unproved`): lo que los unitarios
/// NO pueden probar —que `PaidAt` cruce el write/read por Npgsql— contra PostgreSQL real.
///
/// Los tests de `Application.Tests` mutan un `Order` en memoria y comparan el DTO mapeado desde ESE
/// objeto. Si el handler guardara la entidad sin la columna, o si EF dejara de materializarla por el
/// setter privado, la suite unitaria seguiría verde: nunca pasa por la base. Aquí se afirma la FILA
/// (`IgnoreQueryFilters`, scope nuevo) y además que el detalle HTTP devuelve ESE mismo valor, no uno
/// recalculado.
///
/// Reutiliza `PublicOrderingSeed` (tienda con slug, `OwnerAdmin`, tienda seleccionada, módulos 19 y
/// 20 y un pedido `Creado`/`Pending`). No toca ningún archivo del harness: todo lo que necesita ya
/// lo siembra ese helper, y el borrado va en `finally` en el orden de FK que él mismo documenta.
/// </summary>
[Collection("e2e")]
public sealed class OrderPaidAtE2ETests
{
    private readonly AppTestFactory _f;

    public OrderPaidAtE2ETests(WebAppFixture fixture) => _f = fixture.Factory;

    private static object PaymentBody(OrderPaymentStatus status) => new { paymentStatus = (int)status };

    /// <summary>
    /// La fila REAL. Scope propio y `IgnoreQueryFilters` porque el contexto del test no lleva
    /// tenant y `Order` tiene filtro global: sin el bypass, la lectura devolvería null y el test
    /// culparía al guardado de un problema del filtro.
    /// </summary>
    private async Task<Order?> ReadRowAsync(Guid orderId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await db.Set<Order>().IgnoreQueryFilters().AsNoTracking()
            .FirstOrDefaultAsync(order => order.Id == orderId);
    }

    [Fact]
    public async Task R_PAID_1_the_paid_moment_is_persisted_and_read_back_by_the_detail_endpoint()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        const string code = "E2EPAID1";
        try
        {
            Order seeded = await PublicOrderingSeed.SeedOnlineOrderAsync(_f, fixture, code);

            // Precondición: el pedido nace pendiente y SIN fecha. Sin esto, "la fecha cambió" no
            // distinguiría un guardado correcto de una columna que ya venía con basura.
            Order before = (await ReadRowAsync(seeded.Id))!;
            before.PaymentStatus.Should().Be(OrderPaymentStatus.Pending);
            before.PaidAt.Should().BeNull("un pedido recién creado no tiene cobro que constatar");

            var client = DbTestHelpers.AuthedClient(_f, fixture.UserId, fixture.Login);
            var patch = await client.PatchAsJsonAsync(
                $"/api/v1/online-orders/{seeded.Id}/payment", PaymentBody(OrderPaymentStatus.Paid));
            patch.StatusCode.Should().Be(HttpStatusCode.OK,
                "marcar el pago es una acción del panel de pedidos con el módulo 20 contratado");

            Order after = (await ReadRowAsync(seeded.Id))!;
            after.PaymentStatus.Should().Be(OrderPaymentStatus.Paid);
            after.PaidAt.Should().NotBeNull(
                "la columna es lo que convierte el cobro en constancia durable, no un estado de la sesión");
            after.PaidAt!.Value.Kind.Should().Be(DateTimeKind.Utc);
            after.PaidAt.Value.Should().BeCloseTo(DateTime.UtcNow, TimeSpan.FromMinutes(5),
                "la fecha sellada es el instante del cobro, no la del alta del pedido");

            var response = await client.GetAsync($"/api/v1/online-orders/{seeded.Id}");
            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content
                .ReadFromJsonAsync<ApiResponse<OnlineOrderDetailDto>>(ApiResponse.Json);

            body!.Succeeded.Should().BeTrue();
            body.Data!.PaidAt.Should().Be(after.PaidAt,
                "el detalle devuelve la columna guardada, no un valor recalculado en el handler");
        }
        finally
        {
            await PublicOrderingSeed.CleanupAsync(_f, fixture);
        }
    }

    [Fact]
    public async Task R_PAID_2_returning_to_pending_clears_the_stored_paid_moment()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        const string code = "E2EPAID2";
        try
        {
            Order seeded = await PublicOrderingSeed.SeedOnlineOrderAsync(_f, fixture, code);
            var client = DbTestHelpers.AuthedClient(_f, fixture.UserId, fixture.Login);

            (await client.PatchAsJsonAsync(
                $"/api/v1/online-orders/{seeded.Id}/payment", PaymentBody(OrderPaymentStatus.Paid)))
                .StatusCode.Should().Be(HttpStatusCode.OK);

            // Control positivo: sin él, "quedó null" también lo diría un endpoint que nunca escribe.
            (await ReadRowAsync(seeded.Id))!.PaidAt.Should().NotBeNull();

            var undo = await client.PatchAsJsonAsync(
                $"/api/v1/online-orders/{seeded.Id}/payment", PaymentBody(OrderPaymentStatus.Pending));
            undo.StatusCode.Should().Be(HttpStatusCode.OK);

            Order after = (await ReadRowAsync(seeded.Id))!;
            after.PaymentStatus.Should().Be(OrderPaymentStatus.Pending);
            after.PaidAt.Should().BeNull(
                "deshacer el pago tiene que deshacer también su constancia, o el pedido queda mintiendo");

            var response = await client.GetAsync($"/api/v1/online-orders/{seeded.Id}");
            var body = await response.Content
                .ReadFromJsonAsync<ApiResponse<OnlineOrderDetailDto>>(ApiResponse.Json);
            body!.Data!.PaidAt.Should().BeNull("el detalle lee la misma columna que se acaba de borrar");
        }
        finally
        {
            await PublicOrderingSeed.CleanupAsync(_f, fixture);
        }
    }
}
