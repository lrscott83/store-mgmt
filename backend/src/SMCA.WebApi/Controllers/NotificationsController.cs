using Application.Features.Notifications.Commands.MarkAllAsRead;
using Application.Features.Notifications.Commands.MarkAsRead;
using Application.Features.Notifications.Queries.GetNotifications;
using Application.ResponseModels;
using Asp.Versioning;
using Domain.Common.Enums;
using Microsoft.AspNetCore.Mvc;
using SMCA.WebApi.Filters;

namespace SMCA.WebApi.Controllers;

/// <summary>
/// The SuperAdmin's bell. Class-level <see cref="HasPermissionAttribute"/> with the SuperAdmin
/// feature — the same gate <c>ReSellersController</c> uses — so the bell data can never be read by
/// an owner, a store user or a Gestor.
/// </summary>
[ApiVersion("1.0")]
[HasPermission(StoreRoleFeatures.SuperAdmin)]
public class NotificationsController : BaseApiController
{
    [HttpGet]
    [ProducesResponseType(typeof(ResponseResult<NotificationsListDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetNotifications(CancellationToken cancellationToken)
    {
        return Ok(await Sender.Send(new GetNotificationsQuery(), cancellationToken));
    }

    [HttpPost("{id:guid}/read")]
    [ProducesResponseType(typeof(ResponseResult<bool>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> MarkAsRead(Guid id, CancellationToken cancellationToken)
    {
        return Ok(await Sender.Send(new MarkAsReadCommand(id), cancellationToken));
    }

    [HttpPost("mark-all-read")]
    [ProducesResponseType(typeof(ResponseResult<int>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> MarkAllAsRead(CancellationToken cancellationToken)
    {
        return Ok(await Sender.Send(new MarkAllAsReadCommand(), cancellationToken));
    }
}