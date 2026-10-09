using Application.Abstractions.Storage;
using Application.Dtos.WebCatalog;
using Application.Features.WebCatalog.Branding.Commands.UpdateStoreCatalogBranding;
using Application.Features.WebCatalog.Branding.Queries.GetStoreCatalogBranding;
using Application.ResponseModels;
using Asp.Versioning;
using Domain.Common.Enums;
using Microsoft.AspNetCore.Mvc;
using SMCA.WebApi.Filters;

namespace SMCA.WebApi.Controllers.v1
{
    /// <summary>
    /// Endpoints de GESTIÓN de la MARCA del catálogo (F8): el logo y el banner que el dueño sube
    /// desde la vista Catálogo Web (OwnerAdmin). Es la MISMA feature que el catálogo —el módulo 18
    /// no crece— y por eso `WebCatalogAdmin`, no `OnlineOrdersAdmin`: configurar la tienda es cosa
    /// del dueño (D15).
    ///
    /// RUTAS ABSOLUTAS A PROPÓSITO (`~/api/v1/catalog/branding`): `BaseApiController` fija
    /// `[Route("api/v1/[controller]")]`, así que sin `~/` cada action quedaría además en
    /// `api/v1/CatalogBranding/...`. La ruta action con `~/` REEMPLAZA la plantilla del
    /// controlador, igual que hace `PublicCatalogController`.
    ///
    /// Sirve (que no administra) el catálogo: el contenido de marca lo publica el config anónimo
    /// (`PublicOrderingController`) y lo entrega el endpoint de media
    /// (`GET /api/v1/public/catalog/{storeSlug}/media/{**key}`), sin cambios.
    /// </summary>
    [ApiVersion("1.0")]
    [HasPermission(StoreRoleFeatures.WebCatalogAdmin)]
    public class CatalogBrandingController : BaseApiController
    {
        /// <summary>
        /// Marca de la tienda actual. Una tienda sin fila devuelve los valores por defecto (sin
        /// logo, sin banner, paleta actual) — no un 404.
        /// </summary>
        [HttpGet("~/api/v1/catalog/branding")]
        [ProducesResponseType(typeof(ResponseResult<StoreCatalogBrandingDto>), StatusCodes.Status200OK)]
        public async Task<IActionResult> GetBrandingAsync()
        {
            return Ok(await Sender.Send(new GetStoreCatalogBrandingQuery()));
        }

        /// <summary>
        /// Sube, cambia o quita el logo y/o el banner, y elige la plantilla (vista) del catálogo. Los
        /// campos son independientes: lo que no se manda no se toca, así que cambiar el logo no borra
        /// el banner ni la plantilla. `templateId` en blanco (o ausente) = no se toca.
        ///
        /// Multipart porque los archivos viajan como `IFormFile`; la capa Application recibe
        /// streams (`CatalogImageUpload`), igual que las imágenes de producto.
        /// </summary>
        [HttpPut("~/api/v1/catalog/branding")]
        [Consumes("multipart/form-data")]
        [ProducesResponseType(typeof(ResponseResult<StoreCatalogBrandingDto>), StatusCodes.Status200OK)]
        public async Task<IActionResult> UpdateBrandingAsync(
            IFormFile? logo, IFormFile? banner, bool removeLogo, bool removeBanner, string? templateId)
        {
            // Si el multipart no trae archivo, el binding deja el IFormFile en null y se traduce a
            // `null`: "no menciono este lado". Un archivo de longitud 0 (o de formato inválido) lo
            // rechaza `CatalogImageUploadRules` con el 400 localizado.
            return Ok(await Sender.Send(new UpdateStoreCatalogBrandingCommand(
                ToUpload(logo),
                removeLogo,
                ToUpload(banner),
                removeBanner,
                templateId)));
        }

        /// <summary>
        /// `IFormFile` → el DTO de la capa Application. `null` cuando no vino archivo, que es lo
        /// que el handler distingue de "subir un archivo de cero bytes".
        /// </summary>
        private static CatalogImageUpload? ToUpload(IFormFile? file)
            => file == null ? null : new CatalogImageUpload(file.OpenReadStream(), file.FileName, file.ContentType, file.Length);
    }
}