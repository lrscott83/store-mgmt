using Domain.Interfaces.Repositories;
using FluentValidation;
using Microsoft.Extensions.Localization;
using Resources;

namespace Application.Features.Administration.Owners.Queries.GetOwnerById
{
    public class GetOwnerByIdQueryValidator : AbstractValidator<GetOwnerByIdQuery>
    {
        private readonly IOwnerRepository _ownerRepository;
        private readonly IStringLocalizer<I18n> _localizer;
        public GetOwnerByIdQueryValidator(IStringLocalizer<I18n> localizer, IOwnerRepository ownerRepository)
        {
            _ownerRepository = ownerRepository;
            _localizer = localizer;

            RuleFor(x => x.OwnerId)
             .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
             .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"])
             .MustAsync(OwnerExists).WithMessage(_localizer["OwnerNotFound", "{PropertyName}"]);

        }

        private async Task<bool> OwnerExists(Guid tenantId, CancellationToken cancellationToken)
        {
            return await _ownerRepository.GetByIdAsync(tenantId) != null;
        }
    }
}
