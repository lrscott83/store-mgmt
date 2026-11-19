using System.Net;
using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Dtos.StoreClientErrors;
using Application.Exceptions;
using Application.ResponseModels;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;

namespace Application.Features.StoreClientErrors.Queries.GetClientErrors
{
    /// <summary>
    /// Lectura del panel SuperAdmin de errores del POS (specs S6 y S7).
    ///
    /// Doble candado de autorización, igual que el resto de la administración: el atributo
    /// `[HasPermission(SuperAdmin)]` del controlador corta antes, y este gate corta cualquier
    /// llamada que llegue por otro camino. La tabla no tiene filtro por tenant a propósito (ver
    /// `StoreClientErrorEntityTypeConfiguration`): el SuperAdmin ve TODAS las tiendas.
    ///
    /// El recorte de `page`/`pageSize` vive AQUÍ y en ningún otro sitio; los valores efectivos
    /// viajan de vuelta en el DTO para que el cliente los ecoe sin recalcular nada.
    /// </summary>
    public sealed class GetClientErrorsQueryHandler
        : IQueryHandler<GetClientErrorsQuery, StoreClientErrorsPageDto>
    {
        private readonly IHttpContextService _httpContextService;
        private readonly IStoreClientErrorRepository _storeClientErrorRepository;
        private readonly IStringLocalizer<I18n> _localizer;

        public GetClientErrorsQueryHandler(IHttpContextService httpContextService,
            IStoreClientErrorRepository storeClientErrorRepository,
            IStringLocalizer<I18n> localizer)
        {
            _httpContextService = httpContextService;
            _storeClientErrorRepository = storeClientErrorRepository;
            _localizer = localizer;
        }

        public async Task<ResponseResult<StoreClientErrorsPageDto>> Handle(GetClientErrorsQuery query,
            CancellationToken cancellationToken)
        {
            if (!_httpContextService.IsSuperAdmin)
                throw new ApiException(_localizer["Unauthorized"], HttpStatusCode.Forbidden);

            int page = query.Page < 1 ? 1 : query.Page;
            int pageSize = Math.Clamp(query.PageSize, 1, StoreClientErrorsPageSize.Max);

            StoreClientErrorsPage result = await _storeClientErrorRepository.GetPageAsync(
                new StoreClientErrorsFilter(query.OwnerId, query.StoreId, query.From, query.To, page, pageSize),
                cancellationToken);

            return ResponseResult.Success(new StoreClientErrorsPageDto
            {
                TotalCount = result.TotalCount,
                Page = page,
                PageSize = pageSize,
                Items = result.Items.Select(ToItem).ToList(),
            });
        }

        /// <summary>
        /// Copia fila → DTO sin inventar nada: un owner o una tienda ausente se quedan en NULL y la
        /// vista pinta el guion (spec S4).
        /// </summary>
        private static StoreClientErrorItemDto ToItem(StoreClientErrorRow row) => new()
        {
            Id = row.Id,
            StoreId = row.StoreId,
            OwnerName = row.OwnerName,
            StoreName = row.StoreName,
            Message = row.Message,
            Route = row.Route,
            Location = row.Location,
            Count = row.Count,
            Context = row.Context,
            AppVersion = row.AppVersion,
            Device = row.Device,
            OccurredAt = row.OccurredAt,
            ReceivedAt = row.ReceivedAt,
        };
    }
}
