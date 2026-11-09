using System.Net;
using System.Net.Http.Json;
using Application.Dtos.OnlineOrdering;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Orders;

/// <summary>
/// Unidad — tope de página del listado de pedidos (S1, hallazgo 6.2), sobre PostgreSQL real.
///
/// Lo que un unitario con mocks no puede probar: que el `skip` calculado sea ACEPTABLE por la base.
/// `?page=2147483647` desbordaba `(page - 1) * pageSize` a un entero negativo y PostgreSQL lo
/// rechazaba; aquí se comprueba el contrato completo —200, página acotada, lista vacía— contra el
/// motor, que es donde el error se veía.
///
/// No repite lo que ya cubre `OnlineOrdersManagementE2ETests`: el tope de `pageSize` y el filtrado.
/// </summary>
[Collection("e2e")]
public sealed class OnlineOrdersPagingLimitsE2ETests
{
    private const string OrdersUrl = "/api/v1/online-orders";

    private readonly AppTestFactory _f;

    public OnlineOrdersPagingLimitsE2ETests(WebAppFixture fixture) => _f = fixture.Factory;

    /// <summary>
    /// El caso exacto del hallazgo: la página más alta que cabe en un `int` responde 200 con una
    /// página real y una lista vacía, en vez del 500 del desbordamiento.
    /// </summary>
    [Fact]
    public async Task List_with_the_largest_possible_page_returns_200_and_a_clamped_page()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        try
        {
            await PublicOrderingSeed.SeedOnlineOrderAsync(_f, fixture, "E2EBIGPAGE");

            var response = await DbTestHelpers
                .AuthedClient(_f, fixture.UserId, fixture.Login)
                .GetAsync($"{OrdersUrl}?page=2147483647");

            response.StatusCode.Should().Be(HttpStatusCode.OK,
                "una página absurda es una entrada válida, no un error de la base");

            var body = await response.Content
                .ReadFromJsonAsync<ApiResponse<OnlineOrderPageDto>>(ApiResponse.Json);

            body!.Succeeded.Should().BeTrue();
            body.Data!.Page.Should().Be(10_000, "la página publicada es la ya acotada");
            body.Data.PageSize.Should().Be(20);
            body.Data.Total.Should().Be(1, "el total filtrado no depende de la página pedida");
            body.Data.Items.Should().BeEmpty("no hay una página 10.000 en una tienda con un pedido");
        }
        finally
        {
            await PublicOrderingSeed.CleanupAsync(_f, fixture);
        }
    }

    /// <summary>
    /// El otro extremo del desbordamiento: `int.MinValue` tiene su propio `page - 1`. Se normaliza a
    /// la primera página, con el pedido dentro.
    /// </summary>
    [Fact]
    public async Task List_with_the_smallest_possible_page_returns_the_first_page()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        try
        {
            await PublicOrderingSeed.SeedOnlineOrderAsync(_f, fixture, "E2ENEGPAGE");

            var response = await DbTestHelpers
                .AuthedClient(_f, fixture.UserId, fixture.Login)
                .GetAsync($"{OrdersUrl}?page=-2147483648");

            response.StatusCode.Should().Be(HttpStatusCode.OK);

            var body = await response.Content
                .ReadFromJsonAsync<ApiResponse<OnlineOrderPageDto>>(ApiResponse.Json);

            body!.Data!.Page.Should().Be(1);
            body.Data.Items.Should().ContainSingle();
        }
        finally
        {
            await PublicOrderingSeed.CleanupAsync(_f, fixture);
        }
    }
}
