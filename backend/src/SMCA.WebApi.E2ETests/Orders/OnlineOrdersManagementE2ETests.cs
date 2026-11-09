using System.Net;
using System.Net.Http.Json;
using Application.Dtos.OnlineOrdering;
using Domain.Common.Enums;
using Domain.Entities.DeliveryDrivers;
using Domain.Entities.Orders;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Orders;

/// <summary>
/// Unidad 6 — `OnlineOrdersController` (vista "Pedidos"): listado, detalle, métricas y los tres
/// `PATCH` (estado, pago, repartidor).
///
/// Lo que estos E2E cubren y los unitarios con mocks no: el filtro por tienda vive en el MISMO
/// predicado que el id (un id de otra tienda es 404 indistinguible de inexistente), la transición
/// la decide el dominio, y el `PATCH` escribe de verdad en PostgreSQL.
///
/// No repite lo que ya está cubierto: el rate limit público (`PublicOrderingRateLimitE2ETests`),
/// la lectura pública por código (`PublicOrderingReadE2ETests`), `PaidAt`
/// (`OrderPaidAtE2ETests`) y la baja lógica del repartidor
/// (`DeliveryDriverPartialUpdateE2ETests`).
/// </summary>
[Collection("e2e")]
public sealed class OnlineOrdersManagementE2ETests
{
    private const string OrdersUrl = "/api/v1/online-orders";

    private readonly AppTestFactory _f;

    public OnlineOrdersManagementE2ETests(WebAppFixture fixture) => _f = fixture.Factory;

    private HttpClient ClientOf(PublicOrderingSeed.OrderingFixture fixture)
        => DbTestHelpers.AuthedClient(_f, fixture.UserId, fixture.Login);

    /// <summary>
    /// Limpieza de repartidores antes del grafo de la tienda: `Order.DriverId` y
    /// `DeliveryDriver.StoreId` son FK `Restrict`, así que se suelta la asignación y se borra al
    /// repartidor antes de borrar el pedido y la tienda.
    /// </summary>
    private async Task DeleteDriversAsync(Guid storeId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        await db.Set<Order>().IgnoreQueryFilters()
            .Where(order => order.StoreId == storeId && order.DriverId != null)
            .ExecuteUpdateAsync(setters => setters.SetProperty(order => order.DriverId, (Guid?)null));

        await db.Set<DeliveryDriver>().IgnoreQueryFilters()
            .Where(driver => driver.StoreId == storeId)
            .ExecuteDeleteAsync();
    }

    [Fact]
    public async Task List_returns_only_the_store_orders_with_paging_metadata()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        try
        {
            await PublicOrderingSeed.SeedOnlineOrderAsync(_f, fixture, "E2ELIST01");
            await PublicOrderingSeed.SeedOnlineOrderAsync(_f, fixture, "E2ELIST02");

            var client = ClientOf(fixture);
            var response = await client.GetAsync($"{OrdersUrl}?page=1&pageSize=1");

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content
                .ReadFromJsonAsync<ApiResponse<OnlineOrderPageDto>>(ApiResponse.Json);

            body!.Succeeded.Should().BeTrue();
            body.Data!.Total.Should().Be(2, "la tienda tiene dos pedidos");
            body.Data.Page.Should().Be(1);
            body.Data.PageSize.Should().Be(1);
            body.Data.Items.Should().ContainSingle("la página pide una fila");
            body.Data.Items[0].CustomerPhone.Should().Be(fixture.Phone);
        }
        finally
        {
            await PublicOrderingSeed.CleanupAsync(_f, fixture);
        }
    }

    [Fact]
    public async Task List_clamps_the_page_size_to_the_hard_maximum()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        try
        {
            await PublicOrderingSeed.SeedOnlineOrderAsync(_f, fixture, "E2ECLAMP1");

            var response = await ClientOf(fixture).GetAsync($"{OrdersUrl}?pageSize=1000");

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content
                .ReadFromJsonAsync<ApiResponse<OnlineOrderPageDto>>(ApiResponse.Json);

            body!.Data!.PageSize.Should().Be(100,
                "pedir el histórico entero en una respuesta es justo lo que el paginado evita");
        }
        finally
        {
            await PublicOrderingSeed.CleanupAsync(_f, fixture);
        }
    }

    [Fact]
    public async Task List_filters_by_the_code_search()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        try
        {
            await PublicOrderingSeed.SeedOnlineOrderAsync(_f, fixture, "E2ESEARCH");
            await PublicOrderingSeed.SeedOnlineOrderAsync(_f, fixture, "E2EOTHER1");

            var response = await ClientOf(fixture).GetAsync($"{OrdersUrl}?search=E2ESEARCH");

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content
                .ReadFromJsonAsync<ApiResponse<OnlineOrderPageDto>>(ApiResponse.Json);

            body!.Data!.Total.Should().Be(1, "la búsqueda contrasta contra el código público");
            body.Data.Items[0].Code.Should().Be("E2ESEARCH");
        }
        finally
        {
            await PublicOrderingSeed.CleanupAsync(_f, fixture);
        }
    }

    [Fact]
    public async Task List_of_a_store_does_not_expose_another_stores_orders()
    {
        var first = await PublicOrderingSeed.SeedAsync(_f);
        var second = await PublicOrderingSeed.SeedAsync(_f);
        try
        {
            await PublicOrderingSeed.SeedOnlineOrderAsync(_f, first, "E2EMINE01");
            await PublicOrderingSeed.SeedOnlineOrderAsync(_f, second, "E2ETHEIRS");

            var response = await ClientOf(first).GetAsync($"{OrdersUrl}?pageSize=100");

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content
                .ReadFromJsonAsync<ApiResponse<OnlineOrderPageDto>>(ApiResponse.Json);

            body!.Data!.Total.Should().Be(1, "solo los pedidos de la tienda de la sesión");
            body.Data.Items.Should().NotContain(item => item.Code == "E2ETHEIRS");
        }
        finally
        {
            await PublicOrderingSeed.CleanupAsync(_f, first);
            await PublicOrderingSeed.CleanupAsync(_f, second);
        }
    }

    [Fact]
    public async Task Detail_returns_the_lines_and_the_snapshot()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        try
        {
            Order order = await PublicOrderingSeed.SeedOnlineOrderAsync(_f, fixture, "E2EDETAIL");

            var response = await ClientOf(fixture).GetAsync($"{OrdersUrl}/{order.Id}");

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content
                .ReadFromJsonAsync<ApiResponse<OnlineOrderDetailDto>>(ApiResponse.Json);

            var detail = body!.Data!;
            detail.Id.Should().Be(order.Id);
            detail.Code.Should().Be("E2EDETAIL");
            detail.CustomerPhone.Should().Be(fixture.Phone);
            detail.DeliveryType.Should().Be(OrderDeliveryType.Pickup);
            detail.Notes.Should().Be("pedido sembrado por el E2E");
            detail.Lines.Should().ContainSingle();
            detail.Lines[0].ProductId.Should().Be(fixture.ProductId);
            detail.Lines[0].Quantity.Should().Be(PublicOrderingSeed.SeededQuantity);
            detail.Lines[0].Price.Should().Be(PublicOrderingSeed.ProductPrice);
            detail.Lines[0].LineTotal.Should().Be(PublicOrderingSeed.SeededTotal,
                "el total de la línea sale del snapshot guardado");
        }
        finally
        {
            await PublicOrderingSeed.CleanupAsync(_f, fixture);
        }
    }

    [Fact]
    public async Task Detail_of_an_order_from_another_store_returns_404()
    {
        var first = await PublicOrderingSeed.SeedAsync(_f);
        var second = await PublicOrderingSeed.SeedAsync(_f);
        try
        {
            Order foreign = await PublicOrderingSeed.SeedOnlineOrderAsync(_f, second, "E2EFOREIGN");

            var response = await ClientOf(first).GetAsync($"{OrdersUrl}/{foreign.Id}");

            response.StatusCode.Should().Be(HttpStatusCode.NotFound,
                "un id de otra tienda no puede distinguirse de uno inexistente");
        }
        finally
        {
            await PublicOrderingSeed.CleanupAsync(_f, first);
            await PublicOrderingSeed.CleanupAsync(_f, second);
        }
    }

    [Fact]
    public async Task Stats_summarize_the_store_orders()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        try
        {
            await PublicOrderingSeed.SeedOnlineOrderAsync(_f, fixture, "E2ESTATS1");
            await PublicOrderingSeed.SeedOnlineOrderAsync(_f, fixture, "E2ESTATS2");

            var response = await ClientOf(fixture).GetAsync($"{OrdersUrl}/stats");

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content
                .ReadFromJsonAsync<ApiResponse<OnlineOrderStatsDto>>(ApiResponse.Json);

            var stats = body!.Data!;
            stats.OrdersCount.Should().Be(2);
            stats.NonCancelledCount.Should().Be(2);
            stats.TotalSales.Should().Be(PublicOrderingSeed.SeededTotal * 2);
            stats.AverageTicket.Should().Be(PublicOrderingSeed.SeededTotal);
            stats.PaidCount.Should().Be(0);
            stats.PendingCount.Should().Be(2);
            stats.PendingAmount.Should().Be(PublicOrderingSeed.SeededTotal * 2);
            stats.Currency.Should().Be(Currency.CUP);
            stats.ByStatus.Should().Contain(row => row.Status == OrderStatus.Creado && row.Count == 2);
            stats.ByDeliveryType.Should().Contain(row => row.DeliveryType == OrderDeliveryType.Pickup && row.Count == 2);
        }
        finally
        {
            await PublicOrderingSeed.CleanupAsync(_f, fixture);
        }
    }

    [Fact]
    public async Task Patch_status_moves_creado_to_preparado_and_persists_it()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        try
        {
            Order order = await PublicOrderingSeed.SeedOnlineOrderAsync(_f, fixture, "E2ESTATUS");

            var response = await ClientOf(fixture).PatchAsJsonAsync(
                $"{OrdersUrl}/{order.Id}/status", new { status = (int)OrderStatus.Preparado });

            response.StatusCode.Should().Be(HttpStatusCode.OK);

            var row = await OrderingQueries.ReadOrderRowAsync(_f, order.Id);
            row!.Status.Should().Be(OrderStatus.Preparado,
                "la transición alcanzable se persiste, no solo se responde 200");
        }
        finally
        {
            await PublicOrderingSeed.CleanupAsync(_f, fixture);
        }
    }

    [Fact]
    public async Task Patch_status_rejects_a_skipped_transition_and_leaves_the_row_untouched()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        try
        {
            Order order = await PublicOrderingSeed.SeedOnlineOrderAsync(_f, fixture, "E2ESKIP01");

            // Creado → Entregado no es alcanzable: hay que pasar por Preparado.
            var response = await ClientOf(fixture).PatchAsJsonAsync(
                $"{OrdersUrl}/{order.Id}/status", new { status = (int)OrderStatus.Entregado });

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest,
                "la tabla de transiciones la decide el dominio, y una no alcanzable es un 400");

            (await OrderingQueries.ReadOrderRowAsync(_f, order.Id))!.Status.Should().Be(OrderStatus.Creado);
        }
        finally
        {
            await PublicOrderingSeed.CleanupAsync(_f, fixture);
        }
    }

    [Fact]
    public async Task Patch_status_cancelling_without_a_reason_is_rejected()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        try
        {
            Order order = await PublicOrderingSeed.SeedOnlineOrderAsync(_f, fixture, "E2ENOREASON");

            var response = await ClientOf(fixture).PatchAsJsonAsync(
                $"{OrdersUrl}/{order.Id}/status", new { status = (int)OrderStatus.Cancelado });

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest,
                "cancelar exige una razón: la tabla de transiciones la guarda con el estado");
            (await OrderingQueries.ReadOrderRowAsync(_f, order.Id))!.Status.Should().Be(OrderStatus.Creado);
        }
        finally
        {
            await PublicOrderingSeed.CleanupAsync(_f, fixture);
        }
    }

    [Fact]
    public async Task Patch_payment_marks_the_order_as_paid()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        try
        {
            Order order = await PublicOrderingSeed.SeedOnlineOrderAsync(_f, fixture, "E2EPAYMENT");

            var response = await ClientOf(fixture).PatchAsJsonAsync(
                $"{OrdersUrl}/{order.Id}/payment",
                new { paymentStatus = (int)OrderPaymentStatus.Paid });

            response.StatusCode.Should().Be(HttpStatusCode.OK);

            var row = await OrderingQueries.ReadOrderRowAsync(_f, order.Id);
            row!.PaymentStatus.Should().Be(OrderPaymentStatus.Paid);
            row.PaidAt.Should().NotBeNull("marcar pagado deja constancia del momento del cobro");
            row.Status.Should().Be(OrderStatus.Creado,
                "el pago es un eje independiente: no mueve el estado del pedido");
        }
        finally
        {
            await PublicOrderingSeed.CleanupAsync(_f, fixture);
        }
    }

    [Fact]
    public async Task Patch_payment_of_a_delivered_order_cannot_go_back_to_pending()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        try
        {
            Order order = await PublicOrderingSeed.SeedOnlineOrderAsync(_f, fixture, "E2EDELIVER");
            var client = ClientOf(fixture);

            // Recogida: Creado → Preparado → Entregado.
            (await client.PatchAsJsonAsync(
                $"{OrdersUrl}/{order.Id}/status", new { status = (int)OrderStatus.Preparado }))
                .StatusCode.Should().Be(HttpStatusCode.OK);
            (await client.PatchAsJsonAsync(
                $"{OrdersUrl}/{order.Id}/status", new { status = (int)OrderStatus.Entregado }))
                .StatusCode.Should().Be(HttpStatusCode.OK);

            (await OrderingQueries.ReadOrderRowAsync(_f, order.Id))!.PaymentStatus.Should().Be(OrderPaymentStatus.Paid,
                "entregar equivale a haber cobrado");

            var response = await client.PatchAsJsonAsync(
                $"{OrdersUrl}/{order.Id}/payment",
                new { paymentStatus = (int)OrderPaymentStatus.Pending });

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest,
                "un pedido entregado ya está pagado: la invariante la guarda el dominio");
        }
        finally
        {
            await PublicOrderingSeed.CleanupAsync(_f, fixture);
        }
    }

    [Fact]
    public async Task Patch_driver_assigns_a_driver_of_the_store_and_rejects_a_foreign_one()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        var other = await PublicOrderingSeed.SeedAsync(_f);
        try
        {
            Order order = await PublicOrderingSeed.SeedOnlineOrderAsync(_f, fixture, "E2EASSIGN");

            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

                db.Set<DeliveryDriver>().Add(DeliveryDriver.Create(
                    fixture.StoreId, "Repartidor Propio", "+5351110000", fixture.TenantId));
                db.Set<DeliveryDriver>().Add(DeliveryDriver.Create(
                    other.StoreId, "Repartidor Ajeno", "+5352220000", other.TenantId));

                await db.SaveChangesAsync();
            }

            Guid ownDriverId;
            Guid foreignDriverId;
            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                ownDriverId = (await db.Set<DeliveryDriver>().IgnoreQueryFilters()
                    .SingleAsync(driver => driver.StoreId == fixture.StoreId)).Id;
                foreignDriverId = (await db.Set<DeliveryDriver>().IgnoreQueryFilters()
                    .SingleAsync(driver => driver.StoreId == other.StoreId)).Id;
            }

            var client = ClientOf(fixture);

            var assign = await client.PatchAsJsonAsync(
                $"{OrdersUrl}/{order.Id}/driver", new { driverId = ownDriverId });
            assign.StatusCode.Should().Be(HttpStatusCode.OK);
            (await OrderingQueries.ReadOrderRowAsync(_f, order.Id))!.DriverId.Should().Be(ownDriverId);

            var foreign = await client.PatchAsJsonAsync(
                $"{OrdersUrl}/{order.Id}/driver", new { driverId = foreignDriverId });
            foreign.StatusCode.Should().Be(HttpStatusCode.BadRequest,
                "un repartidor de otra tienda no es asignable, y el 400 no distingue el motivo");
            (await OrderingQueries.ReadOrderRowAsync(_f, order.Id))!.DriverId.Should().Be(ownDriverId,
                "el intento rechazado no cambia la asignación vigente");
        }
        finally
        {
            try
            {
                await DeleteDriversAsync(fixture.StoreId);
            }
            finally
            {
                await DeleteDriversAsync(other.StoreId);
                await PublicOrderingSeed.CleanupAsync(_f, fixture);
                await PublicOrderingSeed.CleanupAsync(_f, other);
            }
        }
    }

    [Fact]
    public async Task Management_endpoints_reject_an_anonymous_caller()
    {
        var client = _f.CreateClient();

        var list = await client.GetAsync(OrdersUrl);
        var stats = await client.GetAsync($"{OrdersUrl}/stats");

        list.StatusCode.Should().Be(HttpStatusCode.Unauthorized,
            "la gestión de pedidos es una capacidad de la tienda");
        stats.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }
}
