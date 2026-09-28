using Domain.Common.Catalog;
using Domain.Common.Limits;
using Domain.Interfaces.Repositories;
using FluentValidation;
using Microsoft.Extensions.Localization;
using Resources;

namespace Application.Features.SaleManagement.Products.Commands.UpdateProduct
{
    public class UpdateProductCommandValidator : AbstractValidator<UpdateProductCommand>
    {
        private readonly IProductRepository _productRepository;
        private readonly IProductCategoryRepository _categoryRepository;
        private readonly IStringLocalizer<I18n> _localizer;
        public UpdateProductCommandValidator(IStringLocalizer<I18n> localizer, IProductRepository productRepository,
            IProductCategoryRepository categoryRepository)
        {
            _productRepository = productRepository;
            _localizer = localizer;
            _categoryRepository = categoryRepository;

            RuleFor(x => x.Id)
             .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
             .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"])
             .MustAsync(ProductExists).WithMessage(_localizer["ProductNotFound", "{PropertyName}"]);

            RuleFor(x => x.CategoryId)
              .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
              .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"])
              .MustAsync(CategoryExists).WithMessage(_localizer["ProductCategoryNotFound", "{PropertyName}"]);

            RuleFor(x => x.Name)
              .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
              .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"]);

            RuleFor(x => x.Price)
              .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
              .Must(x => x >= 0);

            RuleFor(x => x.Order)
              .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"]);

            RuleFor(x => x.AvailableToSale)
              .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"]);            RuleFor(x => x.DiscountFromInventory)
                .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"]);

            // Catálogo web (plan 2026-09-27). Opcionales: solo se validan cuando vienen.
            RuleFor(x => x.Description)
                .MaximumLength(ProductEntityLimits.DescriptionMaxLength)
                .WithMessage(_localizer["CatalogDescriptionTooLong", "{PropertyName}", ProductEntityLimits.DescriptionMaxLength]);

            RuleFor(x => x.PercentDiscountPrice)
                .InclusiveBetween(0, CatalogScales.MAX_PERCENT_SCALED)
                .WithMessage(_localizer["CatalogPercentDiscountRange", "{PropertyName}"])
                .When(x => x.PercentDiscountPrice.HasValue);

            RuleFor(x => x.DiscountPrice)
                .GreaterThanOrEqualTo(0)
                .WithMessage(_localizer["CatalogDiscountPriceRange", "{PropertyName}"])
                .When(x => x.DiscountPrice.HasValue);

            RuleFor(x => x.Image)
                .MaximumLength(ProductEntityLimits.ImagePathMaxLength)
                .WithMessage(_localizer["CatalogImagePathTooLong", "{PropertyName}", ProductEntityLimits.ImagePathMaxLength])
                .When(x => !string.IsNullOrEmpty(x.Image));
        }

        private async Task<bool> ProductExists(Guid productId, CancellationToken cancellationToken)
        {
            return await _productRepository.GetByIdAsync(productId) != null;
        }

        private async Task<bool> CategoryExists(Guid categoryId, CancellationToken cancellationToken)
        {
            return await _categoryRepository.GetByIdAsync(categoryId) != null;
        }

    }
}
