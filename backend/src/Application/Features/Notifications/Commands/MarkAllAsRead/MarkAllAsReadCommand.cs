using Application.Abstractions.Messaging;
using Application.ResponseModels;
using Domain.Interfaces.Repositories;

namespace Application.Features.Notifications.Commands.MarkAllAsRead;

public sealed record MarkAllAsReadCommand : ICommand;

public class MarkAllAsReadCommandHandler : ICommandHandler<MarkAllAsReadCommand>
{
    private readonly INotificationRepository _notificationRepository;

    public MarkAllAsReadCommandHandler(INotificationRepository notificationRepository)
    {
        _notificationRepository = notificationRepository;
    }

    public async Task<ResponseResult> Handle(MarkAllAsReadCommand command, CancellationToken cancellationToken)
    {
        // A single bulk UPDATE, not a loop of per-row saves: the bell's "mark all as read" acts on
        // an unknown count of rows and each extra round trip is pure latency on a background
        // action the user is not watching.
        int flipped = await _notificationRepository.MarkAllAsReadAsync(cancellationToken);

        return ResponseResult.Success(flipped);
    }
}