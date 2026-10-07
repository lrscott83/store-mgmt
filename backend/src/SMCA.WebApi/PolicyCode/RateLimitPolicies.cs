using Microsoft.AspNetCore.Http;
using System.Threading.RateLimiting;

namespace SMCA.WebApi.PolicyCode;

/// <summary>
/// Factory methods for the API rate-limit partitions. Extracted verbatim from
/// Program.cs (additive rate-limiter registration) so the configured options
/// and partition keys can be unit-tested. Behavior is identical to the inline
/// policies. As of H-12, the limiter is active under all environments
/// including "Testing", so E2E tests can now exercise 429 responses.
/// </summary>
public static class RateLimitPolicies
{
    public static RateLimitPartition<string> Login(HttpContext context)
        => RateLimitPartition.GetSlidingWindowLimiter(
            partitionKey: context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new SlidingWindowRateLimiterOptions
            {
                // Raised 15 -> 30 (H-12, 2026-08-23): with the rate limiter now
                // active under Testing (H-12 fix), the .NET E2E suite's parallel
                // login tests share a single in-memory limiter and exhaust 15/min.
                // 30/min is still a hard ceiling for production abuse while giving
                // the test suite safe headroom.
                PermitLimit = 40,
                Window = TimeSpan.FromMinutes(1),
                SegmentsPerWindow = 3,
                QueueLimit = 0
            });

    public static RateLimitPartition<string> Register(HttpContext context)
        => RateLimitPartition.GetSlidingWindowLimiter(
            partitionKey: context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new SlidingWindowRateLimiterOptions
            {
                // Raised 10 -> 50 (user decision 2026-08-15): the E2E suite grew past
                // the old 10-per-window budget (register.spec + persona mints + roster
                // recovery ≈ 8-10 registrations per run), so repeated full runs tripped
                // the limiter. SegmentsPerWindow stays 10 -> each 1-min segment
                // replenishes 5 permits.
                PermitLimit = 50,
                Window = TimeSpan.FromMinutes(10),
                SegmentsPerWindow = 10,
                QueueLimit = 0
            });

    /// <summary>
    /// Límite del ALTA de pedidos online (`POST /api/v1/public/ordering/{storeSlug}/orders`,
    /// F3). Es un endpoint anónimo que ESCRIBE, así que necesita su propio presupuesto.
    ///
    /// 20 pedidos por cada 10 minutos, repuestos de 2 en 2 cada minuto (`SegmentsPerWindow = 10`):
    /// un cliente real que hace un pedido cada pocos minutos no nota el límite, y un script que
    /// inunde se queda sin permisos a mitad del segundo minuto.
    ///
    /// La partición es IP + SLUG, y las dos partes hacen falta:
    ///   * solo por IP, los pedidos de una tienda agotarían el presupuesto de las OTRAS tiendas del
    ///     mismo cliente detrás de un NAT (oficina, red móvil) — un error de la tienda, no un abuso;
    ///   * solo por slug, un atacante que rotara slugs desde una IP ganaría el doble de presupuesto
    ///     y, peor, dejaría el límite de una tiendavalidado para el resto de sus clientes.
    ///
    /// El slug se normaliza (recortado + minúsculas) porque lo escribe el usuario en la URL: sin
    /// eso, `/Tienda-Ana/orders` y `/tienda-ana/orders` serían dos cubos y el límite se evadiría
    /// cambiando mayúsculas en cada petición.
    /// </summary>
    public static RateLimitPartition<string> OnlineOrder(HttpContext context)
        => RateLimitPartition.GetSlidingWindowLimiter(
            partitionKey: OnlineOrderPartitionKey(context),
            factory: _ => new SlidingWindowRateLimiterOptions
            {
                PermitLimit = 20,
                Window = TimeSpan.FromMinutes(10),
                // 10 segmentos de 1 minuto = 2 permisos/minuto de reposición. Con un solo segmento
                // los 20 permisos volverían de golpe al abrirse la ventana, que es justo el patrón
                // de ráfaga que esta política existe para impedir.
                SegmentsPerWindow = 10,
                QueueLimit = 0
            });

    /// <summary>
    /// Clave de partición del pedido online: IP + slug, con el slug normalizado. Sin IP (proxy que
    /// no la expone) cae a "unknown" — nunca a cadena vacía, que el runtime trata como caso
    /// degenerado en vez de un cubo real.
    /// </summary>
    private static string OnlineOrderPartitionKey(HttpContext context)
    {
        string ip = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";

        // El slug viaja en la RUTA. El cuerpo del request todavía no está enlazado a este punto del
        // pipeline (el rate limiter corre antes del model binding), así que leerlo de ahí daría null.
        string slug = context.Request.RouteValues.TryGetValue("storeSlug", out object? value) && value is string routeSlug
            ? routeSlug.Trim().ToLowerInvariant()
            : string.Empty;

        return $"{ip}|{slug}";
    }
}
