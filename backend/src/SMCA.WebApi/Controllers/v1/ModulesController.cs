using Application.Dtos.Administration.Modules;
using Application.Features.Administration.Modules.Commands.UpdateModuleCatalogPricing;
using Application.Modules.Administration.Modules.Queries.GetAvailableModulesToStore;
using Application.ResponseModels;
using Asp.Versioning;
using Domain.Common.Enums;
using Microsoft.AspNetCore.Mvc;
using SMCA.WebApi.Filters;

namespace SMCA.WebApi.Controllers.v1
{
    [ApiVersion("1.0")]
    [HasPermission(StoreRoleFeatures.StoresAdmin)]
    public class ModulesController : BaseApiController
    {
        /// <summary>
        /// Get all GetAvailableModulesToStore
        /// </summary>
        /// <returns></returns>
        [HttpGet("ToStore")]
        [ProducesResponseType(typeof(ResponseResult<List<ModuleDto>>), StatusCodes.Status200OK)]
        
        public async Task<IActionResult> GetAvailableModulesToStoreQueryAsync()
        {
            return Ok(await Sender.Send(new GetAvailableModulesToStoreQuery()));
        }

        /// <summary>
        /// SuperAdmin authors the GLOBAL module catalog pricing (PUT /v1/modules/pricing).
        /// Body carries the complete table shown in the editor, each row with the three
        /// editable price fields. Exactly three fields move — Price, DiscountPrice and
        /// PercentDiscountPrice; IsActive, AvailableToStore, PriceIncluded, Name and Order
        /// are read and written back untouched, so a pricing save can never publish, hide,
        /// re-bundle or rename a module. An unknown module id aborts the WHOLE save (nothing
        /// is half-applied). Returns the saved rows with CurrentPrice recalculated by
        /// CurrentPriceServiceUtils, the same formula GET /v1/modules/ToStore reports, plus
        /// the total over the submitted table.
        /// </summary>
        [HttpPut("pricing")]
        [HasPermission(StoreRoleFeatures.SuperAdmin)]
        [ProducesResponseType(typeof(ResponseResult<ModuleCatalogPricingResultDto>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        [ProducesResponseType(StatusCodes.Status403Forbidden)]
        public async Task<IActionResult> UpdateModuleCatalogPricingAsync(
            [FromBody] UpdateModuleCatalogPricingCommand command)
            => Ok(await Sender.Send(command));
    }
}
