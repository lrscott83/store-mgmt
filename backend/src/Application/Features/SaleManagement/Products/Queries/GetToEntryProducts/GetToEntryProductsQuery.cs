using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Dtos.SaleManagement;
using Application.Exceptions;
using Application.ResponseModels;
using AutoMapper;
using Domain.Common.Extensions;
using Domain.Entities.Products;
using Domain.Entities.Stores;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.SaleManagement.Products.Queries.GetToEntryProducts
{
    public sealed record GetToEntryProductsQuery : IQuery<IEnumerable<ProductToEntryDto>>
    {
    }

    public class GetToEntryProductsQueryHandler : IQueryHandler<GetToEntryProductsQuery, IEnumerable<ProductToEntryDto>>
    {
        private readonly IProductRepository _productRepository;
        private readonly IMapper _mapper;
        private readonly IHttpContextService _httpContextService;
        private readonly IStoreRepository _storeRepository;
        private readonly IStringLocalizer<I18n> _localizer;

        public GetToEntryProductsQueryHandler(IProductRepository productRepository,
            IMapper mapper,
            IHttpContextService httpContextService,
            IStoreRepository storeRepository,
            IStringLocalizer<I18n> localizer)
        {
            _productRepository = productRepository;
            _mapper = mapper;
            _httpContextService = httpContextService;
            _storeRepository = storeRepository;
            _localizer = localizer;
        }

        public async Task<ResponseResult<IEnumerable<ProductToEntryDto>>> Handle(GetToEntryProductsQuery query, CancellationToken cancellationToken)
        {
            if (!string.IsNullOrEmpty(_httpContextService.StoreId))
                throw new ApiException(_localizer["StoreNotFound"], HttpStatusCode.BadRequest);

            Store store = await _storeRepository.GetByIdAsync(_httpContextService.StoreId.ToGuid());
            if (store == null)
                throw new ApiException(_localizer["StoreNotFound"], HttpStatusCode.BadRequest);

            IEnumerable<Product> products = await _productRepository.GetActiveProductsIncludingCategoryByStoreIdAsync(store.Id);
            IEnumerable<ProductToEntryDto> productDtos = _mapper.Map<IEnumerable<ProductToEntryDto>>(products).ToList();
            return ResponseResult.Success(productDtos);
        }
    }
}
