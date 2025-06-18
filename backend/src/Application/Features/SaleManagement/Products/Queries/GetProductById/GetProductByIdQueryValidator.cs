using Domain.Interfaces.Repositories;
using FluentValidation;
using Microsoft.Extensions.Localization;
using Resources;

namespace Application.Features.SaleManagement.Products.Queries.GetProductById
{
    public class GetProductByIdQueryValidator : AbstractValidator<GetProductByIdQuery>
    {
        private readonly IProductRepository _productRepository;
        private readonly IStringLocalizer<I18n> _localizer;
        public GetProductByIdQueryValidator(IStringLocalizer<I18n> localizer, IProductRepository productRepository)
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
