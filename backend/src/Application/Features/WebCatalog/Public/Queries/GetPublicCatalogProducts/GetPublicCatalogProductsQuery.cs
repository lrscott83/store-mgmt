using Application.Abstractions.Messaging;
using Application.Dtos.WebCatalog;
using Application.Exceptions;
using Application.Features.WebCatalog.Public;
using Application.ResponseModels;
using Domain.Entities.Stores;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.WebCatalog.Public.Queries.GetPublicCatalogProducts
{
    /// <summary>
    /// Listado público paginado del catálogo (anónimo), con filtro por categoría y búsqueda por
    /// nombre. Publicación DIRECTA sobre las tablas normales (decisión del Owner, 2026-09-28):
    /// solo muestra productos ACTIVOS y EN VENTA de categorías activas con slug. El filtro por
    /// slug de categoría se aplica sobre los productos leídos (que traen su categoría): una
    /// lectura de `ProductCategory` con el filtro global por tenant responde VACÍA para anónimos.
    /// </summary>
    public sealed record GetPublicCatalogProductsQuery(
        string StoreSlug,
        string? CategorySlug = null,
        string? Search = null,
        int Page = 1,
        int PageSize = 24) : IQuery<PublicCatalogPageDto>;

    public class GetPublicCatalogProductsQueryHandler : IQueryHandler<GetPublicCatalogProductsQuery, PublicCatalogPageDto>
    {
        private const int MaxPageSize = 60;

        private readonly IStoreRepository _storeRepository;
        private readonly IProductRepository _productRepository;
        private readonly IStringLocalizer<I18n> _localizer;

        public GetPublicCatalogProductsQueryHandler(
            IStoreRepository storeRepository,
            IProductRepository productRepository,
            IStringLocalizer<I18n> localizer)
        {
            _storeRepository = storeRepository;
            _productRepository = productRepository;
            _localizer = localizer;
        }

        public async Task<ResponseResult<PublicCatalogPageDto>> Handle(GetPublicCatalogProductsQuery query, CancellationToken cancellationToken)
        {
            Store? store = string.IsNullOrWhiteSpace(query.StoreSlug)
                ? null
                : await _storeRepository.GetStoreByCatalogSlugAsync(query.StoreSlug.Trim().ToLowerInvariant());

            if (store == null || store.CatalogSlug == null)
                throw new ApiException(_localizer["CatalogStoreNotFound"], HttpStatusCode.NotFound);

            string storeSlug = store.CatalogSlug;

            int page = query.Page < 1 ? 1 : query.Page;
            int pageSize = NormalizePageSize(query.PageSize);

            // Offset en `long`, no en `int`: `(page - 1) * pageSize` desborda con `?page=2147483647` y
            // `Skip` recibiría un negativo -> 500 anónimo. Se acota al total, así una página muy alta
            // devuelve la lista vacía en vez de romper.
            long offset = ((long)page - 1) * pageSize;

            // Filtro y conteo en SQL: antes se traía TODO el catálogo (con la galería) y se filtraba y
            // paginaba en memoria, así que la "paginación" no acotaba nada.
            int total = await _productRepository.CountPublishedAsync(
                store.Id, query.CategorySlug, query.Search, cancellationToken);

            int skip = offset > total ? total : (int)offset;

            IList<Domain.Entities.Products.Product> products = await _productRepository.GetPublishedPageAsync(
                store.Id, query.CategorySlug, query.Search, skip, pageSize, cancellationToken);

            return ResponseResult.Success(new PublicCatalogPageDto
            {
                Items = products
                    .Select(product => PublicCatalogProductMapper.ToDto(product, storeSlug))
                    .ToList(),
                Total = total,
                Page = page,
                PageSize = pageSize,
            });
        }

        private static int NormalizePageSize(int pageSize)
            => pageSize < 1 ? 24 : pageSize > MaxPageSize ? MaxPageSize : pageSize;
    }
}
