using Application.Dtos.ApplicationManagement.Tenants;
using Application.Features.ApplicationManagement.Features.Queries.GetFeatures;
using Application.ResponseModels;
using Domain.Common.Enums;
using Microsoft.AspNetCore.Mvc;
using WebApiTest.Filters;

namespace WebApiTest.Controllers.v1
{
    [ApiVersion("1.0")]
    [HasApplicationRole(StoreRoleFeatures.SuperAdmin)]
    public class FeaturesController : BaseApiController
    {

        [HttpGet("all/{includeInactive}")]
        [ProducesResponseType(typeof(ResponseResult<List<FeatureDto>>), StatusCodes.Status200OK)]
        public async Task<IActionResult> GetFeaturesAsync(bool includeInactive)
        {
            return Ok(await Sender.Send(new GetFeaturesQuery(includeInactive)));
        }
    }
}
