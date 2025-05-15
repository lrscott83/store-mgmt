using Domain.Interfaces.Repositories;
using FluentValidation;
using Microsoft.Extensions.Localization;
using Resources;

namespace Application.Features.Administration.Owners.Commands.UpdateOwner
{
    public class UpdateOwnerCommandValidator : AbstractValidator<UpdateOwnerCommand>
    {
        private readonly IOwnerRepository _ownerRepository;
        private readonly IReSellerRepository _reSellerRepository;
        private readonly IStringLocalizer<I18n> _localizer;
        public UpdateOwnerCommandValidator(IStringLocalizer<I18n> localizer, IOwnerRepository ownerRepository, 
            IReSellerRepository reSellerRepository)
        {
            _ownerRepository = ownerRepository;
            _reSellerRepository = reSellerRepository;
            _localizer = localizer;

            RuleFor(x => x.Id)
             .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
             .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"])
             .MustAsync(OwnerExists).WithMessage(_localizer["OwnerNotFound", "{PropertyName}"]);

            RuleFor(x => x.FullName)
              .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
              .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"]);

            RuleFor(x => x.CellPhone)
              .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
              .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"]);

            When(x => x.ReSellerId.HasValue, () =>
            {
                RuleFor(x => x.ReSellerId)
                    .MustAsync(ReSellerExists).WithMessage(_localizer["ReSellerNotFound", "{PropertyName}"]);
            });

            When(x => !string.IsNullOrEmpty(x.Email), () =>
            {
                RuleFor(x => x.Email).EmailAddress().WithMessage(_localizer["EmailFormatInvalid", "{PropertyName}"]);
            });
            _reSellerRepository = reSellerRepository;
        }

        private async Task<bool> OwnerExists(Guid tenantId, CancellationToken cancellationToken)
        {
            return await _ownerRepository.GetByIdAsync(tenantId) != null;
        }

        private async Task<bool> ReSellerExists(Guid? reSellerId, CancellationToken cancellationToken)
        {
            return await _reSellerRepository.GetByIdAsync(reSellerId.Value) != null;
        }
    }
}
