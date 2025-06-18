using Application.Abstractions.Messaging;
using Application.Dtos.SaleManagement;
using Application.ResponseModels;
using AutoMapper;
using Domain.Entities.ProductCategories;
using Domain.Interfaces.Repositories;

namespace Application.Features.SaleManagement.ProductCategories.Queries.GetAllProductCategories
{
    public sealed record GetAllProductCategoriesQuery(bool IncludeInactive) : IQuery<IEnumerable<ProductCategoryDto>>
    { }

    public class GetAllProductCategoriesQueryHandler : IQueryHandler<GetAllProductCategoriesQuery, IEnumerable<ProductCategoryDto>>
    {
        private readonly IProductCategoryRepository _productCategoryRepository;
        private readonly IMapper _mapper;

        public GetAllProductCategoriesQueryHandler(IProductCategoryRepository productCategoryRepository,
            IMapper mapper)
        {
            _productCategoryRepository = productCategoryRepository;
            _mapper = mapper;
        }

        public async Task<ResponseResult<IEnumerable<ProductCategoryDto>>> Handle(GetAllProductCategoriesQuery query, CancellationToken cancellationToken)
        {
            IEnumerable<ProductCategory> productCategories = await _productCategoryRepository.GetProductCategoriesAsync(query.IncludeInactive);
            IEnumerable<ProductCategoryDto> productCategoryDtos = _mapper.Map<IEnumerable<ProductCategoryDto>>(productCategories).ToList();
            return ResponseResult.Success(productCategoryDtos);
        }
    }
}
