using Application.Common;
using Application.Exceptions;
using Domain.Common.Limits;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.WebCatalog.Images
{
    /// <summary>
    /// Reglas de las imágenes del catálogo web (plan 2026-09-27, decisión D10):
    /// formatos jpg/jpeg/png/webp, máximo 2 MB por archivo y 6 por producto.
    ///
    /// La extensión decide cuál es el FORMATO DECLARADO, y la cabecera decide si el archivo es de
    /// verdad ese formato. Las dos cosas se exigen: antes bastaba con una, y una de las dos la
    /// escribe quien sube. El `Content-Type` ya no cuenta como permiso —es la tercera cosa que
    /// declara el cliente, no una prueba—, así que renombrar un archivo cualquiera a `.png` se
    /// queda en el 400 localizado de siempre.
    /// </summary>
    internal static class CatalogImageUploadRules
    {
        /// <summary>
        /// Valida formato y tamaño del archivo que llega por multipart y devuelve el stream con el
        /// que hay que guardarlo: si el stream no se podía rebobinar, la comprobación de la cabecera
        /// ya consumió bytes y devuelve una copia desde el principio.
        /// </summary>
        public static Stream EnsureValid(
            Stream content, string? fileName, long length, IStringLocalizer<I18n> localizer)
        {
            string extension = Path.GetExtension(Path.GetFileName(fileName ?? string.Empty)).ToLowerInvariant();

            // La extensión es la primera puerta: sin ella no hay formato declarado que comprobar.
            if (!ProductEntityLimits.AllowedImageExtensions.Contains(extension))
                throw NotAllowed(localizer);

            // El tamaño se comprueba ANTES de leer la cabecera: un archivo demasiado grande se
            // rechaza por su tamaño, que es lo que el dueño puede arreglar, y no por "no es una
            // imagen" —que además sería cierto— después de haber leído bytes de más.
            if (length <= 0)
                throw NotAllowed(localizer);

            if (length > ProductEntityLimits.MaxImageSizeInBytes)
                throw new ApiException(
                    localizer["CatalogImageTooLarge", ProductEntityLimits.MaxImageSizeInBytes / (1024 * 1024)],
                    HttpStatusCode.BadRequest);

            (byte[] head, Stream reusable) = FileSignatureInspector.ReadHead(content);
            if (!FileSignatureInspector.IsAllowedImage(head))
                throw NotAllowed(localizer);

            return reusable;
        }

        private static ApiException NotAllowed(IStringLocalizer<I18n> localizer) =>
            new(localizer["CatalogImageTypeNotAllowed", ProductEntityLimits.AllowedImageFormatsLabel],
                HttpStatusCode.BadRequest);
    }
}
