using Domain.Interfaces.Repositories;
using FluentValidation;
using Microsoft.Extensions.Localization;
using Resources;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Application.Features.SaleManagement.ProductCategories.Commands.UpdateProductCategory
{
    public class UpdateProductCategoryCommandValidator : AbstractValidator<UpdateProductCategoryCommand>
    {
        private readonly IProductCategoryRepository _productCategoryRepository;
        private readonly IStringLocalizer<I18n> _localizer;
        public UpdateProductCategoryCommandValidator(IStringLocalizer<I18n> localizer, IProductCategoryRepository productCategoryRepository)
        {
            _productCategoryRepository = productCategoryRepository;
            _localizer = localizer;

            RuleFor(x => x.Id)
             .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
             .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"])
             .MustAsync(ProductCategoryExists).WithMessage(_localizer["ProductCategoryNotFound", "{PropertyName}"]);

            RuleFor(x => x.Name)
              .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
              .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"]);

            RuleFor(x => x.Order)
              .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"]);

        }

        private async Task<bool> ProductCategoryExists(Guid categoryId, CancellationToken cancellationToken)
        {
            return await _productCategoryRepository.GetByIdAsync(categoryId) != null;
        }
    }
}
