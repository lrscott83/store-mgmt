using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using SMCA.WebApi.PolicyCode;
using System.Net;
using System.Reflection;
using System.Threading.RateLimiting;

namespace Application.Tests.Features.OnlineOrdering;

/// <summary>
/// La política de tasa del pedido online (<c>OnlineOrderPolicy</c>) es el ÚNICO freno de abuso de un
/// endpoint anónimo que ESCRIBE. Sin ella, un script puede llenar la tabla de pedidos de una tienda
/// con basura que el dueño tiene que cancelar una a una.
///
/// Lo que esta suite fija, y por qué son estos casos:
///
///   * 20 pedidos por 10 minutos, con reposición gradual (no de golpe al abrirse la ventana);
///   * la partición es IP + slug. Por IP sola, los pedidos de la tienda A agotarían el presupuesto de
///     la tienda B del mismo cliente (NAT de oficina, red móvil) y, al revés, un atacante podría
///     repartirse pedidos rotando slugs desde una sola IP;
///   * el slug se NORMALIZA antes de entrar en la clave: la URL la escribe el usuario, así que sin
///     recortar y pasar a minúsculas el límite se evadiría cambiando mayúsculas en cada petición;
///   * sin IP (proxy que no la expone) la clave no puede degenerar en cadena vacía: dos clientes sin
///     IP acabarían compartiendo presupuesto.
///
/// NOTA DE ALCANCE: vive en <c>Application.Tests</c> y no junto a los tests de policies existentes
/// (<c>RateLimitPoliciesTests</c>, en la suite E2E) porque la suite E2E está fuera del alcance de
/// edición de esta feature. El patrón es idéntico: se construye el limiter con el factory real de
/// la partición y se leen sus opciones.
/// </summary>
public class OnlineOrderRateLimitPolicyTests
{
    private static DefaultHttpContext ContextWithIp(string? ip, string? storeSlug = "tienda-ana")
    {
        var context = new DefaultHttpContext();
        context.Connection.RemoteIpAddress = ip is null ? null : IPAddress.Parse(ip);

        // El slug viaja en la RUTA (`/public/ordering/{storeSlug}/orders`), que es de donde lo lee
        // la policy: el cuerpo del request todavía no se ha enlazado a este punto del pipeline, así
        // que leerlo del body daría siempre null.
        if (storeSlug is not null)
        {
            context.Request.RouteValues = new RouteValueDictionary
            {
                ["storeSlug"] = storeSlug,
                ["controller"] = "PublicOrdering",
                ["action"] = "CreateOrder",
            };
        }

        return context;
    }

    private static SlidingWindowRateLimiter BuildLimiter(RateLimitPartition<string> partition)
        => (SlidingWindowRateLimiter)partition.Factory(partition.PartitionKey);

    private static SlidingWindowRateLimiterOptions OptionsOf(RateLimitPartition<string> partition)
    {
        // La BCL no expone las opciones de un `SlidingWindowRateLimiter` ya construido, así que se
        // lee la MISMA instancia de opciones que el factory de producción le pasó al limiter.
        var field = typeof(SlidingWindowRateLimiter)
            .GetField("_options", BindingFlags.NonPublic | BindingFlags.Instance);
        field.Should().NotBeNull();
        return (SlidingWindowRateLimiterOptions)field!.GetValue(BuildLimiter(partition))!;
    }

    [Fact]
    public void OnlineOrder_policy_options_match_production_config()
    {
        var options = OptionsOf(RateLimitPolicies.OnlineOrder(ContextWithIp(null)));

        options.PermitLimit.Should().Be(20);
        options.Window.Should().Be(TimeSpan.FromMinutes(10));
        options.SegmentsPerWindow.Should().Be(10, "reposición cada minuto en vez de los 20 de golpe");
        options.QueueLimit.Should().Be(0, "encolar pedidos anónimos solo convierte el spam en latencia");
    }

    /// <summary>
    /// El presupuesto es observable, no solo declarado: un limiter nuevo arranca exactamente con 20
    /// permisos y el runtime dice cuál es su límite al pedir de más. Es lo que distingue una política
    /// aplicada de una escrita en un comentario.
    /// </summary>
    [Fact]
    public void OnlineOrder_policy_limiter_allows_twenty_then_refuses()
    {
        var limiter = BuildLimiter(RateLimitPolicies.OnlineOrder(ContextWithIp("203.0.113.10")));

        limiter.ReplenishmentPeriod.Should().Be(TimeSpan.FromMinutes(1));
        limiter.GetStatistics().CurrentAvailablePermits.Should().Be(20);

        var tooMany = () => limiter.AttemptAcquire(21);
        tooMany.Should().Throw<ArgumentOutOfRangeException>().WithMessage("*permit limit of 20*");

        using var full = limiter.AttemptAcquire(20);
        full.IsAcquired.Should().BeTrue();
    }

    /// <summary>
    /// Dos slugs distintos desde la MISMA IP son cubos distintos. Es lo que evita que los pedidos de
    /// una tienda vacíen el presupuesto de la otra de un cliente legítimo detrás de un NAT.
    /// </summary>
    [Fact]
    public void OnlineOrder_partition_key_covers_both_ip_and_slug()
    {
        RateLimitPartition<string> first = RateLimitPolicies.OnlineOrder(ContextWithIp("203.0.113.10", "tienda-ana"));
        RateLimitPartition<string> sameSlugOtherIp = RateLimitPolicies.OnlineOrder(ContextWithIp("203.0.113.11", "tienda-ana"));
        RateLimitPartition<string> otherSlugSameIp = RateLimitPolicies.OnlineOrder(ContextWithIp("203.0.113.10", "tienda-bob"));

        sameSlugOtherIp.PartitionKey.Should().NotBe(first.PartitionKey, "la IP es parte de la partición");
        otherSlugSameIp.PartitionKey.Should().NotBe(first.PartitionKey, "el slug es parte de la partición");
        otherSlugSameIp.PartitionKey.Should().Contain("tienda-bob");
        otherSlugSameIp.PartitionKey.Should().Contain("203.0.113.10");
    }

    /// <summary>
    /// El slug lo escribe el usuario en la URL, así que la clave tiene que normalizarse: sin
    /// recorte ni minúsculas, <c>/Tienda-Ana/orders</c> y <c>/tienda-ana/orders</c> serían dos cubos
    /// y el límite se evadiría cambiando la capitalización en cada petición.
    /// </summary>
    [Theory]
    [InlineData("tienda-ana")]
    [InlineData("  TIENDA-ANA  ")]
    [InlineData("Tienda-Ana")]
    public void OnlineOrder_partition_key_normalizes_the_slug(string slug)
    {
        RateLimitPartition<string> reference = RateLimitPolicies.OnlineOrder(ContextWithIp("203.0.113.10", "tienda-ana"));
        RateLimitPartition<string> variant = RateLimitPolicies.OnlineOrder(ContextWithIp("203.0.113.10", slug));

        variant.PartitionKey.Should().Be(reference.PartitionKey);
    }

    /// <summary>
    /// Sin IP la clave no puede degenerar en cadena vacía: dos clientes sin IP compartida
    /// bloquearían el uno al otro, y el runtime trataría una clave vacía como un caso degenerado en
    /// lugar de un cubo real.
    /// </summary>
    [Fact]
    public void OnlineOrder_without_an_ip_still_partitions_on_the_slug()
    {
        RateLimitPartition<string> partition = RateLimitPolicies.OnlineOrder(ContextWithIp(null, "tienda-ana"));

        partition.PartitionKey.Should().NotBeNullOrWhiteSpace();
        partition.PartitionKey.Should().Contain("unknown");
        partition.PartitionKey.Should().Contain("tienda-ana");
    }

    /// <summary>
    /// El mismo contexto debe caer SIEMPRE en el mismo cubo. Si la clave se reconstruyera con datos
    /// inestables, el presupuesto nunca se acumularía y el límite sería inútil.
    /// </summary>
    [Fact]
    public void OnlineOrder_partition_key_is_stable_for_the_same_request()
    {
        RateLimitPartition<string> first = RateLimitPolicies.OnlineOrder(ContextWithIp("203.0.113.10"));
        RateLimitPartition<string> second = RateLimitPolicies.OnlineOrder(ContextWithIp("203.0.113.10"));

        second.PartitionKey.Should().Be(first.PartitionKey);
    }
}