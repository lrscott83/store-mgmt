using Application.Abstractions.Messaging;
using Application.Abstractions.Storage;
using Application.Exceptions;
using Application.ResponseModels;
using Domain.Entities.Stores;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.WebCatalog.Public.Queries.GetCatalogMedia
{
    /// <summary>Resultado listo para servir por HTTP: el controlador no toca el disco.</summary>
    public sealed record CatalogMediaFile(Stream Content, string ContentType, long Length);

    /// <summary>
    /// Sirve una imagen del catálogo publicado. Anónimo: la clave solo se acepta si pertenece a la
    /// tienda del slug pedido, así que adivinar una clave no da acceso a imágenes de otra tienda.
    /// </summary>
    public sealed record GetCatalogMediaQuery(string StoreSlug, string Key) : IQuery<CatalogMediaFile>;

    public class GetCatalogMediaQueryHandler : IQueryHandler<GetCatalogMediaQuery, CatalogMediaFile>
    {
        private readonly IStoreRepository _storeRepository;
        private readonly ICatalogImageStorage _catalogImageStorage;
        private readonly IStringLocalizer<I18n> _localizer;

        public GetCatalogMediaQueryHandler(
            IStoreRepository storeRepository,
            ICatalogImageStorage catalogImageStorage,
            IStringLocalizer<I18n> localizer)
        {
            _storeRepository = storeRepository;
            _catalogImageStorage = catalogImageStorage;
            _localizer = localizer;
        }

        public async Task<ResponseResult<CatalogMediaFile>> Handle(GetCatalogMediaQuery query, CancellationToken cancellationToken)
        {
            // 404 uniforme: no se distingue entre "tienda sin catálogo" y "imagen inexistente".
            Store? store = string.IsNullOrWhiteSpace(query.StoreSlug)
                ? null
                : await _storeRepository.GetStoreByCatalogSlugAsync(query.StoreSlug.Trim().ToLowerInvariant());

            if (store == null || !_catalogImageStorage.BelongsToStore(query.Key, store.TenantId, store.Id))
                throw new ApiException(_localizer["CatalogImageNotFound"], HttpStatusCode.NotFound);

            CatalogStoredImage? stored = await _catalogImageStorage.OpenAsync(query.Key, cancellationToken);
            if (stored == null)
                throw new ApiException(_localizer["CatalogImageNotFound"], HttpStatusCode.NotFound);

            return ResponseResult.Success(new CatalogMediaFile(stored.Content, stored.ContentType, stored.Length));
        }
    }
}
