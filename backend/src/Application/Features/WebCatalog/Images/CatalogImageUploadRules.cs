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

            if (!extensionAllowed && !contentTypeAllowed)
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
