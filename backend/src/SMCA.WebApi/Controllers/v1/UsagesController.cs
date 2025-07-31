using Application.Features.Management.Usages.Commands.UpdateStoreDailyUsage;
using Application.ResponseModels;
using Asp.Versioning;
using Domain.Common.Enums;
using Microsoft.AspNetCore.Mvc;
using SMCA.WebApi.Filters;

namespace SMCA.WebApi.Controllers.v1
{
    [ApiVersion("1.0")]
    //[HasPermission(StoreRoleFeatures.ProfileAdmin)]
    public class UsagesController : BaseApiController
    {
        [HttpPost("store-daily-usage")]
        [ProducesResponseType(typeof(ResponseResult<bool>), StatusCodes.Status200OK)]
        public async Task<IActionResult> ApproveStoreAsync(UpdateStoreDailyUsageCommand command)
        {
            return Ok(await Sender.Send(command));
        }
    }
}
