using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Dtos.SaleManagement;
using Application.Exceptions;
using Application.ResponseModels;
using AutoMapper;
using Domain.Entities.ProductCategories;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.SaleManagement.ProductCategories.Queries.GetAllProductCategories
{
    public sealed record GetAllProductCategoriesQuery(bool IncludeInactive) : IQuery<IEnumerable<ProductCategoryDto>>
    { }

    public class GetAllProductCategoriesQueryHandler : IQueryHandler<GetAllProductCategoriesQuery, IEnumerable<ProductCategoryDto>>
    {
        private readonly IHttpContextService _httpContextService;
        private readonly IProductCategoryRepository _productCategoryRepository;
        private readonly IMapper _mapper;
        private readonly IStringLocalizer<I18n> _localizer;

        public GetAllProductCategoriesQueryHandler(IHttpContextService httpContextService, IProductCategoryRepository productCategoryRepository,
            IMapper mapper, IStringLocalizer<I18n> localizer)
        {
            _httpContextService = httpContextService;
            _productCategoryRepository = productCategoryRepository;
            _mapper = mapper;
            _localizer = localizer;
        }

        public async Task<ResponseResult<IEnumerable<ProductCategoryDto>>> Handle(GetAllProductCategoriesQuery query, CancellationToken cancellationToken)
        {
            if (string.IsNullOrEmpty(_httpContextService.StoreId))
                throw new ApiException(_localizer["StoreNotSelected", _httpContextService.UserExternalId], HttpStatusCode.BadRequest);

            IEnumerable<ProductCategory> productCategories = await _productCategoryRepository.GetProductCategoriesAsync(query.IncludeInactive);
            IEnumerable<ProductCategoryDto> productCategoryDtos = _mapper.Map<IEnumerable<ProductCategoryDto>>(productCategories).ToList();
            return ResponseResult.Success(productCategoryDtos);
        }
    }
}
