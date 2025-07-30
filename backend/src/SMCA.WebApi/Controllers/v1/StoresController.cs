using Application.Dtos.ApplicationManagement.Tenants;
using Application.Dtos.StoreManagement;
using Application.Features.ApplicationManagement.Tenants.Queries.GetTenantById;
using Application.Features.StoreManagement.Stores.Commands.ApproveStore;
using Application.Features.StoreManagement.Stores.Commands.CreateStore;
using Application.Features.StoreManagement.Stores.Commands.DeleteStore;
using Application.Features.StoreManagement.Stores.Commands.DisapproveStore;
using Application.Features.StoreManagement.Stores.Commands.SetMyStore;
using Application.Features.StoreManagement.Stores.Commands.UpdateStore;
using Application.Features.StoreManagement.Stores.Queries.GetStoreById;
using Application.Features.StoreManagement.Stores.Queries.GetStores;
using Application.Features.StoreManagement.Stores.Queries.GetStoresByCurrentUser;
using Application.ResponseModels;
using Asp.Versioning;
using Domain.Common.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SMCA.WebApi.Filters;

namespace SMCA.WebApi.Controllers.v1
{
    [ApiVersion("1.0")]
    [HasPermission(StoreRoleFeatures.SuperAdmin, StoreRoleFeatures.StoresAdmin)]
    public class StoresController : BaseApiController
    {
        /// <summary>
        /// Update My Store Id (only available for Super Admins and Admins)
        /// </summary>
        [HttpPut]
        [ProducesResponseType(StatusCodes.Status200OK)]
        public async Task<IActionResult> SetMyStoreIdAsync([FromBody] SetMyStoreCommand command)
        {
            return Ok(await Sender.Send(command));
        }

        [HttpGet("by-current-user")]
        [ProducesResponseType(typeof(ResponseResult<List<StoreDto>>), StatusCodes.Status200OK)]
        public async Task<IActionResult> GetStoresByCurrentUserQueryAsync()
        {
            return Ok(await Sender.Send(new GetStoresByCurrentUserQuery()));
        }

        [HttpGet("list/{includeInactive}")]
        [ProducesResponseType(typeof(ResponseResult<List<StoreDto>>), StatusCodes.Status200OK)]
        public async Task<IActionResult> GetStoresAsync(bool includeInactive = false)
        {
            return Ok(await Sender.Send(new GetStoresQuery(includeInactive)));
        }

        [HttpGet("{id}")]
        [ProducesResponseType(typeof(ResponseResult<StoreDto>), StatusCodes.Status200OK)]
        public async Task<IActionResult> GetStoreByIdAsync(Guid id)
        {
            return Ok(await Sender.Send(new GetStoreByIdQuery(id)));
        }

        [HttpPost()]
        [ProducesResponseType(typeof(ResponseResult<StoreDto>), StatusCodes.Status200OK)]
        public async Task<IActionResult> CreateStoreAsync(CreateStoreCommand command)
        {
            return Ok(await Sender.Send(command));
        }

        [HttpPut("{id}")]
        [ProducesResponseType(typeof(ResponseResult<bool>), StatusCodes.Status200OK)]
        public async Task<IActionResult> UpdatedStoreAsync(Guid id, [FromBody] UpdateStoreCommand command)
        {
            return Ok(await Sender.Send(
                new UpdateStoreCommand(id, command.Name, command.Address, command.Description,
                command.Approved, command.PaymentStartDate, command.ModuleIds, command.IsActive)));
        }

        /// <summary>
        /// Delete tenant by id
        /// </summary>
        [HttpDelete("{id}")]
        [ProducesResponseType(typeof(ResponseResult<bool>), StatusCodes.Status200OK)]
        [HasPermission(StoreRoleFeatures.SuperAdmin)]
        public async Task<IActionResult> DeleteAsync(Guid id)
        {
            return Ok(await Sender.Send(new DeactivateStoreCommand(id)));
        }

        [HttpPost("approve")]
        [ProducesResponseType(typeof(ResponseResult<bool>), StatusCodes.Status200OK)]
        [HasPermission(StoreRoleFeatures.SuperAdmin)]
        public async Task<IActionResult> ApproveStoreAsync(ApproveStoreCommand command)
        {
            return Ok(await Sender.Send(command));
        }

        [HttpPost("disapprove")]
        [ProducesResponseType(typeof(ResponseResult<bool>), StatusCodes.Status200OK)]
        [HasPermission(StoreRoleFeatures.SuperAdmin)]
        public async Task<IActionResult> DisapproveStoreAsync(DisapproveStoreCommand command)
        {
            return Ok(await Sender.Send(command));
        }
    }
}
