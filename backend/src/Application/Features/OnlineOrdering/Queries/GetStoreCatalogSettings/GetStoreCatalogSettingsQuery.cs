using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Dtos.OnlineOrdering;
using Application.Exceptions;
using Application.ResponseModels;
using Domain.Common.Extensions;
using Domain.Entities.StoreCatalogSettings;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.OnlineOrdering.Queries.GetStoreCatalogSettings
{
    /// <summary>
    /// Configuración de pedidos de la tienda seleccionada (vista "Pedidos WhatsApp", F1).
    ///
    /// Si la tienda todavía no tiene fila NO se devuelve un 404: se devuelven los valores por
    /// defecto, con `Enabled = false`. La razón es de negocio, no de ergonomía: una tienda recién
    /// sincronizada tiene catálogo publicado y AÚN NO acepta pedidos, porque el interruptor lo
    /// enciende el dueño. Un 404 obligaría al frontend a modelar "no configurado" como un estado
    /// de error distinto del que ocurre cuando algo falla de verdad.
    ///
    /// La MARCA no se lee aquí: es de F8 y de la vista Catálogo Web (D19 — misma fila, dos vistas,
    /// dos columnas).
    /// </summary>
    public sealed record GetStoreCatalogSettingsQuery : IQuery<StoreCatalogSettingsDto>;

    public class GetStoreCatalogSettingsQueryHandler : IQueryHandler<GetStoreCatalogSettingsQuery, StoreCatalogSettingsDto>
    {
        private readonly IHttpContextService _httpContextService;
        private readonly IStoreCatalogSettingsRepository _storeCatalogSettingsRepository;
        private readonly IStringLocalizer<I18n> _localizer;

        public GetStoreCatalogSettingsQueryHandler(
            IHttpContextService httpContextService,
            IStoreCatalogSettingsRepository storeCatalogSettingsRepository,
            IStringLocalizer<I18n> localizer)
        {
            _httpContextService = httpContextService;
            _storeCatalogSettingsRepository = storeCatalogSettingsRepository;
            _localizer = localizer;
        }

        public async Task<ResponseResult<StoreCatalogSettingsDto>> Handle(
            GetStoreCatalogSettingsQuery query, CancellationToken cancellationToken)
        {
            Guid storeId = _httpContextService.StoreId.ToGuid();
            if (storeId == Guid.Empty)
                throw new ApiException(_localizer["StoreNotSelected", _httpContextService.UserExternalId], HttpStatusCode.BadRequest);

            StoreCatalogSettings? settings = await _storeCatalogSettingsRepository.GetByStoreIdAsync(storeId);

            // Sin fila: los mismos valores con los que `StoreCatalogSettings` nace — pedidos
            // cerrados, sin número y sin modalidades.
            return ResponseResult.Success(settings is null
                ? StoreCatalogSettingsDtoMapper.Default()
                : StoreCatalogSettingsDtoMapper.ToDto(settings));
        }
    }
}