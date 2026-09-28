using Application.Abstractions.Messaging;
using Application.Dtos.WebCatalog;
using Application.Exceptions;
using Application.ResponseModels;
using Domain.Entities.Stores;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.WebCatalog.Public.Queries.GetPublicCatalog
{
    /// <summary>
    /// Cabecera del catálogo público (anónimo): la tienda y sus categorías publicadas con el
    /// conteo de productos visibles. 404 uniforme si el slug no existe o no tiene catálogo.
    /// </summary>
    public sealed record GetPublicCatalogQuery(string StoreSlug) : IQuery<PublicCatalogDto>;

    public class GetPublicCatalogQueryHandler : IQueryHandler<GetPublicCatalogQuery, PublicCatalogDto>
    {
        private readonly IStoreRepository _storeRepository;
        private readonly ICatalogCategoryRepository _catalogCategoryRepository;
        private readonly ICatalogProductRepository _catalogProductRepository;
        private readonly IStringLocalizer<I18n> _localizer;

        public GetPublicCatalogQueryHandler(
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

        public async Task<ResponseResult<PublicCatalogDto>> Handle(GetPublicCatalogQuery query, CancellationToken cancellationToken)
        {
            Store? store = string.IsNullOrWhiteSpace(query.StoreSlug)
                ? null
                : await _storeRepository.GetStoreByCatalogSlugAsync(query.StoreSlug.Trim().ToLowerInvariant());

            if (store == null)
                throw new ApiException(_localizer["CatalogStoreNotFound"], HttpStatusCode.NotFound);

            string storeSlug = store.CatalogSlug!;
            var categories = await _catalogCategoryRepository.GetPublishedByStoreIdAsync(store.Id);
            var products = await _catalogProductRepository.GetPublishedByStoreIdAsync(store.Id, null, null);

            return ResponseResult.Success(new PublicCatalogDto
            {
                StoreId = store.Id,
                StoreName = store.Name,
                StoreSlug = storeSlug,
                Categories = categories.Select(category => new PublicCatalogCategoryDto
                {
                    Id = category.Id,
                    Name = category.Name,
                    Slug = category.Slug,
                    ProductsCount = products.Count(product => product.CatalogCategoryId == category.Id),
                }).ToList(),
            });
        }
    }
}
