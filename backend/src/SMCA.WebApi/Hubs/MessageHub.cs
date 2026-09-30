using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace SMCA.WebApi.Hubs;

[Authorize]
public class MessageHub : Hub
{
    public override async Task OnConnectedAsync()
    {
        var userId = Context.User?.FindFirst("sub")?.Value;
        if (!string.IsNullOrEmpty(userId))
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, userId);
        }
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var userId = Context.User?.FindFirst("sub")?.Value;
        if (!string.IsNullOrEmpty(userId))
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, userId);
        }
        await base.OnDisconnectedAsync(exception);
    }

    public async Task SendMessageToUser(string userId, object message)
    {
        await Clients.Group(userId).SendAsync("ReceiveMessage", message);
    }

    public async Task MarkAsReadToUser(string userId, Guid messageId)
    {
        await Clients.Group(userId).SendAsync("MessageRead", messageId);
    }
}
