using FluentValidation;
using Microsoft.Extensions.Localization;
using Resources;

namespace Application.Features.StoreManagement.Stores.Commands.UpdateStoreCatalogSlug
{
    /// <summary>
    /// Comprobaciones de contrato del slug del catálogo. NO valida el formato —el handler normaliza
    /// con <c>SlugNormalizer</c> y el resultado siempre cumple el alfabeto—, así que aquí solo se
    /// exige que la entrada no venga en blanco: una tienda con catálogo no puede quedarse sin slug.
    /// (El `FallbackSlug` del normalizador —"catalogo"— es para el AUTOGENERADO; aceptarlo aquí
    /// convertiría un envío vacío en un slug que nadie eligió.)
    ///
    /// La colisión y la existencia de la tienda las comprueba el handler: necesitan la base de datos.
    /// </summary>
    public class UpdateStoreCatalogSlugCommandValidator
        : AbstractValidator<UpdateStoreCatalogSlugCommand>
    {
        public UpdateStoreCatalogSlugCommandValidator(IStringLocalizer<I18n> localizer)
        {
            RuleFor(x => x.StoreId).NotEmpty();

            // El `Slug` puede llegar nulo; NotEmpty cubre nulo y cadena vacía, y `Must` no se
            // ejecuta sobre un valor que ya falló cuando el mensaje es el de la regla base.
            RuleFor(x => x.Slug)
                .NotEmpty()
                .WithMessage(localizer["IsRequired", nameof(UpdateStoreCatalogSlugCommand.Slug)]);
        }
    }
}
