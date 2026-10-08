using Domain.Entities.StoreCatalogImages;
using FluentValidation;
using Microsoft.Extensions.Localization;
using Resources;

namespace Application.Features.WebCatalog.Showcase.Commands.AddStoreCatalogImage
{
    /// <summary>
    /// ¿Tiene sentido lo que llegó por multipart para añadir una imagen al showcase? Tres reglas, y las
    /// tres son sobre la FORMA del comando, no sobre el contenido del archivo:
    ///
    ///   1. El conjunto tiene que existir. Un `Kind` inventado escribiría una fila que el catálogo
    ///      público nunca publica y que la vista no puede quitar: quedaría ahí para siempre, invisible
    ///      en todas partes.
    ///   2. Hay que traer un archivo. Un multipart sin archivo no es "subir una imagen vacía": es una
    ///      petición que no trae nada que hacer, y aceptarla devolvería un 200 con una clave que no
    ///      apunta a ningún archivo.
    ///   3. El pie de foto tiene un tope. Es texto libre del dueño, pero sale en el catálogo público y
    ///      vive en una columna.
    ///
    /// Lo que NO decide aquí: el formato y el tamaño del archivo. Eso lo comprueba el handler con
    /// `CatalogImageUploadRules`, las mismas reglas y el mismo 400 localizado que las imágenes de
    /// producto y que la marca (F8) — un validador que leyera el `Stream` para decidir el formato
    /// mezclaría dos capas y dejaría dos juegos de reglas que divergirían.
    ///
    /// Tampoco decide el tope de imágenes por conjunto, ni la tienda: lo primero necesita leer el
    /// conjunto actual y lo segundo es el handler, contra el contexto.
    /// </summary>
    public class AddStoreCatalogImageCommandValidator : AbstractValidator<AddStoreCatalogImageCommand>
    {
        public AddStoreCatalogImageCommandValidator(IStringLocalizer<I18n> localizer)
        {
            RuleFor(x => x.Kind)
                .Must(kind => Enum.IsDefined(kind))
                .WithMessage(localizer["ShowcaseImageKindInvalid", "{PropertyName}"]);

            // Un `Stream` no nulable es la señal de que el multipart sí trajo archivo. El archivo vacío
            // (longitud 0) lo rechaza después el handler, con las reglas de imagen.
            RuleFor(x => x.Content)
                .NotNull()
                .WithMessage(localizer["ShowcaseImageRequired", "{PropertyName}"]);

            RuleFor(x => x.Caption)
                .MaximumLength(StoreCatalogImage.CaptionMaxLength)
                .WithMessage(localizer["ShowcaseCaptionTooLong", StoreCatalogImage.CaptionMaxLength])
                .OverridePropertyName(nameof(AddStoreCatalogImageCommand.Caption));
        }
    }
}