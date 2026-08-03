using FluentValidation;
using Microsoft.Extensions.Localization;
using Resources;

namespace Application.Features.Administration.Owners.Commands.UpdateOwner
{
    public class UpdateOwnerCommandValidator : AbstractValidator<UpdateOwnerCommand>
    {
        private readonly IStringLocalizer<I18n> _localizer;
        public UpdateOwnerCommandValidator(IStringLocalizer<I18n> localizer)
        {
            _localizer = localizer;

            RuleFor(x => x.Id)
             .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
             .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"]);

            RuleFor(x => x.FullName)
              .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
              .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"]);

            RuleFor(x => x.CellPhone)
              .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
              .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"]);

            When(x => !string.IsNullOrEmpty(x.Email), () =>
            {
                RuleFor(x => x.Email).EmailAddress().WithMessage(_localizer["EmailFormatInvalid", "{PropertyName}"]);
            });
        }
    }
}
