using Application.Dtos.Administration.Features;
using Application.Features.Administration.Features.Commands.ActivateFeatures;
using Application.Features.Administration.Features.Queries.GetAvailableFeaturesToStore;
using Application.Features.ApplicationManagement.Features.Queries.GetFeatures;
using Application.ResponseModels;
using Asp.Versioning;
using Domain.Common.Enums;
using Microsoft.AspNetCore.Mvc;
using SMCA.WebApi.Filters;

namespace SMCA.WebApi.Controllers.v1
{
    [ApiVersion("1.0")]
    [HasPermission(StoreRoleFeatures.SuperAdmin)]
    public class FeaturesController : BaseApiController
    {

        [HttpGet("all/{includeInactive}")]
        [ProducesResponseType(typeof(ResponseResult<List<FeatureDto>>), StatusCodes.Status200OK)]
        public async Task<IActionResult> GetFeaturesAsync(bool includeInactive)
        {
            return Ok(await Sender.Send(new GetFeaturesQuery(includeInactive)));
        }

        [HttpPost("activate")]
        [ProducesResponseType(typeof(ResponseResult<bool>), StatusCodes.Status200OK)]
        public async Task<IActionResult> ActivateFeaturesAsync()
        {
            return Ok(await Sender.Send(new ActivateFeaturesCommand()));
        }

        [HttpGet("available")]
        [ProducesResponseType(typeof(ResponseResult<List<FeatureDto>>), StatusCodes.Status200OK)]
        [HasPermission(StoreRoleFeatures.SuperAdmin, StoreRoleFeatures.StoresAdmin)]
        public async Task<IActionResult> GetAvailableFeaturesToStoreQueryAsync()
        {
            return Ok(await Sender.Send(new GetAvailableFeaturesToStoreQuery()));
        }
    }
}
