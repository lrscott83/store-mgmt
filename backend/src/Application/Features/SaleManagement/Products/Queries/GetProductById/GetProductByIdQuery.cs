using Application.Abstractions.Messaging;
using Application.ResponseModels;
using AutoMapper;
using Domain.Entities.Products;
using Domain.Interfaces.Repositories;

namespace Application.Features.SaleManagement.Products.Queries.GetProductById
{
    public sealed record GetProductByIdQuery(Guid Id) : IQuery<Product>
    {
    }

    public class GetProductByIdQueryHandler : IQueryHandler<GetProductByIdQuery, Product>
    {
        private readonly IProductRepository _productRepository;
        private readonly IMapper _mapper;

        public GetProductByIdQueryHandler(IProductRepository productRepository,
            IMapper mapper)
        {
            _productRepository = productRepository;
            _mapper = mapper;
        }

        public async Task<ResponseResult<Product>> Handle(GetProductByIdQuery query, CancellationToken cancellationToken)
        {
            Product product = await _productRepository.GetByIdAsync(query.Id);
            Product productDto = _mapper.Map<Product>(product);
            return ResponseResult.Success(productDto);
        }
    }
}
