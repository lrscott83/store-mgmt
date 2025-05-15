namespace Infrastructure.Persistence.Outbox
{
    internal sealed record OutboxMessage(
        Guid Id,
        string Name,
        string Content,
        DateTimeOffset CreatedOnUtc,
        DateTimeOffset? ProcessedOnUtc = null,
        string? Error = null)
    {
    }
}
