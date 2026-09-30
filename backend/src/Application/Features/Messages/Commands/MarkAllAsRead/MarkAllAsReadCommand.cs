using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.ResponseModels;
using Domain.Common.Extensions;
using Domain.Interfaces.Repositories;

namespace Application.Features.Messages.Commands.MarkAllAsRead;

public sealed record MarkAllAsReadCommand : ICommand;

public class MarkAllAsReadCommandHandler : ICommandHandler<MarkAllAsReadCommand>

{
    private readonly IHttpContextService _httpContextService;
    private readonly IMessageRepository _messageRepository;

    public MarkAllAsReadCommandHandler(IHttpContextService httpContextService, IMessageRepository messageRepository)
    {
        _httpContextService = httpContextService;
        _messageRepository = messageRepository;
    }

    public async Task<ResponseResult> Handle(MarkAllAsReadCommand command, CancellationToken cancellationToken)
    {
        var currentUserId = _httpContextService.UserExternalId.ToGuid();

        var unreadMessages = await _messageRepository.GetUnreadMessagesAsync(currentUserId, cancellationToken);

        foreach (var message in unreadMessages)
        {
            message.MarkAsRead();
            await _messageRepository.AddMessageAsync(message, cancellationToken);
        }

        return ResponseResult.Success(true);
    }
}
