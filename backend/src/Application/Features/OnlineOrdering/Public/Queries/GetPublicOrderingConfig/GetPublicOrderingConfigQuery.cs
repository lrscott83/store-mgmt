using Application.Abstractions.Messaging;
using Application.Dtos.OnlineOrdering;
using Application.Exceptions;
using Application.ResponseModels;
using Domain.Entities.StoreCatalogSettings;
using Domain.Entities.Stores;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.OnlineOrdering.Public.Queries.GetPublicOrderingConfig
{
    /// <summary>
    /// Configuración de pedidos que lee el storefront, por slug (anónimo).
    ///
    /// Es la puerta de entrada del pedido online: el carrito solo se ofrece si esto responde
    /// `Enabled = true`. Por eso una tienda SIN fila no es un 404 sino `Enabled = false` — acaba
    /// de sincronizar el catálogo y todavía no ha abierto pedidos; el catálogo público y los
    /// pedidos son dos interruptores distintos.
    ///
    /// 404 uniforme, igual que <c>GetPublicCatalogQuery</c>: un slug que no existe y una tienda sin
    /// catálogo publicado responden EXACTAMENTE igual, para que el anónimo no pueda usar el
    /// endpoint para averiguar qué tiendas existen.
    ///
    /// OJO — filtro global por tenant: la configuración se lee con `GetPublicByStoreIdAsync`, la
    /// lectura PÚBLICA del repositorio, que salta ese filtro. Con la lectura de sesión el anónimo
    /// no obtendría fila alguna. Ver la nota del handler y del repositorio.
    /// </summary>
    public sealed record GetPublicOrderingConfigQuery(string StoreSlug) : IQuery<PublicOrderingConfigDto>;

    public class GetPublicOrderingConfigQueryHandler
        : IQueryHandler<GetPublicOrderingConfigQuery, PublicOrderingConfigDto>
    {
        private readonly IStoreRepository _storeRepository;
        private readonly IStoreCatalogSettingsRepository _storeCatalogSettingsRepository;
        private readonly IStringLocalizer<I18n> _localizer;

        public GetPublicOrderingConfigQueryHandler(
            IStoreRepository storeRepository,
            IStoreCatalogSettingsRepository storeCatalogSettingsRepository,
            IStringLocalizer<I18n> localizer)
        {
            _storeRepository = storeRepository;
            _storeCatalogSettingsRepository = storeCatalogSettingsRepository;
            _localizer = localizer;
        }

        public async Task<ResponseResult<PublicOrderingConfigDto>> Handle(
            GetPublicOrderingConfigQuery query, CancellationToken cancellationToken)
        {
            Store? store = string.IsNullOrWhiteSpace(query.StoreSlug)
                ? null
                : await _storeRepository.GetStoreByCatalogSlugAsync(query.StoreSlug.Trim().ToLowerInvariant());

            if (store == null || store.CatalogSlug == null)
                throw new ApiException(_localizer["CatalogStoreNotFound"], HttpStatusCode.NotFound);

            // Lectura PÚBLICA, no la de sesión: `GetPublicByStoreIdAsync` salta el filtro global
            // por tenant, que en una petición anónima no puede coincidir con ninguna fila (el
            // anónimo no tiene tenant en el contexto). Con la lectura de sesión esta query
            // devolvería VACÍA siempre y el storefront vería `Enabled = false` para siempre.
            // Lo que acota el resultado es el `StoreId`, que el slug ya resolvió y es único global.
            StoreCatalogSettings? settings = await _storeCatalogSettingsRepository.GetPublicByStoreIdAsync(store.Id);

            return ResponseResult.Success(new PublicOrderingConfigDto
            {
                // Sin fila = pedidos cerrados. El interruptor lo enciende el dueño; que el catálogo
                // esté publicado no lo enciende por él.
                Enabled = settings?.Enabled ?? false,
                PickupEnabled = settings?.PickupEnabled ?? false,
                DeliveryEnabled = settings?.DeliveryEnabled ?? false,
                DeliveryFee = settings?.DeliveryFee ?? 0m,
                MinimumOrderAmount = settings?.MinimumOrderAmount ?? 0m,
                BusinessHours = settings?.BusinessHours,
                DeliveryZones = settings?.DeliveryZones,
                // El storefront siempre tiene que pintar algo: sin fila (o con una paleta en
                // blanco) se cae a la paleta que el catálogo ya usa hoy.
                PaletteId = string.IsNullOrWhiteSpace(settings?.PaletteId)
                    ? StoreCatalogSettings.DefaultPaletteId
                    : settings.PaletteId,
            });
        }
    }
}