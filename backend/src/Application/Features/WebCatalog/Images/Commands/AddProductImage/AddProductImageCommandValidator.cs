using FluentValidation;
using Microsoft.Extensions.Localization;
using Resources;

namespace Application.Features.WebCatalog.Images.Commands.AddProductImage
{
    /// <summary>
    /// Forma del comando de subida. El FORMATO y el TAMAÑO del archivo NO se deciden aquí: los
    /// comprueba el handler con `CatalogImageUploadRules`, con el mismo 400 que las imágenes de
    /// producto (leer el `Stream` en un validador mezclaría dos capas).
    /// </summary>
    public class AddProductImageCommandValidator : AbstractValidator<AddProductImageCommand>
    {
        public AddProductImageCommandValidator(IStringLocalizer<I18n> localizer)
        {
            RuleFor(x => x.ProductId)
                .NotEmpty()
                .WithMessage(localizer["IsRequired", "{PropertyName}"]);
        }
    }
}
