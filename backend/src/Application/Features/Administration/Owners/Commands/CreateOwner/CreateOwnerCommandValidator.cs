using Domain.Interfaces.Repositories;
using FluentValidation;
using Microsoft.Extensions.Localization;
using Resources;

namespace Application.Features.Administration.Owners.Commands.CreateOwner
{
    public class CreateOwnerCommandValidator : AbstractValidator<CreateOwnerCommand>
    {
        private readonly IReSellerRepository _reSellerRepository;
        private readonly IStringLocalizer<I18n> _localizer;
        public CreateOwnerCommandValidator(IStringLocalizer<I18n> localizer, 
            IReSellerRepository reSellerRepository)
        {
            _reSellerRepository = reSellerRepository;
            _localizer = localizer;

            // Duplicate login is intentionally NOT validated here: the DB unique index on
            // User.Login is the source of truth and the handler maps the violation to 409
            // Conflict (R4.7). A pre-check would short-circuit with 400 before the handler.
            RuleFor(x => x.Login)
              .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
              .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"]);

            RuleFor(x => x.Password)
              .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
              .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"])
              .MinimumLength(8).WithMessage(_localizer["PasswordMinLength", "{PropertyName}", 8])
              .Must(password => !string.IsNullOrEmpty(password) && password.Any(char.IsUpper)).WithMessage(_localizer["PasswordRequiresUppercase", "{PropertyName}"]);

            RuleFor(x => x.FullName)
              .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
              .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"]);

            RuleFor(x => x.Cellphone)
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
        }

        private async Task<bool> ReSellerExists(Guid? reSellerId, CancellationToken cancellationToken)
        {
            return await _reSellerRepository.GetByIdAsync(reSellerId.Value) != null;
        }

    }
}
