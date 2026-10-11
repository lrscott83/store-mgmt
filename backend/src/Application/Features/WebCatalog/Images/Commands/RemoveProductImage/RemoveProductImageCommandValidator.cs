using Domain.Common.Limits;
using FluentValidation;
using Microsoft.Extensions.Localization;
using Resources;

namespace Application.Features.WebCatalog.Images.Commands.RemoveProductImage
{
    /// <summary>
    /// Forma del comando de borrado: producto y ruta presentes y con longitud acotada. Que la ruta
    /// EXISTA y sea de la tienda del contexto lo decide el handler (404 uniforme), no el validador.
    /// </summary>
    public class RemoveProductImageCommandValidator : AbstractValidator<RemoveProductImageCommand>
    {
        public RemoveProductImageCommandValidator(IStringLocalizer<I18n> localizer)
        {
            RuleFor(x => x.ProductId)
                .NotEmpty()
                .WithMessage(localizer["IsRequired", "{PropertyName}"]);

            RuleFor(x => x.Path)
                .NotEmpty()
                .WithMessage(localizer["IsRequired", "{PropertyName}"])
                .MaximumLength(ProductEntityLimits.ImagePathMaxLength)
                .WithMessage(localizer["CatalogImagePathTooLong", ProductEntityLimits.ImagePathMaxLength]);
        }
    }
}
