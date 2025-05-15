using Domain.Interfaces.Repositories;
using FluentValidation;
using Microsoft.Extensions.Localization;
using Resources;

namespace Application.Features.Administration.ReSellers.Queries.GetReSellerById
{
    public class GetReSellerByIdQueryValidator : AbstractValidator<GetReSellerByIdQuery>
    {
        private readonly IReSellerRepository _reSellerRepository;
        private readonly IStringLocalizer<I18n> _localizer;
        public GetReSellerByIdQueryValidator(IStringLocalizer<I18n> localizer, IReSellerRepository reSellerRepository)
        {
            _reSellerRepository = reSellerRepository;
            _localizer = localizer;

            RuleFor(x => x.ReSellerId)
             .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
             .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"])
             .MustAsync(ReSellerExists).WithMessage(_localizer["ReSellerNotFound", "{PropertyName}"]);

        }

        private async Task<bool> ReSellerExists(Guid tenantId, CancellationToken cancellationToken)
        {
            return await _reSellerRepository.GetByIdAsync(tenantId) != null;
        }
    }
}
