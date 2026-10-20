using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Common.Enums;
using Domain.Entities.CatalogEvents;
using Domain.Entities.Stores;
using Domain.Interfaces.Repositories;

namespace Application.Features.WebCatalog.Public.Commands.RecordCatalogEvents
{
    /// <summary>
    /// Cuerpo del beacon público: un lote pequeño de eventos anónimos. El cliente no manda
    /// usuario, IP, precios ni nada que el servidor no pueda verificar.
    /// </summary>
    public sealed class RecordCatalogEventsRequest
    {
        public List<CatalogEventRequest>? Events { get; set; }
    }

    public sealed class CatalogEventRequest
    {
        public string? Name { get; set; }
        public string? Path { get; set; }
        public Guid? ProductId { get; set; }
        public string? Referrer { get; set; }
        public string? UtmSource { get; set; }
        public string? UtmMedium { get; set; }
        public string? UtmCampaign { get; set; }
    }

    public sealed record RecordCatalogEventsCommand(string StoreSlug, string UserAgent,
        IReadOnlyCollection<CatalogEventRequest> Events) : ICommand<bool>;

    /// <summary>
    /// Alta de los eventos del catálogo. Es un endpoint PÚBLICO y de mejor esfuerzo: un slug
    /// desconocido, un bot o un evento inválido NO devuelven error —simplemente no se guarda nada—,
    /// porque el storefront nunca debe romperse por su telemetría.
    /// </summary>
    public sealed class RecordCatalogEventsCommandHandler : ICommandHandler<RecordCatalogEventsCommand, bool>
    {
        private const int MaxEventsPerRequest = 10;

        private readonly IStoreRepository _storeRepository;
        private readonly ICatalogEventRepository _catalogEventRepository;
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IHttpContextService _httpContextService;

        public RecordCatalogEventsCommandHandler(
            IStoreRepository storeRepository,
            ICatalogEventRepository catalogEventRepository,
            IApplicationUnitOfWork applicationUnitOfWork,
            IHttpContextService httpContextService)
        {
            _storeRepository = storeRepository;
            _catalogEventRepository = catalogEventRepository;
            _applicationUnitOfWork = applicationUnitOfWork;
            _httpContextService = httpContextService;
        }

        public async Task<ResponseResult<bool>> Handle(RecordCatalogEventsCommand request,
            CancellationToken cancellationToken)
        {
            if (request.Events is null || request.Events.Count == 0)
                return ResponseResult.Success(false);

            if (CatalogBotDetector.IsBot(request.UserAgent))
                return ResponseResult.Success(false);

            Store? store = string.IsNullOrWhiteSpace(request.StoreSlug)
                ? null
                : await _storeRepository.GetStoreByCatalogSlugAsync(request.StoreSlug.Trim().ToLowerInvariant());

            if (store is null || store.CatalogSlug is null)
                return ResponseResult.Success(false);

            DateTime now = DateTime.UtcNow;
            string ipAddress = _httpContextService.IPAddress;
            string visitorHash = CatalogTelemetryHash.Visitor(store.Id, ipAddress, request.UserAgent, now);
            string sessionHash = CatalogTelemetryHash.Session(store.Id, visitorHash, now);
            CatalogDeviceType deviceType = CatalogDeviceClassifier.Resolve(request.UserAgent);

            var events = new List<CatalogEvent>();
            foreach (CatalogEventRequest item in request.Events.Take(MaxEventsPerRequest))
            {
                CatalogEventType? type = ParseType(item.Name);
                if (!type.HasValue)
                    continue;

                (CatalogSource source, string? referrerHost) = CatalogSourceClassifier.Resolve(
                    item.UtmSource, item.UtmMedium, item.Referrer);

                events.Add(CatalogEvent.Create(
                    store.Id,
                    store.TenantId,
                    now,
                    type.Value,
                    visitorHash,
                    sessionHash,
                    BuildPath(item.Path, store.CatalogSlug),
                    BuildProductId(item.ProductId, type.Value),
                    source,
                    referrerHost,
                    Truncate(item.UtmSource, CatalogEvent.UtmMaxLength),
                    Truncate(item.UtmMedium, CatalogEvent.UtmMaxLength),
                    Truncate(item.UtmCampaign, CatalogEvent.UtmMaxLength),
                    deviceType));
            }

            if (events.Count == 0)
                return ResponseResult.Success(false);

            await _catalogEventRepository.AddRangeAsync(events);
            await _applicationUnitOfWork.SaveChangesAsync(cancellationToken);
            return ResponseResult.Success(true);
        }

        private static CatalogEventType? ParseType(string? name)
            => name?.Trim().ToLowerInvariant() switch
            {
                "page_view" => CatalogEventType.PageView,
                "product_view" => CatalogEventType.ProductView,
                "add_to_cart" => CatalogEventType.AddToCart,
                "checkout_open" => CatalogEventType.CheckoutOpen,
                _ => null,
            };

        private static string BuildPath(string? path, string storeSlug)
        {
            string value = path?.Trim() ?? string.Empty;
            return value.Length == 0
                ? $"/catalog/{storeSlug}"
                : Truncate(value, CatalogEvent.PathMaxLength)!;
        }

        private static Guid? BuildProductId(Guid? productId, CatalogEventType type)
            => type is CatalogEventType.ProductView or CatalogEventType.AddToCart
               && productId.HasValue
               && productId.Value != Guid.Empty
                ? productId
                : null;

        private static string? Truncate(string? value, int maxLength)
        {
            if (string.IsNullOrWhiteSpace(value))
                return null;

            string trimmed = value.Trim();
            return trimmed.Length <= maxLength ? trimmed : trimmed[..maxLength];
        }
    }
}
