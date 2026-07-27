using FluentValidation;
using Microsoft.Extensions.Localization;
using Resources;

namespace Application.Features.StoreManagement.Stores.Commands.SetStorePaymentDate
{
    public class SetStorePaymentDateCommandValidator : AbstractValidator<SetStorePaymentDateCommand>
    {
        public SetStorePaymentDateCommandValidator(IStringLocalizer<I18n> localizer)
        {
            RuleFor(x => x.StoreId)
                .NotEmpty().WithMessage(localizer["IsRequired", "{PropertyName}"]);

            RuleFor(x => x.PaymentStartDate)
                .NotEmpty().WithMessage(localizer["IsRequired", "{PropertyName}"]);
        }
    }
}
