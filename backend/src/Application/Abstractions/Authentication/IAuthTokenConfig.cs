namespace Application.Abstractions.Authentication
{
    public interface IAuthTokenConfig
    {
        int TokenLifetimeDays { get; }
    }
}