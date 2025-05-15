using Infrastructure.Interfaces.Services;

namespace WebApiTest.Services
{
    public class DateTimeProvider : IDateTimeProvider
    {
        public DateTimeOffset UtcNow => TimeProvider.System.GetUtcNow();
    }
}
