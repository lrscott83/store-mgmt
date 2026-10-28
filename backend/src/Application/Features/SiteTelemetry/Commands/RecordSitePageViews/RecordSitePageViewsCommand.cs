using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Features.WebCatalog.Public;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Common.Enums;
using Domain.Entities.SiteTelemetry;
using Domain.Interfaces.Repositories;

namespace Application.Features.SiteTelemetry.Commands.RecordSitePageViews
{
    /// <summary>
    /// Cuerpo del beacon público de páginas: un lote pequeño de vistas anónimas. El cliente solo
    /// manda el nombre del evento, la ruta, el referrer y los UTM. Ni usuario, ni IP, ni precios.
    /// </summary>
    public sealed class RecordSitePageViewsRequest
    {
        public List<SitePageViewRequest>? Events { get; set; }
    }

    public sealed class SitePageViewRequest
    {
        public string? Name { get; set; }
        public string? Path { get; set; }
        public string? Referrer { get; set; }
        public string? UtmSource { get; set; }
        public string? UtmMedium { get; set; }
        public string? UtmCampaign { get; set; }
    }

    public sealed record RecordSitePageViewsCommand(string UserAgent,
        IReadOnlyCollection<SitePageViewRequest> Events) : ICommand<bool>;

    /// <summary>
    /// Alta de las visitas a páginas públicas del sitio. Es un endpoint PÚBLICO y de mejor
    /// esfuerzo: un path fuera de la lista cerrada, un bot o un evento inválido NO devuelven error
    /// —simplemente no se guarda nada—, porque la página nunca debe romperse por su telemetría.
    /// </summary>
    public sealed class RecordSitePageViewsCommandHandler
        : ICommandHandler<RecordSitePageViewsCommand, bool>
    {
        private const int MaxEventsPerRequest = 10;
        private const string PageViewEventName = "page_view";

        private readonly ISiteEventRepository _siteEventRepository;
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IHttpContextService _httpContextService;

        public RecordSitePageViewsCommandHandler(
            ISiteEventRepository siteEventRepository,
            IApplicationUnitOfWork applicationUnitOfWork,
            IHttpContextService httpContextService)
        {
            _siteEventRepository = siteEventRepository;
            _applicationUnitOfWork = applicationUnitOfWork;
            _httpContextService = httpContextService;
        }

        public async Task<ResponseResult<bool>> Handle(RecordSitePageViewsCommand request,
            CancellationToken cancellationToken)
        {
            if (request.Events is null || request.Events.Count == 0)
                return ResponseResult.Success(false);

            if (CatalogBotDetector.IsBot(request.UserAgent))
                return ResponseResult.Success(false);

            DateTime now = DateTime.UtcNow;
            string ipAddress = _httpContextService.IPAddress;
            string visitorHash = SiteTelemetryHash.Visitor(ipAddress, request.UserAgent, now);
            string sessionHash = SiteTelemetryHash.Session(visitorHash, now);
            CatalogDeviceType deviceType = CatalogDeviceClassifier.Resolve(request.UserAgent);

            var events = new List<SiteEvent>();
            foreach (SitePageViewRequest item in request.Events.Take(MaxEventsPerRequest)
                         .Where(item => item is not null))
            {
                // Solo `page_view`: el manual lo escribe el servidor, no este beacon.
                if (!string.Equals(item.Name?.Trim(), PageViewEventName, StringComparison.OrdinalIgnoreCase))
                    continue;

                string? path = SiteEventCatalog.NormalizePagePath(item.Path);
                if (path is null)
                    continue;

                (CatalogSource source, string? referrerHost) = CatalogSourceClassifier.Resolve(
                    item.UtmSource, item.UtmMedium, item.Referrer);

                events.Add(SiteEvent.CreatePageView(
                    now,
                    path,
                    visitorHash,
                    sessionHash,
                    source,
                    referrerHost,
                    Truncate(item.UtmSource),
                    Truncate(item.UtmMedium),
                    Truncate(item.UtmCampaign),
                    deviceType));
            }

            if (events.Count == 0)
                return ResponseResult.Success(false);

            await _siteEventRepository.AddRangeAsync(events);
            await _applicationUnitOfWork.SaveChangesAsync(cancellationToken);
            return ResponseResult.Success(true);
        }

        private static string? Truncate(string? value)
        {
            if (string.IsNullOrWhiteSpace(value))
                return null;

            string trimmed = value.Trim();
            return trimmed.Length <= SiteEvent.UtmMaxLength ? trimmed : trimmed[..SiteEvent.UtmMaxLength];
        }
    }
}
