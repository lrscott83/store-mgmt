using Application.Abstractions.Messaging;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Common.Catalog;
using Domain.Entities.ProductCategories;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.ComponentModel.DataAnnotations;

namespace Application.Features.SaleManagement.ProductCategories.Commands.UpdateProductCategory
{
    public sealed class UpdateProductCategoryCommand : ICommand<bool>
    {
        public Guid Id { get; set; }
        public string Name { get; set; }
        public int Order { get; set; }
        public bool IsActive { get; set; }

    }

    public class UpdateProductCategoryCommandHandler : ICommandHandler<UpdateProductCategoryCommand, bool>
    {
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IProductCategoryRepository _productCategoryRepository;
        private readonly IStringLocalizer<I18n> _localizer;

        public UpdateProductCategoryCommandHandler(
            IApplicationUnitOfWork applicationUnitOfWork,
            IProductCategoryRepository productCategoryRepository,
            IStringLocalizer<I18n> localizer)
        {
            _applicationUnitOfWork = applicationUnitOfWork;
            _productCategoryRepository = productCategoryRepository;
            _localizer = localizer;
        }

        public async Task<ResponseResult<bool>> Handle(UpdateProductCategoryCommand request, CancellationToken cancellationToken)
        {
            ProductCategory productCategory = await _productCategoryRepository.GetByIdAsync(request.Id);
            if (_productCategoryRepository.Where(s => s.Id != request.Id).Any(s => s.Name == request.Name))
                throw new ValidationException(_localizer["ProductCategoryAlreadyExists", request.Name]);

            // Catálogo web (plan 2026-09-27, D4): el slug sigue al nombre. Si el nombre no cambió se
            // conserva el slug actual para no romper enlaces ya publicados.
            if (productCategory.Name != request.Name || string.IsNullOrEmpty(productCategory.Slug))
            {
                productCategory.Slug = SlugNormalizer.MakeUnique(
                    SlugNormalizer.Normalize(request.Name),
                    candidate => _productCategoryRepository
                        .Where(c => c.Id != productCategory.Id && c.StoreId == productCategory.StoreId && c.Slug == candidate)
                        .Any());
            }

            productCategory.Name = request.Name;
            productCategory.Order = request.Order;
            productCategory.IsActive = request.IsActive;
            await _productCategoryRepository.UpdateAsync(productCategory);
            return ResponseResult.Success(await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0);
        }
    }
}
