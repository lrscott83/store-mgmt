using Application.Abstractions.Messaging;
using Application.ResponseModels;
using Domain.Entities.Notifications;
using Domain.Interfaces.Repositories;

namespace Application.Features.Notifications.Commands.MarkAsRead;

public sealed record MarkAsReadCommand(Guid NotificationId) : ICommand;

public class MarkAsReadCommandHandler : ICommandHandler<MarkAsReadCommand>
{
    private readonly INotificationRepository _notificationRepository;

    public MarkAsReadCommandHandler(INotificationRepository notificationRepository)
    {
        _notificationRepository = notificationRepository;
    }

    public async Task<ResponseResult> Handle(MarkAsReadCommand command, CancellationToken cancellationToken)
    {
        bool flipped = await _notificationRepository.MarkAsReadAsync(command.NotificationId, cancellationToken);

        // Answering Succeeded:true for an unknown id would make the badge drop without the row ever
        // changing, which the client cannot tell apart from a genuine success. Marking an
        // already-read notice is NOT an error: it is simply a no-op the client retries freely.
        return flipped
            ? ResponseResult.Success(true)
            : ResponseResult.Failure<bool>(
                new Domain.Common.Results.Error("Notification.NotFound", "Notification not found."), 404);
    }
}