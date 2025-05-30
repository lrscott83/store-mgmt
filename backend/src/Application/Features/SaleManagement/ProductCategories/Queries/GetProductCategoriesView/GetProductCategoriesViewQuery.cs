using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Dtos.SaleManagement;
using Application.Exceptions;
using Application.ResponseModels;
using AutoMapper;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.SaleManagement.ProductCategories.Queries.GetProductCategoriesView
{
    public sealed record GetProductCategoriesViewQuery : IQuery<IEnumerable<ProductCategoryView>>
    { }

    public class GetProductCategoriesViewQueryHandler : IQueryHandler<GetProductCategoriesViewQuery, IEnumerable<ProductCategoryView>>
    {
        private readonly IHttpContextService _httpContextService;
        private readonly IProductCategoryRepository _productCategoryRepository;
        private readonly IMapper _mapper;
        private readonly IStringLocalizer<I18n> _localizer;

        public GetProductCategoriesViewQueryHandler(IHttpContextService httpContextService, IProductCategoryRepository productCategoryRepository,
            IMapper mapper, IStringLocalizer<I18n> localizer)
        {
            _httpContextService = httpContextService;
            _productCategoryRepository = productCategoryRepository;
            _mapper = mapper;
            _localizer = localizer;
        }

        public async Task<ResponseResult<IEnumerable<ProductCategoryView>>> Handle(GetProductCategoriesViewQuery query, CancellationToken cancellationToken)
        {
            if (string.IsNullOrEmpty(_httpContextService.StoreId))
                throw new ApiException(_localizer["StoreNotSelected", _httpContextService.UserExternalId], HttpStatusCode.BadRequest);

            //IEnumerable<ProductCategory> productCategories = _httpContextService.IsSuperAdmin
            //    ? await _productCategoryRepository.GetAllProductCategoriesIncludingStoreModulesAsync(query.IncludeInactive)
            //    : await _productCategoryRepository.GetReSellerProductCategoriesIncludingStoreModulesAsync(_httpContextService.UserExternalId.ToGuid(), query.IncludeInactive);
            //IEnumerable<ProductCategoryView> productCategoryDtos = _mapper.Map<IEnumerable<ProductCategoryView>>(productCategories).ToList();
            IEnumerable<ProductCategoryView> productCategoryDtos = new List<ProductCategoryView>();
            return ResponseResult.Success(productCategoryDtos);
        }
    }
}
