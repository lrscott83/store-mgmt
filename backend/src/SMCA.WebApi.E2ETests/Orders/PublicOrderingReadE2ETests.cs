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
/// F3-R1 — la LECTURA PÚBLICA del pedido por código, contra PostgreSQL real.
///
/// El punto que este E2E cubre y los unitarios no: `Order` tiene filtro global por TENANT
/// (`OrderEntityTypeConfiguration.cs:19`) y la petición que llega aquí es ANÓNIMA, así que el
/// contexto no tiene tenant y ese filtro no matchea ninguna fila. Sin el `IgnoreQueryFilters` de
/// `OrderRepository.GetPublicByCodeAsync` el pedido devolvería 404 SIEMPRE — con el pedido
/// perfectamente creado en la base. Los unitarios de `OrderRepositoryPublicReadTests` lo prueban
/// con EF InMemory, un proveedor que NO ejecuta el filtro como SQL; aquí la lectura pasa por Npgsql
/// y el filtro es el que es.
///
/// Casos:
///   R1-1  El alta propia (`Order.CreateOnline`) + GET anónimo por código y teléfono → 200 con el
///         código, el total y el snapshot de líneas. Sin el bypass sería 404.
///   R1-2  El filtro de tenant es REAL en esta base: con un tenant que NO es el del pedido, la
///         misma consulta filtrada devuelve cero filas y la que ignora el filtro devuelve una.
///         Sin esta sonda, el 200 de R1-1 no distingue "el bypass funciona" de "el filtro no
///         existe en PostgreSQL".
///   R1-3  Un código inexistente → 404 uniforme (mismo cuerpo que un teléfono que no coincide:
///         el endpoint no puede servir de oráculo de qué códigos existen).
///   R1-4  El mismo código leído desde el slug de OTRA tienda → 404: el slug es lo que acota,
///         no el código.
/// </summary>
[Collection("e2e")]
public sealed class PublicOrderingReadE2ETests
{
    private readonly AppTestFactory _f;

    public PublicOrderingReadE2ETests(WebAppFixture fixture) => _f = fixture.Factory;

    private HttpClient Anon() => _f.CreateClient();

    private Task<(HttpStatusCode Status, ApiResponse<PublicOrderStatusDto>? Body)> GetStatusAsync(
        string slug, string code, string? phone)
    {
        // El `+` del teléfono va escapado: en una query string es un espacio, y sin escapar la
        // comparación del segundo factor fallaría por un detalle del transporte.
        string url = $"/api/v1/public/ordering/{slug}/orders/{code}"
            + (phone is null ? string.Empty : $"?phone={Uri.EscapeDataString(phone)}");

        return ReadAsync(Anon(), url);
    }

    private static async Task<(HttpStatusCode Status, ApiResponse<PublicOrderStatusDto>? Body)> ReadAsync(
        HttpClient client, string url)
    {
        var response = await client.GetAsync(url);
        ApiResponse<PublicOrderStatusDto>? body = null;
        if (response.IsSuccessStatusCode)
            body = await response.Content.ReadFromJsonAsync<ApiResponse<PublicOrderStatusDto>>(ApiResponse.Json);
        return (response.StatusCode, body);
    }

    [Fact]
    public async Task R1_1_anonymous_read_of_a_seeded_order_returns_the_code_total_and_snapshot()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        const string code = "E2ER1AA";
        try
        {
            await PublicOrderingSeed.SeedOnlineOrderAsync(_f, fixture, code);

            var (status, body) = await GetStatusAsync(fixture.Slug, code, fixture.Phone);

            status.Should().Be(HttpStatusCode.OK,
                "el pedido existe y el bypass del filtro de tenant deja leerlo sin sesión");
            body!.Succeeded.Should().BeTrue();

            var order = body.Data!;
            order.Code.Should().Be(code);
            order.Total.Should().Be(PublicOrderingSeed.SeededTotal,
                "el total es el que se guardó: el servidor no lo recalcula en la lectura");
            order.Status.Should().Be(OrderStatus.New);
            order.PaymentStatus.Should().Be(OrderPaymentStatus.Pending);
            order.DeliveryType.Should().Be(OrderDeliveryType.Pickup);
            order.Currency.Should().Be(Currency.CUP);

            order.Items.Should().HaveCount(1);
            order.Items[0].Name.Should().Be(fixture.ProductName);
            order.Items[0].Quantity.Should().Be(PublicOrderingSeed.SeededQuantity);
            order.Items[0].Price.Should().Be(PublicOrderingSeed.ProductPrice);
        }
        finally
        {
            await PublicOrderingSeed.CleanupAsync(_f, fixture);
        }
    }

    [Fact]
    public async Task R1_2_the_tenant_query_filter_really_blocks_the_row_in_postgres()
    {
        // Sonda de la sonda: sin ella, R1-1 pasaría igual en una base donde el filtro global no
        // llegara a traducirse a SQL (InMemory lo ignora; un Provider mal configurado también).
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        const string code = "E2ER1BB";
        try
        {
            var order = await PublicOrderingSeed.SeedOnlineOrderAsync(_f, fixture, code);

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            // Tenant que NO es el del pedido: el filtro global de `Order` no matchea.
            db.SetTenantContext(Guid.NewGuid(), isSuperAdmin: false);
            var filtered = await db.Set<Order>()
                .Where(o => o.StoreId == fixture.StoreId && o.Code == code).ToListAsync();
            var bypassed = await db.Set<Order>().IgnoreQueryFilters()
                .Where(o => o.StoreId == fixture.StoreId && o.Code == code).ToListAsync();

            filtered.Should().BeEmpty(
                "el filtro global por tenant esconde el pedido de un tenant ajeno");
            bypassed.Should().HaveCount(1);
            bypassed[0].Id.Should().Be(order.Id);

            // Y el anónimo no trae tenant en el contexto, que es el caso real del endpoint.
            using var anonScope = _f.Services.CreateScope();
            var anonDb = anonScope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            (await anonDb.Set<Order>()
                .Where(o => o.StoreId == fixture.StoreId && o.Code == code).ToListAsync())
                .Should().BeEmpty("una petición anónima NO tiene tenant: ese es el 404 que evita el bypass");
        }
        finally
        {
            await PublicOrderingSeed.CleanupAsync(_f, fixture);
        }
    }

    [Fact]
    public async Task R1_3_an_unknown_code_returns_the_same_404_as_a_wrong_phone()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        const string code = "E2ER1CC";
        try
        {
            await PublicOrderingSeed.SeedOnlineOrderAsync(_f, fixture, code);

            var (unknown, unknownBody) = await GetStatusAsync(fixture.Slug, "ZZZZZZ", fixture.Phone);
            var (wrongPhone, wrongPhoneBody) = await GetStatusAsync(fixture.Slug, code, "+5300000000");

            unknown.Should().Be(HttpStatusCode.NotFound);
            wrongPhone.Should().Be(HttpStatusCode.NotFound);

            // Uniforme a propósito: si los mensajes difieren, el endpoint es un oráculo de qué
            // códigos existen en la tienda.
            unknownBody.Should().BeNull();
            wrongPhoneBody.Should().BeNull();
        }
        finally
        {
            await PublicOrderingSeed.CleanupAsync(_f, fixture);
        }
    }

    [Fact]
    public async Task R1_4_the_same_code_is_not_found_through_another_store_slug()
    {
        var first = await PublicOrderingSeed.SeedAsync(_f);
        var second = await PublicOrderingSeed.SeedAsync(_f);
        const string code = "E2ER1DD";
        try
        {
            await PublicOrderingSeed.SeedOnlineOrderAsync(_f, first, code);

            // Mismo código, mismo teléfono, otra tienda: el slug es lo que acota la lectura.
            (await GetStatusAsync(first.Slug, code, first.Phone)).Status
                .Should().Be(HttpStatusCode.OK);
            (await GetStatusAsync(second.Slug, code, first.Phone)).Status
                .Should().Be(HttpStatusCode.NotFound);
        }
        finally
        {
            await PublicOrderingSeed.CleanupAsync(_f, first);
            await PublicOrderingSeed.CleanupAsync(_f, second);
        }
    }
}
