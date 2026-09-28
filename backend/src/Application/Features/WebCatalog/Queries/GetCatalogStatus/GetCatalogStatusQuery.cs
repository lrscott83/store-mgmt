using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Dtos.WebCatalog;
using Application.Exceptions;
using Application.Features.WebCatalog.Public;
using Application.ResponseModels;
using Domain.Common.Extensions;
using Domain.Entities.Stores;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.WebCatalog.Queries.GetCatalogStatus
{
    /// <summary>
    /// Estado del catálogo web de la tienda seleccionada: slug público, última sincronización y
    /// contadores del origen (cabecera de la vista Catálogo Web, plan 2026-09-27).
    /// </summary>
    public sealed record GetCatalogStatusQuery : IQuery<CatalogStatusDto>;

    public class GetCatalogStatusQueryHandler : IQueryHandler<GetCatalogStatusQuery, CatalogStatusDto>
    {
        private readonly IHttpContextService _httpContextService;
        private readonly IStoreRepository _storeRepository;
        private readonly IProductCategoryRepository _productCategoryRepository;
        private readonly IProductRepository _productRepository;
        private readonly ICatalogProductRepository _catalogProductRepository;
        private readonly IStringLocalizer<I18n> _localizer;

        public GetCatalogStatusQueryHandler(
            IHttpContextService httpContextService,
            IStoreRepository storeRepository,
            IProductCategoryRepository productCategoryRepository,
            IProductRepository productRepository,
            ICatalogProductRepository catalogProductRepository,
            IStringLocalizer<I18n> localizer)
        {
            _httpContextService = httpContextService;
            _storeRepository = storeRepository;
            _productCategoryRepository = productCategoryRepository;
            _productRepository = productRepository;
            _catalogProductRepository = catalogProductRepository;
            _localizer = localizer;
        }

        public async Task<ResponseResult<CatalogStatusDto>> Handle(GetCatalogStatusQuery query, CancellationToken cancellationToken)
        {
            Guid storeId = _httpContextService.StoreId.ToGuid();
            if (storeId == Guid.Empty)
                throw new ApiException(_localizer["StoreNotSelected", _httpContextService.UserExternalId], HttpStatusCode.BadRequest);

            Store store = await _storeRepository.GetStoreByIdAsync(storeId)
                ?? throw new ApiException(_localizer["StoreNotFound"], HttpStatusCode.NotFound);

            var sourceCategories = await _productCategoryRepository.GetByStoreIdAsync(storeId);
            var sourceProducts = await _productRepository.GetProductsForCatalogSyncAsync(storeId);
            var publishedProducts = await _catalogProductRepository.GetByStoreIdAsync(storeId);

            return ResponseResult.Success(new CatalogStatusDto
            {
                // El slug se genera en la primera sincronización: mientras no exista, la vista
                // muestra la vista previa sin URL pública.
                StoreSlug = store.CatalogSlug ?? string.Empty,
                CatalogUrl = store.CatalogSlug == null ? string.Empty : CatalogPublicUrls.Catalog(store.CatalogSlug),
                CatalogSyncedAt = store.CatalogSyncedAt,
                SourceCategoriesCount = sourceCategories.Count,
                SourceProductsCount = sourceProducts.Count,
                PublishedProductsCount = publishedProducts.Count(product => product.IsActive),
                ProductsWithoutMainImageCount = sourceProducts.Count(product => string.IsNullOrWhiteSpace(product.Image)),
            });
        }
    }
}
