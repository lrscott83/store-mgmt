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
    /// TRES señales, y las tres se exigen: la extensión declara el formato, el `Content-Type`
    /// declara el tipo y la CABECERA del archivo decide si lo que llegó es de verdad una imagen.
    /// Las dos primeras las escribe quien sube, así que por sí solas no prueban nada — la prueba
    /// es la cabecera. Medir solo una de las tres (como se hacía antes) dejaba la allowlist
    /// esquivable renombrando el archivo o mintiendo en el `Content-Type`.
    ///
    /// La cabecera se lee DESPUÉS del tamaño: un archivo de más se rechaza por su tamaño, que es lo
    /// que la persona puede arreglar, en vez de por "no es una imagen" después de leer de más.
    /// </summary>
    internal static class CatalogImageUploadRules
    {
        /// <summary>
        /// Valida formato y tamaño del archivo que llega por multipart y devuelve el stream con el
        /// que hay que guardarlo: si el stream no se podía rebobinar, la comprobación de la cabecera
        /// ya consumió bytes y devuelve una copia desde el principio.
        /// </summary>
        public static Stream EnsureValid(
            Stream content,
            string? fileName,
            string? contentType,
            long length,
            IStringLocalizer<I18n> localizer)
        {
            string extension = Path.GetExtension(Path.GetFileName(fileName ?? string.Empty)).ToLowerInvariant();

            if (!ProductEntityLimits.AllowedImageExtensions.Contains(extension))
                throw NotAllowed(localizer);

            // El `Content-Type` NO es una prueba por sí solo —lo declara el cliente— pero la
            // allowlist de formatos está publicada y un tipo fuera de ella es un rechazo legítimo
            // de la regla de negocio; la cabecera de abajo es la que decide de verdad.
            if (contentType is null
                || !ProductEntityLimits.AllowedImageContentTypes.Contains(contentType.ToLowerInvariant()))
            {
                throw NotAllowed(localizer);
            }

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
