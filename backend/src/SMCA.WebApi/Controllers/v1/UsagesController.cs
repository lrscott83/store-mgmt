using Application.Dtos.Administration.Features;
using Application.Dtos.Management.Usages;
using Application.Features.Management.Usages.Commands.UpdateStoreDailyUsage;
using Application.Features.Management.Usages.Queries.GetStoreLastWeekUsages;
using Application.ResponseModels;
using Asp.Versioning;
using Domain.Common.Enums;
using Microsoft.AspNetCore.Mvc;
using SMCA.WebApi.Filters;

namespace SMCA.WebApi.Controllers.v1
{
    [ApiVersion("1.0")]
    [HasPermission(StoreRoleFeatures.ProfileAdmin)]
    public class UsagesController : BaseApiController
    {
        [HttpPost("store-daily-usage")]
        [ProducesResponseType(typeof(ResponseResult<bool>), StatusCodes.Status200OK)]
        public async Task<IActionResult> ApproveStoreAsync(UpdateStoreDailyUsageCommand command)
        {
            return Ok(await Sender.Send(command));
        }

        [HttpGet("stores-last-week")]
        [ProducesResponseType(typeof(ResponseResult<StoreUsagesDto>), StatusCodes.Status200OK)]
        [HasPermission(StoreRoleFeatures.SuperAdmin)]
        public async Task<IActionResult> GetStoreLastWeekUsagesQueryAsync()
        {
            return Ok(await Sender.Send(new GetStoreLastUsagesQuery(7)));
        }

        [HttpGet("stores-last-month")]
        [ProducesResponseType(typeof(ResponseResult<StoreUsagesDto>), StatusCodes.Status200OK)]
        [HasPermission(StoreRoleFeatures.SuperAdmin)]
        public async Task<IActionResult> GetStoreLastMonthUsagesQueryAsync()
        {
            return Ok(await Sender.Send(new GetStoreLastUsagesQuery(30)));
        }
    }
}