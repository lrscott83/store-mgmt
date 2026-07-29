using Application.Abstractions.Time;

namespace SMCA.WebApi.Services
{
    public class DateTimeProvider : IDateTimeProvider
    {
        public DateTimeOffset UtcNow => TimeProvider.System.GetUtcNow();
    }
}
