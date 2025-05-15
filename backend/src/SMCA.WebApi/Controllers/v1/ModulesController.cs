using Application.Dtos.Administration.Modules;
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
    }
}
