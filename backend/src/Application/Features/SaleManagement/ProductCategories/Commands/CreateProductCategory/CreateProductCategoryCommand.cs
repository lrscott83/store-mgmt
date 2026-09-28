using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Exceptions;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Common.Catalog;
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
            // Sin tienda seleccionada no hay dónde crear la categoría: se avisa ANTES de tocar la
            // BD. La condición estaba invertida (`!IsNullOrEmpty`), así que este endpoint fallaba
            // SIEMPRE con una sesión normal (y pasaba de largo cuando no había tienda, para caer
            // después en el `store == null`).
            if (string.IsNullOrEmpty(_httpContextService.StoreId))
                throw new ApiException(_localizer["StoreNotFound"], HttpStatusCode.BadRequest);

            Store store = await _storeRepository.GetByIdAsync(_httpContextService.StoreId.ToGuid());
            if (store == null)
                throw new ApiException(_localizer["StoreNotFound"], HttpStatusCode.BadRequest);

            // Slug público de la categoría en el catálogo web (plan 2026-09-27, D4): se deriva del
            // nombre y ante colisión dentro de la tienda se añade -2, -3, ...
            string slug = SlugNormalizer.MakeUnique(
                SlugNormalizer.Normalize(request.Name),
                candidate => _productCategoryRepository.Where(c => c.StoreId == store.Id && c.Slug == candidate).Any());

            ProductCategory category = ProductCategory.Create(store.Id, request.Name, request.Order, _httpContextService.TenantId.ToGuid(), slug);
            await _productCategoryRepository.AddAsync(category);
            return ResponseResult.Success(await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0);
        }
    }
}
