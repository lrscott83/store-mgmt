using Application.Abstractions.Messaging;
using Application.ResponseModels;
using Application.UnitOfWorks;
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

            productCategory.Name = request.Name;
            productCategory.Order = request.Order;
            productCategory.IsActive = request.IsActive;
            await _productCategoryRepository.UpdateAsync(productCategory);
            return ResponseResult.Success(await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0);
        }
    }
}
