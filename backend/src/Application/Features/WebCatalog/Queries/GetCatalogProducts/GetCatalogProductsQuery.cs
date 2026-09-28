using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Dtos.WebCatalog;
using Application.Exceptions;
using Application.ResponseModels;
using Domain.Common.Extensions;
using Domain.Entities.Products;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.WebCatalog.Queries.GetCatalogProducts
{
    /// <summary>
    /// Productos de la tienda seleccionada con sus campos de catálogo, para la vista Catálogo Web.
    /// Incluye los que NO están en venta (el Owner los ve despublicados y puede volver a activarlos).
    /// </summary>
    public sealed record GetCatalogProductsQuery : IQuery<IEnumerable<CatalogProductViewDto>>;

    public class GetCatalogProductsQueryHandler : IQueryHandler<GetCatalogProductsQuery, IEnumerable<CatalogProductViewDto>>
    {
        private readonly IHttpContextService _httpContextService;
        private readonly IProductRepository _productRepository;
        private readonly IStringLocalizer<I18n> _localizer;

        public GetCatalogProductsQueryHandler(
            IHttpContextService httpContextService,
            IProductRepository productRepository,
            IStringLocalizer<I18n> localizer)
        {
            _httpContextService = httpContextService;
            _productRepository = productRepository;
            _localizer = localizer;
        }

        public async Task<ResponseResult<IEnumerable<CatalogProductViewDto>>> Handle(GetCatalogProductsQuery query,
            CancellationToken cancellationToken)
        {
            Guid storeId = _httpContextService.StoreId.ToGuid();
            if (storeId == Guid.Empty)
                throw new ApiException(_localizer["StoreNotSelected", _httpContextService.UserExternalId], HttpStatusCode.BadRequest);

            IList<Product> products = await _productRepository.GetProductsForCatalogSyncAsync(storeId);

            return ResponseResult.Success(products.Select(product => new CatalogProductViewDto
            {
                Id = product.Id,
                CategoryId = product.CategoryId,
                CategoryName = product.Category?.Name ?? string.Empty,
                Name = product.Name,
                Price = product.Price,
                Currency = product.Currency.ToString(),
                Order = product.Order,
                AvailableToSale = product.AvailableToSale,
                IsActive = product.IsActive,
                Description = product.Description ?? string.Empty,
                PercentDiscountPrice = product.PercentDiscountPrice,
                DiscountPrice = product.DiscountPrice,
                IsNew = product.IsNew,
                Image = product.Image,
                Images = product.Images
                    .Where(image => image.IsActive)
                    .OrderBy(image => image.Order).ThenBy(image => image.CreatedDate)
                    .Select(image => image.Path)
                    .ToList(),
                FinalPrice = product.FinalPrice,
                HasDiscount = product.HasDiscount,
            }));
        }
    }
}
