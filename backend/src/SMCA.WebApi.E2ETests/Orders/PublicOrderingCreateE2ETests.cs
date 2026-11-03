using System.Net;
using System.Net.Http.Json;
using Application.Dtos.OnlineOrdering;
using Application.Features.OnlineOrdering.Commands.CreateOnlineOrder;
using Domain.Common.Enums;
using Domain.Entities.OrderItems;
using Domain.Entities.Orders;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Orders;

/// <summary>
/// Unidad 8 — `POST /api/v1/public/ordering/{storeSlug}/orders` (anónimo, la ÚNICA escritura
/// pública del backend).
///
/// Lo que solo se puede fijar de punta a punta: el precio y el total los pone el SERVIDOR leyendo
/// el catálogo, el `storeSlug` de la RUTA manda sobre el del cuerpo, y el pedido queda persistido
/// con su snapshot de líneas en PostgreSQL.
///
/// `PublicOrderingRateLimitE2ETests` ya ejerce el 429; aquí NO se repite el rate limit, se cubre el
/// camino feliz y las entradas inválidas de contrato.
/// </summary>
[Collection("e2e")]
public sealed class PublicOrderingCreateE2ETests
{
    private readonly AppTestFactory _f;

    public PublicOrderingCreateE2ETests(WebAppFixture fixture) => _f = fixture.Factory;

    private static string OrdersUrl(string slug) => $"/api/v1/public/ordering/{slug}/orders";

    private async Task<HttpResponseMessage> PostAsync(string slug, object body)
        => await _f.CreateClient().PostAsJsonAsync(OrdersUrl(slug), body);

    private async Task<Order?> ReadOrderByCodeAsync(Guid storeId, string code)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await db.Set<Order>().IgnoreQueryFilters().AsNoTracking()
            .FirstOrDefaultAsync(order => order.StoreId == storeId && order.Code == code);
    }

    private async Task<int> CountOrdersAsync(Guid storeId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await db.Set<Order>().IgnoreQueryFilters().CountAsync(order => order.StoreId == storeId);
    }

    private async Task<List<OrderItem>> ReadItemsAsync(Guid orderId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await db.Set<OrderItem>().IgnoreQueryFilters().AsNoTracking()
            .Where(item => item.OrderId == orderId)
            .ToListAsync();
    }

    [Fact]
    public async Task Post_with_a_valid_cart_prices_from_the_catalog_and_persists_the_snapshot()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        try
        {
            var response = await PostAsync(
                fixture.Slug,
                PublicOrderingSeed.CreateOrderBody(fixture.ProductId, fixture.Phone));

            response.StatusCode.Should().Be(HttpStatusCode.OK);

            var body = await response.Content
                .ReadFromJsonAsync<ApiResponse<OnlineOrderCreatedDto>>(ApiResponse.Json);

            body!.Succeeded.Should().BeTrue();
            var created = body.Data!;

            created.Code.Should().NotBeNullOrWhiteSpace("sin código la persona no puede consultar su pedido");
            created.Code.Should().HaveLength(6, "el alfabeto dictable del código es de 6 caracteres");
            created.Subtotal.Should().Be(PublicOrderingSeed.ProductPrice,
                "una línea de 1 unidad a 100: el precio sale del catálogo, no del cliente");
            created.Total.Should().Be(PublicOrderingSeed.ProductPrice);
            created.Currency.Should().Be(Currency.CUP);
            created.Lines.Should().ContainSingle();
            created.Lines[0].Name.Should().Be(fixture.ProductName);
            created.Lines[0].Quantity.Should().Be(1);
            created.Lines[0].Price.Should().Be(PublicOrderingSeed.ProductPrice);

            var order = await ReadOrderByCodeAsync(fixture.StoreId, created.Code);
            order.Should().NotBeNull("el alta tiene que persistir la fila");
            order!.Id.Should().Be(created.Id);
            order.Total.Should().Be(PublicOrderingSeed.ProductPrice);
            order.ItemsCount.Should().Be(1);
            order.CustomerPhone.Should().Be(fixture.Phone);
            order.Status.Should().Be(OrderStatus.Creado);
            order.PaymentStatus.Should().Be(OrderPaymentStatus.Pending);

            var items = await ReadItemsAsync(order.Id);
            items.Should().ContainSingle();
            items[0].Price.Should().Be(PublicOrderingSeed.ProductPrice,
                "el snapshot guarda el precio resuelto, no el que envió el cliente");
            items[0].Quantity.Should().Be(1);
        }
        finally
        {
            await PublicOrderingSeed.CleanupAsync(_f, fixture);
        }
    }

    [Fact]
    public async Task Post_ignores_a_store_slug_sent_in_the_body()
    {
        var target = await PublicOrderingSeed.SeedAsync(_f);
        var other = await PublicOrderingSeed.SeedAsync(_f);
        try
        {
            // El cuerpo intenta redirigir el pedido a otra tienda. La ruta es la única fuente.
            var response = await PostAsync(target.Slug, new
            {
                storeSlug = other.Slug,
                deliveryType = (int)OrderDeliveryType.Pickup,
                customerName = "Cliente Anónimo E2E",
                customerPhone = target.Phone,
                items = new[] { new { productId = target.ProductId, quantity = 1 } },
            });

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content
                .ReadFromJsonAsync<ApiResponse<OnlineOrderCreatedDto>>(ApiResponse.Json);

            var order = await ReadOrderByCodeAsync(target.StoreId, body!.Data!.Code);
            order.Should().NotBeNull("el pedido pertenece a la tienda de la RUTA");
            (await CountOrdersAsync(other.StoreId)).Should().Be(0,
                "el slug del cuerpo no puede crear pedidos en otra tienda");
        }
        finally
        {
            await PublicOrderingSeed.CleanupAsync(_f, target);
            await PublicOrderingSeed.CleanupAsync(_f, other);
        }
    }

    [Fact]
    public async Task Post_with_an_unknown_product_is_rejected_without_persisting()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        try
        {
            int before = await CountOrdersAsync(fixture.StoreId);

            var response = await PostAsync(
                fixture.Slug,
                PublicOrderingSeed.CreateOrderBody(Guid.NewGuid(), fixture.Phone));

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await CountOrdersAsync(fixture.StoreId)).Should().Be(before,
                "un producto que no está publicado no puede dejar pedido a medias");
        }
        finally
        {
            await PublicOrderingSeed.CleanupAsync(_f, fixture);
        }
    }

    [Fact]
    public async Task Post_with_an_empty_cart_is_rejected()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        try
        {
            var response = await PostAsync(fixture.Slug, new
            {
                deliveryType = (int)OrderDeliveryType.Pickup,
                customerName = "Cliente Anónimo E2E",
                customerPhone = fixture.Phone,
                items = Array.Empty<object>(),
            });

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }
        finally
        {
            await PublicOrderingSeed.CleanupAsync(_f, fixture);
        }
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    public async Task Post_with_a_non_positive_quantity_is_rejected(int quantity)
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        try
        {
            var response = await PostAsync(fixture.Slug, new
            {
                deliveryType = (int)OrderDeliveryType.Pickup,
                customerName = "Cliente Anónimo E2E",
                customerPhone = fixture.Phone,
                items = new[] { new { productId = fixture.ProductId, quantity } },
            });

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }
        finally
        {
            await PublicOrderingSeed.CleanupAsync(_f, fixture);
        }
    }
}
