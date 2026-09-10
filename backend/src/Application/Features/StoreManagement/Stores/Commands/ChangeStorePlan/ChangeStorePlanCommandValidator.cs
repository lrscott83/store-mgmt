using FluentValidation;
using Microsoft.Extensions.Localization;
using Resources;

namespace Application.Features.StoreManagement.Stores.Commands.ChangeStorePlan
{
    /// <summary>
    /// StorePlanId must be a valid, active plan — the handler enforces existence/activeness
    /// too; the validator keeps a fast contract-level check (defined enum value).
    /// </summary>
    public class ChangeStorePlanCommandValidator : AbstractValidator<ChangeStorePlanCommand>
    {
        private readonly IStringLocalizer<I18n> _localizer;

        public ChangeStorePlanCommandValidator(IStringLocalizer<I18n> localizer)
        {
            _localizer = localizer;

            RuleFor(x => x.StoreId)
                .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
                .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"]);

            RuleFor(x => x.StorePlanId)
                .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
                .Must(planId => Enum.IsDefined(typeof(Domain.Common.Enums.StorePlanType), planId))
                    .WithMessage(_localizer["PlanNotFound", "{PropertyName}"]);
        }
    }
}
