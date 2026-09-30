using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.ResponseModels;
using Domain.Common.Extensions;
using Domain.Interfaces.Repositories;

namespace Application.Features.Messages.Commands.DeleteAllMessages;

public sealed record DeleteAllMessagesCommand : ICommand;

public class DeleteAllMessagesCommandHandler : ICommandHandler<DeleteAllMessagesCommand>

{
    private readonly IHttpContextService _httpContextService;
    private readonly IMessageRepository _messageRepository;

    public DeleteAllMessagesCommandHandler(IHttpContextService httpContextService, IMessageRepository messageRepository)
    {
        _httpContextService = httpContextService;
        _messageRepository = messageRepository;
    }

    public async Task<ResponseResult> Handle(DeleteAllMessagesCommand command, CancellationToken cancellationToken)
    {
        var currentUserId = _httpContextService.UserExternalId.ToGuid();

        var messages = await _messageRepository.GetMessagesForUserAsync(currentUserId, cancellationToken);

        foreach (var message in messages)
        {
            message.SoftDelete(currentUserId);
            await _messageRepository.AddMessageAsync(message, cancellationToken);
        }

        return ResponseResult.Success(true);
    }
}
