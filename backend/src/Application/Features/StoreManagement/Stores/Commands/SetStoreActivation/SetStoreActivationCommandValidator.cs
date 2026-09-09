using FluentValidation;
using Microsoft.Extensions.Localization;
using Resources;

namespace Application.Features.StoreManagement.Stores.Commands.SetStoreActivation
{
    public class SetStoreActivationCommandValidator : AbstractValidator<SetStoreActivationCommand>
    {
        private readonly IStringLocalizer<I18n> _localizer;
        public SetStoreActivationCommandValidator(IStringLocalizer<I18n> localizer)
        {
            _localizer = localizer;

            RuleFor(x => x.Id)
             .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
             .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"]);
        }
    }
}
