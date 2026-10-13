using Application.Dtos.Administration.Plans;
using Application.Features.Administration.Plans.Queries.GetPlans;
using Application.ResponseModels;
using Asp.Versioning;
using Domain.Common.Enums;
using Microsoft.AspNetCore.Mvc;
using SMCA.WebApi.Filters;

namespace SMCA.WebApi.Controllers.v1
{
    [ApiVersion("1.0")]
    [HasPermission(StoreRoleFeatures.StoresAdmin)]
    public class PlansController : BaseApiController
    {
        /// <summary>
        /// Read-only plan catalog (Gratis, Pago, Superior — VIP excluded) with
        /// member modules and computed prices. No plan/billing mutation surface.
        ///
        /// <paramref name="includeInactiveModules"/> is a SuperAdmin-only opt-in that keeps the
        /// inactive modules in <c>plan.modules</c> (each carrying <c>isActive=false</c>), which
        /// the module catalog editor needs to group a deactivated module under its own plan.
        /// The default preserves the active-only shape every plan-change panel relies on.
        /// </summary>
        [HttpGet]
        [ProducesResponseType(typeof(ResponseResult<List<PlanDto>>), StatusCodes.Status200OK)]
        public async Task<IActionResult> GetPlansAsync([FromQuery] bool includeInactiveModules = false)
        {
            return Ok(await Sender.Send(new GetPlansQuery(includeInactiveModules)));
        }
    }
}