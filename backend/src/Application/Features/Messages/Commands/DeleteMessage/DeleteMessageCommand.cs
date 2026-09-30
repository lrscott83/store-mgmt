using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.ResponseModels;
using Domain.Common.Extensions;
using Domain.Interfaces.Repositories;

namespace Application.Features.Messages.Commands.DeleteMessage;

public sealed record DeleteMessageCommand(Guid MessageId) : ICommand;

public class DeleteMessageCommandHandler : ICommandHandler<DeleteMessageCommand>

{
    private readonly IHttpContextService _httpContextService;
    private readonly IMessageRepository _messageRepository;

    public DeleteMessageCommandHandler(IHttpContextService httpContextService, IMessageRepository messageRepository)
    {
        _httpContextService = httpContextService;
        _messageRepository = messageRepository;
    }

    public async Task<ResponseResult> Handle(DeleteMessageCommand command, CancellationToken cancellationToken)
    {
        var currentUserId = _httpContextService.UserExternalId.ToGuid();

        var message = await _messageRepository.GetMessageAsync(command.MessageId, cancellationToken);

        if (message == null)
            throw new ArgumentException("Message not found");

        if (message.SenderId != currentUserId && message.RecipientId != currentUserId)
            throw new UnauthorizedAccessException();

        message.SoftDelete(currentUserId);
        await _messageRepository.AddMessageAsync(message, cancellationToken);

        return ResponseResult.Success(true);
    }
}
