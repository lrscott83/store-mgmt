using Application.Features.SaleManagement.Products.Commands.CreateProduct;
using Domain.Interfaces.Repositories;
using FluentValidation;
using Microsoft.Extensions.Localization;
using Resources;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Application.Features.SaleManagement.Products.Commands.CreateProducts
{
    public class CreateProductsCommandValidator : AbstractValidator<CreateProductsCommand>
    {
        private readonly IProductRepository _productRepository;
        private readonly IProductCategoryRepository _categoryRepository;
        private readonly IStringLocalizer<I18n> _localizer;
        public CreateProductsCommandValidator(IStringLocalizer<I18n> localizer, IProductRepository productRepository,
            IProductCategoryRepository categoryRepository)
        {
            _productRepository = productRepository;
            _localizer = localizer;
            _categoryRepository = categoryRepository;

            RuleFor(x => x.CategoryId)
              .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
              .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"])
              .MustAsync(CategoryExists).WithMessage(_localizer["ProductCategoryNotFound", "{PropertyName}"]);

            RuleFor(x => x.Products)
              .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
              .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"]);


        }

        private async Task<bool> CategoryExists(Guid categoryId, CancellationToken cancellationToken)
        {
            return await _categoryRepository.GetByIdAsync(categoryId) != null;
        }

    }
}
