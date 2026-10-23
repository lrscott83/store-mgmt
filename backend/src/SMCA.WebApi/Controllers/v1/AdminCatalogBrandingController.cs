using Application.Abstractions.Storage;
using Application.Dtos.WebCatalog;
using Application.Features.WebCatalog.Branding.Commands.UpdateStoreCatalogBranding;
using Application.Features.WebCatalog.Branding.Queries.GetStoreCatalogBranding;
using Application.ResponseModels;
using Asp.Versioning;
using Domain.Common.Enums;
using Domain.Common.Limits;
using Microsoft.AspNetCore.Mvc;
using SMCA.WebApi.Filters;

namespace SMCA.WebApi.Controllers.v1
{
    /// <summary>
    /// SuperAdmin view of the catalog BRANDING, scoped to one store by the route. Same commands as
    /// the owner's <see cref="CatalogBrandingController"/>; the store comes from
    /// <see cref="AdminStoreScopeAttribute"/> instead of the caller's selected store.
    /// </summary>
    [ApiVersion("1.0")]
    [HasPermission(StoreRoleFeatures.SuperAdmin)]
    [AdminStoreScope]
    public class AdminCatalogBrandingController : BaseApiController
    {
        /// <summary>
        /// Marca de la tienda de la ruta. Una tienda sin fila devuelve los valores por defecto — no
        /// un 404.
        /// </summary>
        [HttpGet("~/api/v1/stores/{storeId:guid}/catalog/branding")]
        [ProducesResponseType(typeof(ResponseResult<StoreCatalogBrandingDto>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status403Forbidden)]
        public async Task<IActionResult> GetBrandingAsync()
        {
            return Ok(await Sender.Send(new GetStoreCatalogBrandingQuery()));
        }

        /// <summary>
        /// PUT parcial de la marca (logo y/o banner). Los mismos campos y reglas que el endpoint del
        /// dueño: lo que no viaja no se toca.
        /// </summary>
        [HttpPut("~/api/v1/stores/{storeId:guid}/catalog/branding")]
        [Consumes("multipart/form-data")]
        [RequestSizeLimit(2L * ProductEntityLimits.MaxImageSizeInBytes + 131072)]
        [ProducesResponseType(typeof(ResponseResult<StoreCatalogBrandingDto>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status403Forbidden)]
        public async Task<IActionResult> UpdateBrandingAsync(
            IFormFile? logo,
            IFormFile? banner,
            [FromForm] bool removeLogo,
            [FromForm] bool removeBanner,
            [FromForm] int? mobileColumns)
        {
            return Ok(await Sender.Send(new UpdateStoreCatalogBrandingCommand(
                ToUpload(logo),
                removeLogo,
                ToUpload(banner),
                removeBanner,
                mobileColumns)));
        }

        private static CatalogImageUpload? ToUpload(IFormFile? file)
            => file == null ? null : new CatalogImageUpload(file.OpenReadStream(), file.FileName, file.ContentType, file.Length);
    }
}
