using Domain.Common.Limits;
using FluentValidation;
using Microsoft.Extensions.Localization;
using Resources;

namespace Application.Features.WebCatalog.Images.Commands.ReorderProductImages
{
    /// <summary>
    /// Forma del comando de reordenado: producto presente, lista no nula, no vacía y dentro del
    /// tope de imágenes por producto, y cada ruta con longitud acotada. La BIYECCIÓN exacta contra
    /// las imágenes actuales la sigue exigiendo el handler (400), porque necesita leerlas.
    /// </summary>
    public class ReorderProductImagesCommandValidator : AbstractValidator<ReorderProductImagesCommand>
    {
        public ReorderProductImagesCommandValidator(IStringLocalizer<I18n> localizer)
        {
            RuleFor(x => x.ProductId)
                .NotEmpty()
                .WithMessage(localizer["IsRequired", "{PropertyName}"]);

            RuleFor(x => x.Paths)
                .NotNull()
                .WithMessage(localizer["IsRequired", "{PropertyName}"])
                .Must(paths => paths is null || paths.Count is > 0 and <= ProductEntityLimits.MaxImagesPerProduct)
                .WithMessage(localizer["CatalogImagesLimitReached", ProductEntityLimits.MaxImagesPerProduct]);

            RuleForEach(x => x.Paths)
                .MaximumLength(ProductEntityLimits.ImagePathMaxLength)
                .WithMessage(localizer["CatalogImagePathTooLong", "{PropertyName}", ProductEntityLimits.ImagePathMaxLength]);
        }
    }
}
