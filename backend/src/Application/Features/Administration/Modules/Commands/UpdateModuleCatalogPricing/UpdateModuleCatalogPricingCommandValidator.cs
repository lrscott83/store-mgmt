using FluentValidation;
using Microsoft.Extensions.Localization;
using Resources;

namespace Application.Features.Administration.Modules.Commands.UpdateModuleCatalogPricing
{
    /// <summary>
    /// Contract-level checks for the module catalog pricing save. The handler additionally
    /// re-verifies that every module id exists in the catalog — the validator is a fast
    /// first line, not the authority on module existence.
    /// </summary>
    public class UpdateModuleCatalogPricingCommandValidator : AbstractValidator<UpdateModuleCatalogPricingCommand>
    {
        private readonly IStringLocalizer<I18n> _localizer;

        public UpdateModuleCatalogPricingCommandValidator(IStringLocalizer<I18n> localizer)
        {
            _localizer = localizer;

            // Modules is the complete table the operator was shown, so it must never be
            // empty: an empty payload would be a silent no-op masquerading as a save.
            RuleFor(x => x.Modules)
                .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
                .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"])
                // One row per module: a duplicate ModuleId would make the persisted price
                // depend on payload order. Fail closed. The null arm keeps this safe under
                // the default Continue cascade, where Must still runs after NotNull fails.
                .Must(rows => rows is null || rows.Select(r => r.ModuleId).Distinct().Count() == rows.Count);

            // The null guard is explicit rather than left to FluentValidation's collection
            // handling: a null Modules is already a NotNull failure above, and the child
            // rules must not run over it.
            RuleForEach(x => x.Modules)
                .ChildRules(row =>
                {
                    row.RuleFor(r => r.ModuleId)
                        .GreaterThan(0);

                    // Prices are unsigned money: a negative price is never a discount.
                    row.RuleFor(r => r.Price)
                        .GreaterThanOrEqualTo(0).WithMessage(_localizer["GreaterThanOrEqualTo", "{PropertyName}", 0]);

                    row.RuleFor(r => r.DiscountPrice)
                        .GreaterThanOrEqualTo(0).WithMessage(_localizer["GreaterThanOrEqualTo", "{PropertyName}", 0]);

                    // A percent above 100 is not a deeper discount, it is a price
                    // INCREASE: GetCurrentPrice subtracts price*percent/100, so 150 hands
                    // back a negative amount that only the zero clamp hides. Cap it.
                    row.RuleFor(r => r.PercentDiscountPrice)
                        .GreaterThanOrEqualTo(0).WithMessage(_localizer["GreaterThanOrEqualTo", "{PropertyName}", 0])
                        .LessThanOrEqualTo(100).WithMessage(_localizer["LessThanOrEqualTo", "{PropertyName}", 100]);
                })
                .When(x => x.Modules is not null);
        }
    }
}
