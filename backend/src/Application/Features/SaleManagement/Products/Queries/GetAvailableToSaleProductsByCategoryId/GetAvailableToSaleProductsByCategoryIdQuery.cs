using Application.Abstractions.Messaging;
using Application.Dtos.SaleManagement;
using Application.ResponseModels;
using AutoMapper;
using Domain.Entities.Products;
using Domain.Interfaces.Repositories;

namespace Application.Features.SaleManagement.Products.Queries.GetAvailableToSaleProductsByCategoryId
{
    public sealed record GetAvailableToSaleProductsByCategoryIdQuery(Guid CategoryId) : IQuery<IEnumerable<ProductDto>>
    {
    }

    public class GetAvailableToSaleProductsByCategoryIdQueryHandler : IQueryHandler<GetAvailableToSaleProductsByCategoryIdQuery, IEnumerable<ProductDto>>
    {
        private readonly IProductRepository _productRepository;
        private readonly IMapper _mapper;

        public GetAvailableToSaleProductsByCategoryIdQueryHandler(IProductRepository productRepository,
            IMapper mapper)
        {
            _productRepository = productRepository;
            _mapper = mapper;
        }

        public async Task<ResponseResult<IEnumerable<ProductDto>>> Handle(GetAvailableToSaleProductsByCategoryIdQuery query, CancellationToken cancellationToken)
        {
            IEnumerable<Product> products = await _productRepository.GetAvailableToSaleProductsByCategoryIdAsync(query.CategoryId);
            IEnumerable<ProductDto> productDtos = _mapper.Map<IEnumerable<ProductDto>>(products).ToList();
            return ResponseResult.Success(productDtos);
        }
    }
}
