using Application.Abstractions.Messaging;
using Application.Dtos.WebCatalog;
using Application.Exceptions;
using Application.ResponseModels;
using Domain.Entities.Stores;
using Domain.Entities.WebCatalog;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.WebCatalog.Public.Queries.GetPublicCatalogProducts
{
    /// <summary>
    /// Listado público paginado del catálogo (anónimo), con filtro por categoría y búsqueda por
    /// nombre. Solo muestra filas publicadas y activas.
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
        private readonly ICatalogCategoryRepository _catalogCategoryRepository;
        private readonly ICatalogProductRepository _catalogProductRepository;
        private readonly IStringLocalizer<I18n> _localizer;

        public GetPublicCatalogProductsQueryHandler(
            IStoreRepository storeRepository,
            ICatalogCategoryRepository catalogCategoryRepository,
            ICatalogProductRepository catalogProductRepository,
            IStringLocalizer<I18n> localizer)
        {
            _storeRepository = storeRepository;
            _catalogCategoryRepository = catalogCategoryRepository;
            _catalogProductRepository = catalogProductRepository;
            _localizer = localizer;
        }

        public async Task<ResponseResult<PublicCatalogPageDto>> Handle(GetPublicCatalogProductsQuery query, CancellationToken cancellationToken)
        {
            Store? store = string.IsNullOrWhiteSpace(query.StoreSlug)
                ? null
                : await _storeRepository.GetStoreByCatalogSlugAsync(query.StoreSlug.Trim().ToLowerInvariant());

            if (store == null)
                throw new ApiException(_localizer["CatalogStoreNotFound"], HttpStatusCode.NotFound);

            string storeSlug = store.CatalogSlug!;
            Guid? categoryId = null;
            if (!string.IsNullOrWhiteSpace(query.CategorySlug))
            {
                var categories = await _catalogCategoryRepository.GetPublishedByStoreIdAsync(store.Id);
                CatalogCategory? category = categories
                    .FirstOrDefault(c => string.Equals(c.Slug, query.CategorySlug.Trim(), StringComparison.OrdinalIgnoreCase));

                // Categoría desconocida => página vacía (no 404: la URL sigue siendo válida).
                if (category == null)
                    return ResponseResult.Success(new PublicCatalogPageDto
                    {
                        Items = new List<PublicCatalogProductDto>(),
                        Total = 0,
                        Page = 1,
                        PageSize = NormalizePageSize(query.PageSize),
                    });

                categoryId = category.Id;
            }

            IList<CatalogProduct> products = await _catalogProductRepository
                .GetPublishedByStoreIdAsync(store.Id, categoryId, query.Search);

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
