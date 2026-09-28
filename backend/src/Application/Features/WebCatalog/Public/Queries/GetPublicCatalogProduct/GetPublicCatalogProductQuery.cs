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

namespace Application.Features.WebCatalog.Public.Queries.GetPublicCatalogProduct
{
    /// <summary>
    /// Detalle público de un producto del catálogo: es lo que se abre al tocar la tarjeta, con la
    /// descripción y la galería de imágenes (plan 2026-09-27). Publicación DIRECTA sobre las
    /// tablas normales (decisión del Owner, 2026-09-28): lee `Product` — no existe una copia
    /// publicada; el id del producto ES el id público.
    /// </summary>
    public sealed record GetPublicCatalogProductQuery(string StoreSlug, Guid ProductId) : IQuery<PublicCatalogProductDto>;

    public class GetPublicCatalogProductQueryHandler : IQueryHandler<GetPublicCatalogProductQuery, PublicCatalogProductDto>
    {
        private readonly IStoreRepository _storeRepository;
        private readonly IProductRepository _productRepository;
        private readonly IStringLocalizer<I18n> _localizer;

        public GetPublicCatalogProductQueryHandler(
            IStoreRepository storeRepository,
            IProductRepository productRepository,
            IStringLocalizer<I18n> localizer)
        {
            _storeRepository = storeRepository;
            _productRepository = productRepository;
            _localizer = localizer;
        }

        public async Task<ResponseResult<PublicCatalogProductDto>> Handle(GetPublicCatalogProductQuery query, CancellationToken cancellationToken)
        {
            Store? store = string.IsNullOrWhiteSpace(query.StoreSlug)
                ? null
                : await _storeRepository.GetStoreByCatalogSlugAsync(query.StoreSlug.Trim().ToLowerInvariant());

            if (store == null || store.CatalogSlug == null)
                throw new ApiException(_localizer["CatalogStoreNotFound"], HttpStatusCode.NotFound);

            Domain.Entities.Products.Product? product = await _productRepository.GetPublishedByIdAsync(store.Id, query.ProductId);
            if (product == null || product.Category == null || !product.Category.IsActive)
                throw new ApiException(_localizer["ProductNotFound", nameof(query.ProductId)], HttpStatusCode.NotFound);

            return ResponseResult.Success(PublicCatalogProductMapper.ToDto(product, store.CatalogSlug));
        }
    }
}
