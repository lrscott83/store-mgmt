using Domain.Interfaces.Repositories;
using FluentValidation;
using Microsoft.Extensions.Localization;
using Resources;

namespace Application.Features.SaleManagement.Products.Commands.DeleteProduct
{
    public class DeleteProductCommantValidator : AbstractValidator<DeleteProductCommant>
    {
        private readonly IProductRepository _productRepository;
        private readonly IStringLocalizer<I18n> _localizer;
        public DeleteProductCommantValidator(IStringLocalizer<I18n> localizer, IProductRepository productRepository)
        {
            _productRepository = productRepository;
            _localizer = localizer;

            RuleFor(x => x.Id)
             .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
             .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"])
             .MustAsync(ProductExists).WithMessage(_localizer["ProductNotFound", "{PropertyName}"]);
        }

        private async Task<bool> ProductExists(Guid productId, CancellationToken cancellationToken)
        {
            return await _productRepository.GetByIdAsync(productId) != null;
        }

    }
}
