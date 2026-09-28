using Domain.Common.Catalog;
using Domain.Common.Limits;
using FluentValidation;
using Microsoft.Extensions.Localization;
using Resources;

namespace Application.Features.WebCatalog.Commands.UpdateProductCatalogFields
{
    /// <summary>
    /// Reglas de los campos del catálogo. Son las MISMAS que aplica `UpdateProductCommand` sobre los
    /// campos equivalentes: un valor que no pasa aquí tampoco entra por el otro camino.
    /// </summary>
    public class UpdateProductCatalogFieldsCommandValidator : AbstractValidator<UpdateProductCatalogFieldsCommand>
    {
        public UpdateProductCatalogFieldsCommandValidator(IStringLocalizer<I18n> localizer)
        {
            RuleFor(x => x.Id)
                .NotEmpty().WithMessage(localizer["IsRequired", "{PropertyName}"]);

            RuleFor(x => x.Description)
                .MaximumLength(ProductEntityLimits.DescriptionMaxLength)
                .WithMessage(localizer["CatalogDescriptionTooLong", "{PropertyName}", ProductEntityLimits.DescriptionMaxLength]);

            RuleFor(x => x.PercentDiscountPrice)
                .InclusiveBetween(0, CatalogScales.MAX_PERCENT_SCALED)
                .WithMessage(localizer["CatalogPercentDiscountRange", "{PropertyName}"])
                .When(x => x.PercentDiscountPrice.HasValue);

            RuleFor(x => x.DiscountPrice)
                .GreaterThanOrEqualTo(0)
                .WithMessage(localizer["CatalogDiscountPriceRange", "{PropertyName}"])
                .When(x => x.DiscountPrice.HasValue);

            RuleFor(x => x.Image)
                .MaximumLength(ProductEntityLimits.ImagePathMaxLength)
                .WithMessage(localizer["CatalogImagePathTooLong", "{PropertyName}", ProductEntityLimits.ImagePathMaxLength])
                .When(x => !string.IsNullOrEmpty(x.Image));
        }
    }
}
