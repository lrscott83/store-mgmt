using Application.Abstractions.Messaging;
using Application.Dtos.SaleManagement;
using Application.Features.SaleManagement.Products.Queries.GetAvailableProductsByCategoryId;
using Application.ResponseModels;
using AutoMapper;
using Domain.Entities.Products;
using Domain.Interfaces.Repositories;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Application.Features.SaleManagement.Products.Queries.GetAvailableProductsByCategoryId
{
    public sealed record GetAvailableProductsByCategoryIdQuery(Guid CategoryId) : IQuery<IEnumerable<ProductDto>>
    {
    }

    public class GetAvailableProductsByCategoryIdQueryHandler : IQueryHandler<GetAvailableProductsByCategoryIdQuery, IEnumerable<ProductDto>>
    {
        private readonly IProductRepository _productRepository;
        private readonly IMapper _mapper;

        public GetAvailableProductsByCategoryIdQueryHandler(IProductRepository productRepository,
            IMapper mapper)
        {
            _productRepository = productRepository;
            _mapper = mapper;
        }

        public async Task<ResponseResult<IEnumerable<ProductDto>>> Handle(GetAvailableProductsByCategoryIdQuery query, CancellationToken cancellationToken)
        {
            IEnumerable<Product> products = await _productRepository.GetAvailableProductsByCategoryIdAsync(query.CategoryId);
            IEnumerable<ProductDto> productDtos = _mapper.Map<IEnumerable<ProductDto>>(products).ToList();
            return ResponseResult.Success(productDtos);
        }
    }
}
