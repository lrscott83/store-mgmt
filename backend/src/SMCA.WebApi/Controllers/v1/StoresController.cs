using Application.Dtos.ApplicationManagement.Tenants;
using Application.Dtos.StoreManagement;
using Application.Features.ApplicationManagement.Tenants.Queries.GetTenantById;
using Application.Features.StoreManagement.Stores.Commands.SetStorePaymentDate;
using Application.Features.StoreManagement.StorePayments.Commands.RegisterStorePayment;
using Application.Features.StoreManagement.StorePayments.Queries.GetReSellerCommissions;
using Application.Features.StoreManagement.StorePayments.Queries.GetStoresToCollect;
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
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        [ProducesResponseType(StatusCodes.Status403Forbidden)]
        public async Task<IActionResult> SetMyStoreIdAsync([FromBody] SetMyStoreCommand command)
        {
            return Ok(await Sender.Send(command));
        }

        /// <summary>
        /// Gets stores accessible by the current authenticated user. SuperAdmin sees all stores across tenants. Other authorized roles see only their owned stores.
        /// </summary>
        [HttpGet("by-current-user")]
        [ProducesResponseType(typeof(ResponseResult<List<StoreDto>>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        [ProducesResponseType(StatusCodes.Status403Forbidden)]
        public async Task<IActionResult> GetStoresByCurrentUserQueryAsync()
        {
            return Ok(await Sender.Send(new GetStoresByCurrentUserQuery()));
        }

        /// <summary>
        /// Get all stores, optionally including inactive ones.
        /// Only available for SuperAdmin and StoresAdmin roles.
        /// When includeInactive is false (default), only active stores are returned.
        /// </summary>
        [HttpGet("list/{includeInactive}")]
        [ProducesResponseType(typeof(ResponseResult<List<StoreDto>>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        [ProducesResponseType(StatusCodes.Status403Forbidden)]
        public async Task<IActionResult> GetStoresAsync(bool includeInactive = false)
        {
            return Ok(await Sender.Send(new GetStoresQuery(includeInactive)));
        }

        /// <summary>
        /// Get store by its unique identifier.
        /// Only available for SuperAdmin and StoresAdmin roles.
        /// </summary>
        [HttpGet("{id}")]
        [ProducesResponseType(typeof(ResponseResult<StoreDto>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        [ProducesResponseType(StatusCodes.Status403Forbidden)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        public async Task<IActionResult> GetStoreByIdAsync(Guid id)
        {
            return Ok(await Sender.Send(new GetStoreByIdQuery(id)));
        }

        [HttpPost()]
        [ProducesResponseType(typeof(ResponseResult<StoreDto>), StatusCodes.Status201Created)]
        public async Task<IActionResult> CreateStoreAsync([FromBody] CreateStoreCommand command)
        {
            var result = await Sender.Send(command);
            return result.Succeeded
                ? CreatedAtAction("GetStoreById", new { id = result.Data!.Id }, result)
                : Ok(result);
        }

        [HttpPut("{id}")]
        [ProducesResponseType(typeof(ResponseResult<bool>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        [ProducesResponseType(StatusCodes.Status403Forbidden)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        public async Task<IActionResult> UpdatedStoreAsync(Guid id, [FromBody] UpdateStoreCommand command)
        {
            return Ok(await Sender.Send(
                new UpdateStoreCommand(id, command.Name, command.Address, command.Description,
                command.Approved, command.ModuleIds, command.IsActive)));
        }

        /// <summary>
        /// Set store PaymentStartDate (SuperAdmin only).
        /// Use a separate endpoint instead of including PaymentStartDate in the update command,
        /// since only SuperAdmin can set this date and it has distinct semantics from general store updates.
        /// </summary>
        [HttpPut("{storeId}/payment-date")]
        [HasPermission(StoreRoleFeatures.SuperAdmin)]
        [ProducesResponseType(typeof(ResponseResult<bool>), StatusCodes.Status200OK)]
        public async Task<IActionResult> SetStorePaymentDateAsync(Guid storeId, [FromBody] SetStorePaymentDateCommand command)
        {
            return Ok(await Sender.Send(new SetStorePaymentDateCommand(storeId, command.PaymentStartDate)));
        }

        /// <summary>
        /// Deactivate store by id
        /// </summary>
        [HttpDelete("{id}")]
        [ProducesResponseType(typeof(ResponseResult<bool>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        [ProducesResponseType(StatusCodes.Status403Forbidden)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
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

        [HttpPost("{storeId}/payments")]
        [HasPermission(StoreRoleFeatures.SuperAdmin, StoreRoleFeatures.StorePaymentAdmin)]
        [ProducesResponseType(typeof(ResponseResult<bool>), StatusCodes.Status200OK)]
        public async Task<IActionResult> RegisterStorePaymentAsync(Guid storeId)
            => Ok(await Sender.Send(new RegisterStorePaymentCommand(storeId)));

        [HttpGet("to-collect")]
        [HasPermission(StoreRoleFeatures.SuperAdmin, StoreRoleFeatures.StorePaymentAdmin)]
        [ProducesResponseType(typeof(ResponseResult<IEnumerable<StoreToCollectDto>>), StatusCodes.Status200OK)]
        public async Task<IActionResult> GetStoresToCollectAsync()
            => Ok(await Sender.Send(new GetStoresToCollectQuery()));

        [HttpGet("reseller-commissions")]
        [HasPermission(StoreRoleFeatures.SuperAdmin, StoreRoleFeatures.StorePaymentAdmin)]
        [ProducesResponseType(typeof(ResponseResult<IEnumerable<ReSellerCommissionDto>>), StatusCodes.Status200OK)]
        public async Task<IActionResult> GetReSellerCommissionsAsync()
            => Ok(await Sender.Send(new GetReSellerCommissionsQuery()));
    }
}
