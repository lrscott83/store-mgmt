using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Orders;

/// <summary>
/// F3-R2 — el LÍMITE DE TASA del alta anónima de pedidos, por el PIPELINE REAL.
///
/// `RateLimitPolicies.OnlineOrder` parte la ventana en `{IP}|{slug}` leyendo el slug de
/// `HttpContext.Request.RouteValues`. Eso solo funciona si `UseRateLimiter()` corre DESPUÉS de
/// `UseRouting()`: el modelo de ruta —y con él `storeSlug`— no existe antes (`Program.cs:182` y
/// `:198`). Los unitarios de `OnlineOrderRateLimitPolicyTests` inyectan `RouteValues` a mano sobre
/// un `DefaultHttpContext`, así que PASSARÍAN igual con el middleware antes del routing: supondrían
/// un routing que el pipeline no garantiza. Aquí la petición entra por HTTP de verdad, y la única
/// forma de que el slug esté en la clave de partición es que el orden del pipeline sea el correcto.
///
/// Casos:
///   R2-1  agotado el presupuesto (20 permisos) de un slug, el siguiente POST responde 429 a
///         través del middleware, no por el handler.
///   R2-2  el reparto por SLUG: agotado el slug A desde la misma IP, el slug B responde 200. Si la
///         partición colapsara a IP-only —que es lo que pasaría con el slug vacío si el middleware
///         corriera antes del routing— B heredaría el límite de A y también sería 429.
///   R2-3  la normalización del slug: el mismo slug escrito en MAYÚSCULAS cae en el MISMO cubo
///         (429), porque la política recorta y pasa a minúsculas. Sin esto, el límite se evadiría
///         cambiando mayúsculas en cada petición.
///
/// El presupuesto es por IP+slug, no por tienda: por eso las semillas usan GUIDs fresh en el slug
/// y las pruebas de este archivo NO se pisan entre sí (ni con R1) aunque compartan la IP del
/// TestServer.
/// </summary>
[Collection("e2e")]
public sealed class PublicOrderingRateLimitE2ETests
{
    /// <summary>
    /// `PermitLimit` de <c>OnlineOrderPolicy</c> (`RateLimitPolicies.cs:70`). El E2E lo escribe
    /// literal y no lo lee por reflexión a propósito: el valor que se comprueba aquí es el de la
    /// política de PRODUCCIÓN contra la que el middleware corre, no una copia.
    /// </summary>
    private const int PermitLimit = 20;

    /// <summary>
    /// Requests de reserva para dos casos cuyo resultado depende de la reposición (2 permisos por
    /// minuto): el test no puede afirmar "la 21ª es 429" de forma absoluta sin depender de que no
    /// cruce un límite de segmento. Afirma lo que NO depende del reloj: los primeros 20 pasan y a
    /// partir de ahí el cubo se agota y sigue agotado.
    /// </summary>
    private const int SpareRequests = 10;

    private readonly AppTestFactory _f;

    public PublicOrderingRateLimitE2ETests(WebAppFixture fixture) => _f = fixture.Factory;

    private async Task<HttpStatusCode> PostOrderAsync(
        PublicOrderingSeed.OrderingFixture fixture, string? slug = null)
    {
        var response = await _f.CreateClient().PostAsJsonAsync(
            $"/api/v1/public/ordering/{slug ?? fixture.Slug}/orders",
            PublicOrderingSeed.CreateOrderBody(fixture.ProductId, fixture.Phone));
        return response.StatusCode;
    }

    /// <summary>
    /// Dispara pedidos hasta agotar el cubo del slug. Devuelve cuántos pasaron y si apareció un 429.
    /// Corta en cuanto lo ve: seguir gastando permisos de otros casos no aporta nada.
    /// </summary>
    private async Task<(int Allowed, bool Throttled)> ExhaustAsync(PublicOrderingSeed.OrderingFixture fixture)
    {
        var client = _f.CreateClient();
        int allowed = 0;
        for (int attempt = 0; attempt < PermitLimit + SpareRequests; attempt++)
        {
            var response = await client.PostAsJsonAsync(
                $"/api/v1/public/ordering/{fixture.Slug}/orders",
                PublicOrderingSeed.CreateOrderBody(fixture.ProductId, fixture.Phone));

            if (response.StatusCode == HttpStatusCode.TooManyRequests)
                return (allowed, true);

            response.StatusCode.Should().Be(HttpStatusCode.OK,
                $"el pedido {attempt + 1} iba dentro del presupuesto ({PermitLimit})");
            allowed++;
        }

        return (allowed, false);
    }

    [Fact]
    public async Task R2_1_the_exceeding_post_is_rejected_with_429_by_the_middleware()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        try
        {
            var (allowed, throttled) = await ExhaustAsync(fixture);

            allowed.Should().BeGreaterThanOrEqualTo(PermitLimit,
                "los primeros pedidos del cubo IP+slug tienen que pasar");
            throttled.Should().BeTrue(
                $"el presupuesto es de {PermitLimit} pedidos por IP+slug en la ventana");

            // Y sigue agotado: un 429 puntual por límite de segmento no sería un límite.
            (await PostOrderAsync(fixture)).Should().Be(HttpStatusCode.TooManyRequests);
        }
        finally
        {
            await PublicOrderingSeed.CleanupAsync(_f, fixture);
        }
    }

    [Fact]
    public async Task R2_2_exhausting_one_slug_does_not_throttle_another_slug_from_the_same_ip()
    {
        // La partición es IP + SLUG. Agotar el cubo de una tienda no puede dejar sin pedidos a
        // otra desde la misma conexión —ni a un cliente detrás de un NAT, ni a la tienda
        // vecina—. Esto es justo lo que se pierde si el slug llega vacío al limiter.
        var first = await PublicOrderingSeed.SeedAsync(_f);
        var second = await PublicOrderingSeed.SeedAsync(_f);
        try
        {
            var (allowed, throttled) = await ExhaustAsync(first);
            allowed.Should().BeGreaterThanOrEqualTo(PermitLimit);
            throttled.Should().BeTrue();

            (await PostOrderAsync(second)).Should().Be(HttpStatusCode.OK,
                "el slug B tiene su propio presupuesto aunque venga de la misma IP");
            (await PostOrderAsync(first)).Should().Be(HttpStatusCode.TooManyRequests,
                "y el slug A sigue agotado: no seindle el límite al primer slug que se agota");
        }
        finally
        {
            await PublicOrderingSeed.CleanupAsync(_f, first);
            await PublicOrderingSeed.CleanupAsync(_f, second);
        }
    }

    [Fact]
    public async Task R2_3_the_slug_partition_key_normalizes_case()
    {
        // El slug lo escribe el usuario en la URL. Si `/Tienda-ANA/orders` y `/tienda-ana/orders`
        // fueran cubos distintos, el límite se evadiría cambiando mayúsculas en cada petición.
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        try
        {
            var (allowed, throttled) = await ExhaustAsync(fixture);
            throttled.Should().BeTrue();

            (await PostOrderAsync(fixture, fixture.Slug.ToUpperInvariant()))
                .Should().Be(HttpStatusCode.TooManyRequests,
                    "el slug se normaliza antes de partir la ventana");
        }
        finally
        {
            await PublicOrderingSeed.CleanupAsync(_f, fixture);
        }
    }
}
