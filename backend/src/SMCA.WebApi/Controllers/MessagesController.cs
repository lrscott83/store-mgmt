using Application.Features.Messages.Commands.BroadcastMessage;
using Application.Features.Messages.Commands.DeleteAllMessages;
using Application.Features.Messages.Commands.DeleteMessage;
using Application.Features.Messages.Commands.MarkAllAsRead;
using Application.Features.Messages.Commands.MarkAsRead;
using Application.Features.Messages.Commands.SendMessage;
using Application.Features.Messages.Queries.GetConversations;
using Application.Features.Messages.Queries.GetMessages;
using Microsoft.AspNetCore.Mvc;

namespace SMCA.WebApi.Controllers;

[ApiController]
[Route("api/v1/[controller]")]
[Produces("application/json")]
public class MessagesController : BaseApiController
{
    [HttpGet("conversations")]
    public async Task<IActionResult> GetConversations(CancellationToken cancellationToken)
    {
        return Ok(await Sender.Send(new GetConversationsQuery(), cancellationToken));
    }

    [HttpGet("conversations/{id:guid}/messages")]
    public async Task<IActionResult> GetMessages(Guid id, CancellationToken cancellationToken)
    {
        return Ok(await Sender.Send(new GetMessagesQuery(id), cancellationToken));
    }

    [HttpPost]
    public async Task<IActionResult> SendMessage([FromBody] SendMessageCommand request, CancellationToken cancellationToken)
    {
        return Ok(await Sender.Send(request, cancellationToken));
    }

    [HttpPost("{id:guid}/read")]
    public async Task<IActionResult> MarkAsRead(Guid id, CancellationToken cancellationToken)
    {
        return Ok(await Sender.Send(new MarkAsReadCommand(id), cancellationToken));
    }

    [HttpPost("mark-all-read")]
    public async Task<IActionResult> MarkAllAsRead(CancellationToken cancellationToken)
    {
        return Ok(await Sender.Send(new MarkAllAsReadCommand(), cancellationToken));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> DeleteMessage(Guid id, CancellationToken cancellationToken)
    {
        return Ok(await Sender.Send(new DeleteMessageCommand(id), cancellationToken));
    }

    [HttpDelete]
    public async Task<IActionResult> DeleteAllMessages(CancellationToken cancellationToken)
    {
        return Ok(await Sender.Send(new DeleteAllMessagesCommand(), cancellationToken));
    }

    [HttpPost("broadcast")]
    public async Task<IActionResult> Broadcast([FromBody] BroadcastMessageCommand request, CancellationToken cancellationToken)
    {
        return Ok(await Sender.Send(request, cancellationToken));
    }
}
