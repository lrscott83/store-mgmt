using FluentValidation;
using Microsoft.Extensions.Localization;
using Resources;

namespace Application.Features.UserManagement.Users.Commands.ActivateUser
{
    public class ActivateUserCommandValidator : AbstractValidator<ActivateUserCommand>
    {
        private readonly IStringLocalizer<I18n> _localizer;
        public ActivateUserCommandValidator(IStringLocalizer<I18n> localizer)
        {
            _localizer = localizer;

            RuleFor(x => x.Id)
             .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
             .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"]);

        }

    }
}
