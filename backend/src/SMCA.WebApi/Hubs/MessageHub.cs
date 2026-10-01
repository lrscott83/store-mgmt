using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace SMCA.WebApi.Hubs;

[Authorize]
public class MessageHub : Hub
{
    public override async Task OnConnectedAsync()
    {
        var groupKey = ResolveGroupKey();
        if (groupKey is not null)
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, groupKey);
        }
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var groupKey = ResolveGroupKey();
        if (groupKey is not null)
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, groupKey);
        }
        await base.OnDisconnectedAsync(exception);
    }

    /// <summary>
    /// Resolves the group key for the current connection from the authenticated
    /// principal. See <see cref="MessageGroupKey"/> for why this is the
    /// <see cref="ClaimTypes.NameIdentifier"/> claim rather than <c>sub</c>.
    /// </summary>
    private string? ResolveGroupKey()
    {
        var externalId = Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        return Guid.TryParse(externalId, out var userId) ? MessageGroupKey.ForUserId(userId) : null;
    }
}
