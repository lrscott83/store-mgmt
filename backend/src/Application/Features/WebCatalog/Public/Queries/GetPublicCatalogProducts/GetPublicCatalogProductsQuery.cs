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
            IList<Domain.Entities.Products.Product> products = await _productRepository
                .GetPublishedByStoreIdAsync(store.Id, null, null);

            if (!string.IsNullOrWhiteSpace(query.CategorySlug))
            {
                string categorySlug = query.CategorySlug.Trim();
                products = products
                    .Where(product => string.Equals(product.Category?.Slug, categorySlug, StringComparison.OrdinalIgnoreCase))
                    .ToList();
            }

            if (!string.IsNullOrWhiteSpace(query.Search))
            {
                string term = query.Search.Trim();
                products = products
                    .Where(product => product.Name.Contains(term, StringComparison.OrdinalIgnoreCase))
                    .ToList();
            }

            int page = query.Page < 1 ? 1 : query.Page;
            int pageSize = NormalizePageSize(query.PageSize);

            return ResponseResult.Success(new PublicCatalogPageDto
            {
                Items = products
                    .Skip((page - 1) * pageSize)
                    .Take(pageSize)
                    .Select(product => PublicCatalogProductMapper.ToDto(product, storeSlug))
                    .ToList(),
                Total = products.Count,
                Page = page,
                PageSize = pageSize,
            });
        }

        private static int NormalizePageSize(int pageSize)
            => pageSize < 1 ? 24 : pageSize > MaxPageSize ? MaxPageSize : pageSize;
    }
}
