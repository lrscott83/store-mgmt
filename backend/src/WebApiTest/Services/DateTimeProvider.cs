using Application.Abstractions.Time;

namespace WebApiTest.Services
{
    public class DateTimeProvider : IDateTimeProvider
    {
        public DateTimeOffset UtcNow => TimeProvider.System.GetUtcNow();
    }
}
