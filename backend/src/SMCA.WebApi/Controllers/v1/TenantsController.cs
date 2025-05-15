using Application.Dtos.ApplicationManagement.Tenants;
using Application.Features.ApplicationManagement.Tenants.Commands.CreateTenant;
using Application.Features.ApplicationManagement.Tenants.Commands.DeleteTenant;
using Application.Features.ApplicationManagement.Tenants.Commands.SetMyTenant;
using Application.Features.ApplicationManagement.Tenants.Commands.UpdateTenant;
using Application.Features.ApplicationManagement.Tenants.Queries.GetTenantById;
using Application.Features.ApplicationManagement.Tenants.Queries.GetStoreModules;
using Application.Features.ApplicationManagement.Tenants.Queries.GetTenants;
using Application.ResponseModels;
using Asp.Versioning;
using Domain.Common.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SMCA.WebApi.Filters;

namespace SMCA.WebApi.Controllers.v1
{
    [ApiVersion("1.0")]
    [HasPermission(StoreRoleFeatures.SuperAdmin)]
    public class TenantsController : BaseApiController
    {
        [HttpGet("list")]
        [ProducesResponseType(typeof(ResponseResult<List<TenantDto>>), StatusCodes.Status200OK)]
        public async Task<IActionResult> GetTenantsIncludingActiveFeaturesAsync()
        {
            return Ok(await Sender.Send(new GetTenantsIncludingActiveFeaturesQuery()));
        }

        [HttpGet("all/{includeInactive}")]
        [ProducesResponseType(typeof(ResponseResult<List<TenantDto>>), StatusCodes.Status200OK)]
        public async Task<IActionResult> GetTenantsAsync(bool includeInactive)
        {
            return Ok(await Sender.Send(new GetAllTenantsQuery()));
        }

        [HttpPost("CreateTenant")]
        [ProducesResponseType(typeof(ResponseResult<bool>), StatusCodes.Status200OK)]
        public async Task<IActionResult> CreateTenantAsync(CreateTenantCommand command)
        {
            return Ok(await Sender.Send(command));
        }

        /// <summary>
        /// Update My Tenant Id (only available for Super Admins)
        /// </summary>
        [HttpPut]
        [ProducesResponseType(StatusCodes.Status200OK)]
        public async Task<IActionResult> SetMyTenantIdAsync([FromBody] SetMyTenantCommand command)
        {

            return Ok(await Sender.Send(command));
        }

        /// <summary>
        /// Get Features for current tenant
        /// </summary>
        /// <returns></returns>
        [HttpGet("GetTenantFeatures")]
        [ProducesResponseType(typeof(ResponseResult<List<string>>), StatusCodes.Status200OK)]
        [AllowAnonymous]
        public async Task<IActionResult> GetTenantFeaturesAsync([FromQuery] GetStoreModulesQuery query)
        {
            return Ok(await Sender.Send(query));
        }

        [HttpGet("{id}")]
        [ProducesResponseType(typeof(ResponseResult<TenantDto>), StatusCodes.Status200OK)]
        public async Task<IActionResult> GetTenantByIdAsync(Guid id)
        {
            return Ok(await Sender.Send(new GetTenantByIdQuery(id)));
        }

        [HttpPut("{id}")]
        [ProducesResponseType(typeof(ResponseResult<bool>), StatusCodes.Status200OK)]
        public async Task<IActionResult> UpdatedTenantAsync(Guid id, [FromBody] UpdateTenantCommand command)
        {
            return Ok(await Sender.Send(
                new UpdateTenantCommand(id, command.Name, command.Description, command.ConnectionString, command.IsActive, command.FeatureIds)));
        }

        /// <summary>
        /// Delete tenant by id
        /// </summary>
        [HttpDelete("{id}")]
        [ProducesResponseType(typeof(ResponseResult<bool>), StatusCodes.Status200OK)]
        public async Task<IActionResult> DeleteAsync(Guid id)
        {
            return Ok(await Sender.Send(new DeleteTenantCommand(id)));
        }
    }
}
