using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Exceptions;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Common.Extensions;
using Domain.Entities.ProductCategories;
using Domain.Entities.Stores;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.SaleManagement.ProductCategories.Commands.CreateProductCategory
{
    public sealed record CreateProductCategoryCommand(string Name, int Order) : ICommand<bool> { }

    public class CreateProductCategoryCommandHandler : ICommandHandler<CreateProductCategoryCommand, bool>
    {
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IHttpContextService _httpContextService;
        private readonly IProductCategoryRepository _productCategoryRepository;
        private readonly IStoreRepository _storeRepository;
        private readonly IStringLocalizer<I18n> _localizer;

        public CreateProductCategoryCommandHandler(
            IApplicationUnitOfWork applicationUnitOfWork,
            IHttpContextService httpContextService,
            IStringLocalizer<I18n> localizer,
            IProductCategoryRepository productCategoryRepository,
            IStoreRepository storeRepository)
        {
            _applicationUnitOfWork = applicationUnitOfWork;
            _httpContextService = httpContextService;
            _localizer = localizer;
            _productCategoryRepository = productCategoryRepository;
            _storeRepository = storeRepository;
        }

        public async Task<ResponseResult<bool>> Handle(CreateProductCategoryCommand request, CancellationToken cancellationToken)
        {
            if (!string.IsNullOrEmpty(_httpContextService.StoreId))
                throw new ApiException(_localizer["StoreNotFound"], HttpStatusCode.BadRequest);

            Store store = await _storeRepository.GetByIdAsync(_httpContextService.StoreId.ToGuid());
            if (store == null)
                throw new ApiException(_localizer["StoreNotFound"], HttpStatusCode.BadRequest);

            ProductCategory category = ProductCategory.Create(store.Id, request.Name, request.Order, _httpContextService.TenantId.ToGuid());
            await _productCategoryRepository.AddAsync(category);
            return ResponseResult.Success(await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0);
        }
    }
}
