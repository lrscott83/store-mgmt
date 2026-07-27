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
