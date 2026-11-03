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
/// Actualización parcial de la fila del pedido (P0-2, opción A): lo que los unitarios NO pueden
/// probar —que dos PATCH concurrentes sobre el MISMO pedido sobrevivan uno al otro en PostgreSQL
/// real.
///
/// El defecto que este test vigila es el "lost update" de la fila entera: recepción marca el
/// pedido como preparado y caja lo marca pagado, cada handler lee la fila, muta su eje y guarda
/// TODAS las columnas con los valores que leyó. El que guarda último devuelve el eje del otro a su
/// valor anterior — sin conflicto, sin error y sin aviso. Con la actualización por columnas cada
/// PATCH escribe solo las suyas, así que las dos sobreviven sin importar el orden.
///
/// El E2E es la prueba que el plan exige (S5) porque el defecto vive en el SQL que emite EF: un
/// mock del repositorio acepta cualquier llamada y una entidad en memoria no tiene columnas. Aquí
/// se disparan las DOS rutas HTTP autenticadas a la vez y se afirma la FILA.
///
/// Reutiliza <see cref="PublicOrderingSeed"/>: tienda con `OwnerAdmin` y tienda seleccionada,
/// módulos 19 y 20, y un pedido `Creado`/`Pending` de recogida. No toca ningún archivo del
/// harness; el borrado va en `finally` con el orden de FK que ese helper ya documenta.
/// </summary>
[Collection("e2e")]
public sealed class OrderConcurrentFieldUpdateE2ETests
{
    private readonly AppTestFactory _f;

    public OrderConcurrentFieldUpdateE2ETests(WebAppFixture fixture) => _f = fixture.Factory;

    private static object PaymentBody(OrderPaymentStatus status) => new { paymentStatus = (int)status };

    private static object StatusBody(OrderStatus status) => new { status = (int)status };

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

    /// <summary>
    /// Un `PATCH /payment` y un `PATCH /status` disparados a la vez sobre el MISMO pedido: los dos
    /// responden 200 y los dos ejes quedan en la fila.
    ///
    /// Es una prueba de HUMO de los dos endpoints, no la prueba determinista del lost update: sin
    /// una barrera que obligue a los dos handlers a leer antes de que el otro escriba, el
    /// entrelazado real depende del planificador, así que puede pasar sin el arreglo. La prueba
    /// determinista —lectura vieja + escritura del otro eje, y la escritura posterior— vive en
    /// `OrderPartialUpdateGuardsE2ETests`, que sí falla siempre con el guardado de fila entera.
    /// </summary>
    [Fact]
    public async Task R_CONCURRENT_1_a_concurrent_payment_patch_and_status_patch_both_persist()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        try
        {
            Order seeded = await PublicOrderingSeed.SeedOnlineOrderAsync(_f, fixture, "E2ECONC");

            // Precondición: sin los dos valores iniciales, "cambió" no distinguiría un guardado
            // correcto de una columna que ya venía con basura.
            Order before = (await ReadRowAsync(seeded.Id))!;
            before.Status.Should().Be(OrderStatus.Creado);
            before.PaymentStatus.Should().Be(OrderPaymentStatus.Pending);
            before.PaidAt.Should().BeNull("un pedido recién creado no tiene cobro que constatar");

            // Un cliente por acción: es lo que hace una sesión por puesto en el panel. Las dos
            // peticiones se lanzan ANTES del primer await para que viajen a la vez.
            var paymentClient = DbTestHelpers.AuthedClient(_f, fixture.UserId, fixture.Login);
            var statusClient = DbTestHelpers.AuthedClient(_f, fixture.UserId, fixture.Login);

            Task<HttpResponseMessage> payment = paymentClient.PatchAsJsonAsync(
                $"/api/v1/online-orders/{seeded.Id}/payment", PaymentBody(OrderPaymentStatus.Paid));
            Task<HttpResponseMessage> status = statusClient.PatchAsJsonAsync(
                $"/api/v1/online-orders/{seeded.Id}/status", StatusBody(OrderStatus.Preparado));

            HttpResponseMessage[] responses = await Task.WhenAll(payment, status);

            responses[0].StatusCode.Should().Be(HttpStatusCode.OK,
                "marcar el pago es válido en un pedido `Creado`");
            responses[1].StatusCode.Should().Be(HttpStatusCode.OK,
                "`Creado → Preparado` es una transición válida de recogida");

            // La FILA: los dos ejes, no solo el último que escribió.
            Order after = (await ReadRowAsync(seeded.Id))!;
            after.PaymentStatus.Should().Be(OrderPaymentStatus.Paid,
                "el `PATCH /status` concurrente no puede revertir el pago");
            after.PaidAt.Should().NotBeNull(
                "la constancia del cobro viaja en la MISMA escritura parcial que el pago");
            after.Status.Should().Be(OrderStatus.Preparado,
                "el `PATCH /payment` concurrente no puede revertir el estado");

            // Y el contrato de lectura: el detalle devuelve lo mismo que la fila, no un recálculo.
            var response = await statusClient.GetAsync($"/api/v1/online-orders/{seeded.Id}");
            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content
                .ReadFromJsonAsync<ApiResponse<OnlineOrderDetailDto>>(ApiResponse.Json);

            body!.Succeeded.Should().BeTrue();
            body.Data!.Status.Should().Be(OrderStatus.Preparado);
            body.Data.PaymentStatus.Should().Be(OrderPaymentStatus.Paid);
            body.Data.PaidAt.Should().Be(after.PaidAt);
        }
        finally
        {
            await PublicOrderingSeed.CleanupAsync(_f, fixture);
        }
    }
}
