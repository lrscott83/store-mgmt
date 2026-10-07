using FluentValidation;
using Microsoft.Extensions.Localization;
using Resources;

namespace Application.Features.WebCatalog.Branding.Commands.UpdateStoreCatalogBranding
{
    /// <summary>
    /// ¿Tiene sentido lo que llegó por multipart para guardar la MARCA (F8)? Dos reglas, y las dos
    /// son sobre la FORMA del comando, no sobre el archivo:
    ///
    ///   1. Algo que hacer. Sin archivo y sin bandera de borrado el PUT no trae ninguna
    ///      instrucción. Aceptarlo escribiría una fila (o tocaría `UpdatedDate`) sin cambiar nada y,
    ///      sobre todo, ENCUBRIRÍA un fallo del cliente: la vista que se olvidó de adjuntar el
    ///      archivo se llevaría un 200 y creería que lo guardó.
    ///   2. No se puede subir Y quitar el mismo lado a la vez: son dos instrucciones OPUESTAS sobre
    ///      la misma columna, y cuál ganaría dependería del orden en que el handler las ejecutara.
    ///
    /// Lo que NO decide aquí: el formato y el tamaño del archivo. Eso lo comprueba el handler con
    /// `CatalogImageUploadRules`, las mismas reglas y el mismo 400 localizado que las imágenes de
    /// producto — un validador que leyera `Stream` para decidir el formato mezclaría dos capas y
    /// dejaría dos juegos de reglas que divergirían.
    ///
    /// Tampoco decide la tienda (eso es el handler, contra el contexto) ni la paleta (cancelada).
    /// </summary>
    public class UpdateStoreCatalogBrandingCommandValidator : AbstractValidator<UpdateStoreCatalogBrandingCommand>
    {
        public UpdateStoreCatalogBrandingCommandValidator(IStringLocalizer<I18n> localizer)
        {
            RuleFor(x => x)
                .Must(x => x.Logo != null || x.RemoveLogo || x.Banner != null || x.RemoveBanner)
                .WithMessage(localizer["BrandingNothingToUpdate", "{PropertyName}"])
                .OverridePropertyName("Logo/Banner");

            // Las dos condiciones cuelgan del objeto entero porque combinan un archivo con una
            // bandera; `OverridePropertyName` hace que el mensaje hable del lado y no de una
            // propiedad que no existe.
            RuleFor(x => x)
                .Must(x => x.Logo == null || !x.RemoveLogo)
                .WithMessage(localizer["BrandingUploadAndRemoveConflict", nameof(UpdateStoreCatalogBrandingCommand.Logo)])
                .OverridePropertyName(nameof(UpdateStoreCatalogBrandingCommand.Logo));

            RuleFor(x => x)
                .Must(x => x.Banner == null || !x.RemoveBanner)
                .WithMessage(localizer["BrandingUploadAndRemoveConflict", nameof(UpdateStoreCatalogBrandingCommand.Banner)])
                .OverridePropertyName(nameof(UpdateStoreCatalogBrandingCommand.Banner));
        }
    }
}