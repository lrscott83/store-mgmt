using Application.Dtos.OnlineOrdering;
using Application.Features.OnlineOrdering.Commands.UpsertStoreCatalogSettings;
using Application.Features.OnlineOrdering.Queries.GetStoreCatalogSettings;
using Application.ResponseModels;
using Asp.Versioning;
using Domain.Common.Enums;
using Microsoft.AspNetCore.Mvc;
using SMCA.WebApi.Filters;

namespace SMCA.WebApi.Controllers.v1
{
    /// <summary>
    /// Endpoints de GESTIÓN de la configuración de pedidos (F1, vista "Pedidos WhatsApp"). No
    /// gestionan pedidos: los configuran. Atender pedidos, ventas y repartidores es la feature
    /// `OnlineOrdersAdmin` (D15), que sí incluye al `StoreUser`; esta vista de configuración es
    /// `WebCatalogAdmin`, igual que la marca, porque configurar la tienda es cosa del dueño.
    ///
    /// RUTAS ABSOLUTAS A PROPÓSITO (`~/api/v1/online-ordering/settings`): `BaseApiController` fija
    /// `[Route("api/v1/[controller]")]`, y el token `[controller]` no puede producir el segmento
    /// con guion de `online-ordering`. Poner `[Route("api/v1/online-ordering")]` en esta clase NO
    /// lo resolvería: los atributos de ruta se COMBINAN con los heredados, así que cada action
    /// quedaría además en `api/v1/OnlineOrdering/settings`. Una ruta action con `~/` REEMPLAZA la
    /// plantilla del controlador, que es justo lo que hace `PublicCatalogController`.
    /// </summary>
    [ApiVersion("1.0")]
    [HasPermission(StoreRoleFeatures.WebCatalogAdmin)]
    public class OnlineOrderingController : BaseApiController
    {
        /// <summary>
        /// Configuración de pedidos de la tienda actual. Si la tienda no tiene fila devuelve los
        /// valores por defecto con `Enabled = false` — no un 404.
        /// </summary>
        [HttpGet("~/api/v1/online-ordering/settings")]
        [ProducesResponseType(typeof(ResponseResult<StoreCatalogSettingsDto>), StatusCodes.Status200OK)]
        public async Task<IActionResult> GetSettingsAsync()
        {
            return Ok(await Sender.Send(new GetStoreCatalogSettingsQuery()));
        }

        /// <summary>
        /// Guarda la configuración (el botón "Sincronizar"): alta la primera vez, actualización
        /// después, y fija `SyncedAt`. Escribe SOLO las columnas de pedidos — la marca es de F8 y
        /// no se toca (D19).
        /// </summary>
        [HttpPut("~/api/v1/online-ordering/settings")]
        [ProducesResponseType(typeof(ResponseResult<StoreCatalogSettingsDto>), StatusCodes.Status200OK)]
        public async Task<IActionResult> UpsertSettingsAsync([FromBody] UpsertStoreCatalogSettingsCommand request)
        {
            return Ok(await Sender.Send(request));
        }
    }
}