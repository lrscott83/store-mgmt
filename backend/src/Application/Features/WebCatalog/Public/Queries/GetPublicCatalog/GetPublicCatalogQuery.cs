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

namespace Application.Features.WebCatalog.Public.Queries.GetPublicCatalog
{
    /// <summary>
    /// Cabecera del catálogo público (anónimo): la tienda y sus categorías con el conteo de
    /// productos visibles. Publicación DIRECTA sobre las tablas normales (decisión del Owner,
    /// 2026-09-28): lee `Product` — no existe una copia publicada. Las categorías salen de los
    /// propios productos publicados (cada producto trae su categoría), porque una lectura de
    /// `ProductCategory` con el filtro global por tenant responde VACÍA para un anónimo.
    /// 404 uniforme si el slug no existe o la tienda no tiene catálogo.
    /// </summary>
    public sealed record GetPublicCatalogQuery(string StoreSlug) : IQuery<PublicCatalogDto>;

    public class GetPublicCatalogQueryHandler : IQueryHandler<GetPublicCatalogQuery, PublicCatalogDto>
    {
        private readonly IStoreRepository _storeRepository;
        private readonly IProductRepository _productRepository;
        private readonly IStringLocalizer<I18n> _localizer;

        public GetPublicCatalogQueryHandler(
            IStoreRepository storeRepository,
            IProductRepository productRepository,
            IStringLocalizer<I18n> localizer)
        {
            _storeRepository = storeRepository;
            _productRepository = productRepository;
            _localizer = localizer;
        }

        public async Task<ResponseResult<PublicCatalogDto>> Handle(GetPublicCatalogQuery query, CancellationToken cancellationToken)
        {
            Store? store = string.IsNullOrWhiteSpace(query.StoreSlug)
                ? null
                : await _storeRepository.GetStoreByCatalogSlugAsync(query.StoreSlug.Trim().ToLowerInvariant());

            if (store == null || store.CatalogSlug == null)
                throw new ApiException(_localizer["CatalogStoreNotFound"], HttpStatusCode.NotFound);

            string storeSlug = store.CatalogSlug;
            var products = await _productRepository.GetPublishedByStoreIdAsync(store.Id, null, null);

            return ResponseResult.Success(new PublicCatalogDto
            {
                StoreId = store.Id,
                StoreName = store.Name,
                StoreSlug = storeSlug,
                Categories = products
                    .Where(product => product.Category is { IsActive: true } && product.Category.Slug != null)
                    .GroupBy(product => product.CategoryId)
                    .Select(group => group.First().Category)
                    .OrderBy(category => category!.Order).ThenBy(category => category!.Name)
                    .Select(category => new PublicCatalogCategoryDto
                    {
                        Id = category!.Id,
                        Name = category.Name,
                        Slug = category.Slug!,
                        ProductsCount = products.Count(product => product.CategoryId == category.Id),
                    })
                    .ToList(),
            });
        }
    }
}
