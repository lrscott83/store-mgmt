using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Exceptions;
using Application.ResponseModels;
using Domain.Common.Extensions;
using Domain.Entities.Stores;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.SaleManagement.Products.Queries.HasAnyAvailableToSaleProduct
{
    public sealed record HasAnyAvailableToSaleProductQuery() : IQuery<bool>
    {
    }

    public class HasAnyAvailableToSaleProductQueryHandler : IQueryHandler<HasAnyAvailableToSaleProductQuery, bool>
    {
        private readonly IProductRepository _productRepository;
        private readonly IHttpContextService _httpContextService;
        private readonly IStoreRepository _storeRepository;
        private readonly IStringLocalizer<I18n> _localizer;

        public HasAnyAvailableToSaleProductQueryHandler(IProductRepository productRepository,
            IHttpContextService httpContextService,
            IStoreRepository storeRepository,
            IStringLocalizer<I18n> localizer)
        {
            _productRepository = productRepository;
            _httpContextService = httpContextService;
            _storeRepository = storeRepository;
            _localizer = localizer;
        }

        public async Task<ResponseResult<bool>> Handle(HasAnyAvailableToSaleProductQuery query, CancellationToken cancellationToken)
        {
            if (!string.IsNullOrEmpty(_httpContextService.StoreId))
                throw new ApiException(_localizer["StoreNotFound"], HttpStatusCode.BadRequest);

            Store store = await _storeRepository.GetByIdAsync(_httpContextService.StoreId.ToGuid());
            if (store == null)
                throw new ApiException(_localizer["StoreNotFound"], HttpStatusCode.BadRequest);

            return ResponseResult.Success(await _productRepository.HasAnyAvailableToSaleProductByStoreId(store.Id));
        }
    }
}
