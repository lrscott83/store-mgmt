using Infrastructure.Interfaces.Services;

namespace SMCA.WebApi.Services
{
    public class DateTimeProvider : IDateTimeProvider
    {
        public DateTimeOffset UtcNow => TimeProvider.System.GetUtcNow();
    }
}
