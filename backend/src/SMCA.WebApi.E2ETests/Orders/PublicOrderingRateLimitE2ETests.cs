using System.Diagnostics;
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
///
/// <para><b>Por qué este archivo NO afirma "la 21ª es 429" y cómo ata igualmente el presupuesto
/// (R3-002).</b> La reposición de <c>OnlineOrderPolicy</c> es de 2 permisos por minuto
/// (<c>Window</c> = 10 min, <c>SegmentsPerWindow</c> = 10), así que el número de pedidos que pasan
/// antes del 429 depende del RELOJ de la máquina: afirmar "exactamente 20" sin más convertía al test
/// en un reloj de pared. Afirmar "al menos 20 y luego 429", en cambio, dejaba en verde cualquier
/// límite entre 20 y 30 — que era el hueco real del hallazgo.
/// </para>
/// <para>
/// La salida es atar el techo al reloj en vez de a una constante inventada: la ventana es de
/// segmentos DISCRETOS, así que mientras no se cierra un segmento entero (1 minuto) NO se repone ni
/// un permiso, y el techo real del cubo durante la corrida es
/// <c>20 + 2 × minutos_completos_transcurridos</c>. En una corrida normal —estos tres tests duran
/// segundos— el techo es <b>exactamente 20</b> y el bucle tiene que ver 20, no 25 ni 30. Si el
/// presupuesto sube a 25, este archivo se pone rojo; si la máquina va tan lenta que el bucle tarda
/// más de un minuto, el techo se ensancha solo con la reposición REAL y el test sigue siendo cierto.
/// No hay forma de que se vuelva flaky por reloj.
/// </para>
/// <para>
/// Y la magnitud exacta sigue fijada, en el sitio donde el reloj no estorba:
/// <c>Application.Tests/Features/OnlineOrdering/OnlineOrderRateLimitPolicyTests</c> lee las opciones
/// del limiter de producción (<c>PermitLimit = 20</c>, ventana, segmentos, cola) y además hace
/// <c>AttemptAcquire(21)</c> esperando el error "permit limit of 20". Ese test es determinista; este
/// es el que demuestra que el PIPELINE real aplica esa política, que es lo que los unitarios —
/// que inyectan <c>RouteValues</c> a mano— no pueden ver.
/// </para>
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

    /// <summary>
    /// Permisos que repone la ventana por minuto cerrado: <c>PermitLimit</c> (20) repartidos en
    /// <c>Window / SegmentsPerWindow</c> = 10 segmentos de 1 minuto ⇒ <b>2 por minuto</b>. Es el
    /// dato con el que <see cref="BudgetCeiling"/> deriva el techo real del cubo durante la corrida,
    /// y viene de las MISMAS opciones que fija
    /// <c>OnlineOrderRateLimitPolicyTests.OnlineOrder_policy_options_match_production_config</c>.
    /// Si la política cambiara esos números, ese unitario se pondría rojo primero.
    /// </summary>
    private const int PermitsReplenishedPerMinute = 2;

    private readonly AppTestFactory _f;

    public PublicOrderingRateLimitE2ETests(WebAppFixture fixture) => _f = fixture.Factory;

    /// <summary>
    /// El techo REAL del cubo mientras dure la corrida, derivado del reloj en vez de hardcodeado.
    /// La ventana deslizante es de segmentos DISCRETOS: hasta que no se cierra un segmento entero
    /// de 1 minuto no entra ni un permiso, así que con menos de un minuto el techo es exactamente
    /// el presupuesto. Pasa un minuto, y el techo sube exactamente lo que la política repone.
    /// </summary>
    private static int BudgetCeiling(TimeSpan elapsed)
        => PermitLimit + (int)((long)elapsed.TotalMinutes * PermitsReplenishedPerMinute);

    /// <summary>
    /// El presupuesto NO SE MOVIÓ mientras el cubo se agotaba. Con la corrida normal (segundos) el
    /// techo es <see cref="PermitLimit"/> y el bucle tiene que haber visto exactamente eso: un
    /// límite de 25 o de 30 lo pone rojo, que es el hueco que este caso deja cerrado.
    /// </summary>
    private static void AssertBudgetHeld(BucketExhaustion exhaustion)
    {
        int ceiling = BudgetCeiling(exhaustion.Elapsed);

        exhaustion.Allowed.Should().BeInRange(PermitLimit, ceiling,
            $"el cubo arranca con {PermitLimit} permisos y solo repone {PermitsReplenishedPerMinute} por "
            + $"minuto cerrado; la corrida duró {exhaustion.Elapsed.TotalSeconds:F1} s, luego el techo real "
            + $"era {ceiling}. Si hay {exhaustion.Allowed} pedidos aceptados, el presupuesto real no es {PermitLimit}");
    }

    private async Task<HttpStatusCode> PostOrderAsync(
        PublicOrderingSeed.OrderingFixture fixture, string? slug = null)
    {
        var response = await _f.CreateClient().PostAsJsonAsync(
            $"/api/v1/public/ordering/{slug ?? fixture.Slug}/orders",
            PublicOrderingSeed.CreateOrderBody(fixture.ProductId, fixture.Phone));
        return response.StatusCode;
    }

    /// <summary>
    /// Dispara pedidos hasta agotar el cubo del slug. Devuelve cuántos pasaron, si apareció un 429
    /// y cuánto duró la corrida —el tiempo es lo que permite atar el presupuesto sin depender del
    /// reloj—. Corta en cuanto lo ve: seguir gastando permisos de otros casos no aporta nada.
    /// </summary>
    private async Task<BucketExhaustion> ExhaustAsync(PublicOrderingSeed.OrderingFixture fixture)
    {
        var client = _f.CreateClient();
        var clock = Stopwatch.StartNew();
        int allowed = 0;
        for (int attempt = 0; attempt < PermitLimit + SpareRequests; attempt++)
        {
            var response = await client.PostAsJsonAsync(
                $"/api/v1/public/ordering/{fixture.Slug}/orders",
                PublicOrderingSeed.CreateOrderBody(fixture.ProductId, fixture.Phone));

            if (response.StatusCode == HttpStatusCode.TooManyRequests)
                return new BucketExhaustion(allowed, true, clock.Elapsed);

            response.StatusCode.Should().Be(HttpStatusCode.OK,
                $"el pedido {attempt + 1} iba dentro del presupuesto ({PermitLimit})");
            allowed++;
        }

        return new BucketExhaustion(allowed, false, clock.Elapsed);
    }

    [Fact]
    public async Task R2_1_the_exceeding_post_is_rejected_with_429_by_the_middleware()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        try
        {
            var exhaustion = await ExhaustAsync(fixture);

            AssertBudgetHeld(exhaustion);

            exhaustion.Throttled.Should().BeTrue(
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
            var exhaustion = await ExhaustAsync(first);
            AssertBudgetHeld(exhaustion);
            exhaustion.Throttled.Should().BeTrue();

            (await PostOrderAsync(second)).Should().Be(HttpStatusCode.OK,
                "el slug B tiene su propio presupuesto aunque venga de la misma IP");
            (await PostOrderAsync(first)).Should().Be(HttpStatusCode.TooManyRequests,
                "y el slug A sigue agotado: no se rinde el límite al primer slug que se agota");
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
            var exhaustion = await ExhaustAsync(fixture);
            AssertBudgetHeld(exhaustion);
            exhaustion.Throttled.Should().BeTrue();

            (await PostOrderAsync(fixture, fixture.Slug.ToUpperInvariant()))
                .Should().Be(HttpStatusCode.TooManyRequests,
                    "el slug se normaliza antes de partir la ventana");
        }
        finally
        {
            await PublicOrderingSeed.CleanupAsync(_f, fixture);
        }
    }

    /// <summary>
    /// Lo que volvió el bucle que agota un cubo: cuántos pedidos entraron antes del 429, si
    /// apareció, y cuánto tardó. El <see cref="TimeSpan"/> es lo que permite atar el presupuesto al
    /// reloj real en vez de a una constante (ver <see cref="BudgetCeiling"/>).
    /// </summary>
    private sealed record BucketExhaustion(int Allowed, bool Throttled, TimeSpan Elapsed);
}
