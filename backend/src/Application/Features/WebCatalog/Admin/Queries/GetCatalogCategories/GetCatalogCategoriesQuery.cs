using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Dtos.WebCatalog;
using Application.Exceptions;
using Application.ResponseModels;
using Domain.Common.Extensions;
using Domain.Entities.ProductCategories;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.WebCatalog.Admin.Queries.GetCatalogCategories
{
    /// <summary>
    /// Categorías de la tienda de la ruta tal como las pinta la vista SuperAdmin del catálogo:
    /// un panel por categoría, en el mismo orden que el catálogo (Order, luego nombre). Incluye
    /// las recién creadas aunque todavía no tengan productos (S3).
    /// </summary>
    public sealed record GetCatalogCategoriesQuery : IQuery<IEnumerable<CatalogCategoryDto>>;

    public class GetCatalogCategoriesQueryHandler
        : IQueryHandler<GetCatalogCategoriesQuery, IEnumerable<CatalogCategoryDto>>
    {
        private readonly IHttpContextService _httpContextService;
        private readonly IProductCategoryRepository _productCategoryRepository;
        private readonly IStringLocalizer<I18n> _localizer;

        public GetCatalogCategoriesQueryHandler(
            IHttpContextService httpContextService,
            IProductCategoryRepository productCategoryRepository,
            IStringLocalizer<I18n> localizer)
        {
            _httpContextService = httpContextService;
            _productCategoryRepository = productCategoryRepository;
            _localizer = localizer;
        }

        public async Task<ResponseResult<IEnumerable<CatalogCategoryDto>>> Handle(
            GetCatalogCategoriesQuery query, CancellationToken cancellationToken)
        {
            Guid storeId = _httpContextService.StoreId.ToGuid();
            if (storeId == Guid.Empty)
                throw new ApiException(
                    _localizer["StoreNotSelected", _httpContextService.UserExternalId],
                    HttpStatusCode.BadRequest);

            // La lectura ya viene ordenada por Order y luego nombre, y acotada a ESTA tienda.
            IList<ProductCategory> categories = await _productCategoryRepository.GetByStoreIdAsync(storeId);

            return ResponseResult.Success(categories.Select(category => new CatalogCategoryDto
            {
                Id = category.Id,
                Name = category.Name,
                Order = category.Order,
            }));
        }
    }
}
