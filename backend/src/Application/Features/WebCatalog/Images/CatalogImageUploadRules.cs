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
    /// </summary>
    internal static class CatalogImageUploadRules
    {
        /// <summary>Valida formato y tamaño del archivo que llega por multipart.</summary>
        public static void EnsureValid(string? fileName, string? contentType, long length, IStringLocalizer<I18n> localizer)
        {
            string extension = Path.GetExtension(Path.GetFileName(fileName ?? string.Empty)).ToLowerInvariant();
            bool extensionAllowed = ProductEntityLimits.AllowedImageExtensions.Contains(extension);
            bool contentTypeAllowed = contentType != null
                && ProductEntityLimits.AllowedImageContentTypes.Contains(contentType.ToLowerInvariant());

            // Un archivo tiene que ser VÁLIDO POR LAS DOS SEÑALES, no por una. Con `&&` bastaba
            // con que la extensión estuviera en la lista para aceptar cualquier content type (y
            // al revés), así que la allowlist se esquivaba declarando `foto.jpg` + `text/plain`.
            // La extensión la controla el cliente y el content type también: la única lectura
            // segura es rechazar si CUALQUIERA de los dos queda fuera.
            if (!extensionAllowed || !contentTypeAllowed)
                throw new ApiException(
                    localizer["CatalogImageTypeNotAllowed", ProductEntityLimits.AllowedImageFormatsLabel],
                    HttpStatusCode.BadRequest);

            if (length <= 0)
                throw new ApiException(
                    localizer["CatalogImageTypeNotAllowed", ProductEntityLimits.AllowedImageFormatsLabel],
                    HttpStatusCode.BadRequest);

            if (length > ProductEntityLimits.MaxImageSizeInBytes)
                throw new ApiException(
                    localizer["CatalogImageTooLarge", ProductEntityLimits.MaxImageSizeInBytes / (1024 * 1024)],
                    HttpStatusCode.BadRequest);
        }
    }
}
