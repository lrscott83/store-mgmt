using Domain.Interfaces.Repositories;
using FluentValidation;
using Microsoft.Extensions.Localization;
using Resources;

namespace Application.Features.SaleManagement.ProductCategories.Commands.CreateProductCategory
{
    public class CreateProductCategoryCommandValidator : AbstractValidator<CreateProductCategoryCommand>
    {
        private readonly IProductCategoryRepository _productCategoryRepository;
        private readonly IStoreRepository _storeRepository;
        private readonly IStringLocalizer<I18n> _localizer;
        public CreateProductCategoryCommandValidator(IStringLocalizer<I18n> localizer,
            IProductCategoryRepository productCategoryRepository,
            IStoreRepository storeRepository)
        {
            _productCategoryRepository = productCategoryRepository;
            _storeRepository = storeRepository;
            _localizer = localizer;

            RuleFor(x => x.Name)
              .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
              .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"])
              .MustAsync(IsUniqueName).WithMessage(_localizer["ProductCategoryAlreadyExists", "{PropertyName}"]);

            RuleFor(x => x.Order)
              .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"]);
        }

        private async Task<bool> IsUniqueName(string name, CancellationToken cancellationToken)
        {
            return await _productCategoryRepository.IsUniqueLoginAsync(name);
        }

        private async Task<bool> StoreExists(Guid storeId, CancellationToken cancellationToken)
        {
            return await _storeRepository.GetByIdAsync(storeId) != null;
        }

    }
}
