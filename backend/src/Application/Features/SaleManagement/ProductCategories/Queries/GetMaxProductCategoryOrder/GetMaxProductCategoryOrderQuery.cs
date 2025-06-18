using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.ResponseModels;
using Domain.Interfaces.Repositories;

namespace Application.Features.SaleManagement.ProductCategories.Queries.GetMaxProductCategoryOrder
{
    public sealed record GetMaxProductCategoryOrderQuery : IQuery<int> { }

    public class GetMaxProductCategoryOrderQueryHandler : IQueryHandler<GetMaxProductCategoryOrderQuery, int>
    {
        private readonly IHttpContextService _httpContextService;
        private readonly IProductCategoryRepository _productCategoryRepository;

        public GetMaxProductCategoryOrderQueryHandler(IHttpContextService httpContextService, 
            IProductCategoryRepository productCategoryRepository)
        {
            _httpContextService = httpContextService;
            _productCategoryRepository = productCategoryRepository;
        }

        public async Task<ResponseResult<int>> Handle(GetMaxProductCategoryOrderQuery query, CancellationToken cancellationToken)
        {
            return ResponseResult.Success(await _productCategoryRepository.GetMaxOrderAsync());
        }
    }
}
