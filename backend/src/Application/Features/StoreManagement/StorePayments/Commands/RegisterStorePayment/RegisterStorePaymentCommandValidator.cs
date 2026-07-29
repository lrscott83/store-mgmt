using FluentValidation;
using Microsoft.Extensions.Localization;
using Resources;

namespace Application.Features.StoreManagement.StorePayments.Commands.RegisterStorePayment
{
    public class RegisterStorePaymentCommandValidator : AbstractValidator<RegisterStorePaymentCommand>
    {
        public RegisterStorePaymentCommandValidator(IStringLocalizer<I18n> localizer)
        {
            RuleFor(x => x.StoreId)
                .NotEmpty().WithMessage(localizer["IsRequired", "{PropertyName}"]);
        }
    }
}
