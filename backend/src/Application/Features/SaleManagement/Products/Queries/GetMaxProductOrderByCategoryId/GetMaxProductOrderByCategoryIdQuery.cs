using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.ResponseModels;
using Domain.Interfaces.Repositories;

namespace Application.Features.SaleManagement.Products.Queries.GetMaxProductOrderByCategoryId
{
    public sealed record GetMaxProductOrderByCategoryIdQuery(Guid CategoryId) : IQuery<int> { }

    public class GetMaxProductOrderByCategoryIdQueryHandler : IQueryHandler<GetMaxProductOrderByCategoryIdQuery, int>
    {
        private readonly IHttpContextService _httpContextService;
        private readonly IProductRepository _productRepository;

        public GetMaxProductOrderByCategoryIdQueryHandler(IHttpContextService httpContextService,
            IProductRepository productRepository)
        {
            _httpContextService = httpContextService;
            _productRepository = productRepository;
        }

        public async Task<ResponseResult<int>> Handle(GetMaxProductOrderByCategoryIdQuery query, CancellationToken cancellationToken)
        {
            return ResponseResult.Success(await _productRepository.GetMaxOrderByCategoryIdAsync(query.CategoryId));
        }
    }
}
