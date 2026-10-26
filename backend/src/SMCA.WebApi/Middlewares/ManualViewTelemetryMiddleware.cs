using Application.Abstractions.HttpContext;
using Application.Features.SiteTelemetry;
using Application.Features.WebCatalog.Public;
using Application.UnitOfWorks;
using Domain.Common.Enums;
using Domain.Entities.SiteTelemetry;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Configuration;

namespace SMCA.WebApi.Middlewares
{
    /// <summary>
    /// Cuenta las entradas al manual de usuario. El manual se sirve como archivo ESTÁTICO bajo
    /// `/api/manual` (ver `Program.cs`), así que no pasa por el router de React ni por `apiClient`:
    /// el único punto donde se puede medir es el servidor.
    ///
    /// Reglas (una sola copia: `SiteEventCatalog.TryResolveManualView`):
    ///   * solo `200` — un `304` es la revalidación de `Cache-Control: no-cache`, no una visita;
    ///   * el HTML (`/api/manual`, `/api/manual/`, `/api/manual/index.html`) y el PDF son DOS
    ///     entradas distintas;
    ///   * `/api/manual/images/*` no cuenta: serían ~54 filas por visita.
    ///
    /// Se ejecuta en el pipeline, antes de los estáticos del manual, y corre DESPUÉS de servir la
    /// respuesta para conocer el status. Un fallo al guardar nunca rompe la descarga: se registra
    /// y el visitante ya tiene su archivo.
    /// </summary>
    public sealed class ManualViewTelemetryMiddleware
    {
        private readonly RequestDelegate _next;
        private readonly ILogger<ManualViewTelemetryMiddleware> _logger;

        public ManualViewTelemetryMiddleware(RequestDelegate next, ILogger<ManualViewTelemetryMiddleware> logger)
        {
            _next = next;
            _logger = logger;
        }

        public async Task InvokeAsync(HttpContext context, ISiteEventRepository repository,
            IApplicationUnitOfWork unitOfWork, IHttpContextService httpContextService,
            IConfiguration configuration)
        {
            await _next(context);

            try
            {
                await TryRecordAsync(context, repository, unitOfWork, httpContextService, configuration);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "No se pudo registrar la visita al manual de usuario.");
            }
        }

        private async Task TryRecordAsync(HttpContext context, ISiteEventRepository repository,
            IApplicationUnitOfWork unitOfWork, IHttpContextService httpContextService,
            IConfiguration configuration)
        {
            string path = context.Request.Path.Value ?? string.Empty;
            if (!path.StartsWith(SiteEventCatalog.ManualRootPath, StringComparison.Ordinal))
                return;

            if (!SiteEventCatalog.TryResolveManualView(path, context.Response.StatusCode, out string canonicalPath))
                return;

            // La clave de anonimización es REQUERIDA: nunca se cae al secreto de firma del JWT ni a
            // una constante del repositorio. Sin clave no se escribe nada (la respuesta ya salió,
            // así que fallar aquí no rompería la descarga; simplemente no se registra).
            string? salt = configuration["SiteTelemetry:Salt"] ?? configuration["CatalogTelemetry:Salt"];
            if (string.IsNullOrWhiteSpace(salt))
            {
                _logger.LogWarning(
                    "Telemetría del manual deshabilitada: falta SiteTelemetry:Salt (o CatalogTelemetry:Salt).");
                return;
            }

            string userAgent = context.Request.Headers.UserAgent.ToString();
            if (CatalogBotDetector.IsBot(userAgent))
                return;

            DateTime now = DateTime.UtcNow;
            string visitorHash = SiteTelemetryHash.Visitor(httpContextService.IPAddress, userAgent, now, salt);
            string sessionHash = SiteTelemetryHash.Session(visitorHash, now);
            (CatalogSource source, string? referrerHost) = CatalogSourceClassifier.Resolve(
                null, null, context.Request.Headers.Referer.ToString());

            await repository.AddAsync(SiteEvent.CreateManualView(
                now,
                canonicalPath,
                context.Response.StatusCode,
                visitorHash,
                sessionHash,
                source,
                referrerHost,
                CatalogDeviceClassifier.Resolve(userAgent)));
            await unitOfWork.SaveChangesAsync(context.RequestAborted);
        }
    }
}
