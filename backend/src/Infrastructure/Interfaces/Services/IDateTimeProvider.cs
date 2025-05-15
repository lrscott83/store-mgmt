namespace Infrastructure.Interfaces.Services
{
    public interface IDateTimeProvider
    {
        DateTimeOffset UtcNow { get; }
    }
}
