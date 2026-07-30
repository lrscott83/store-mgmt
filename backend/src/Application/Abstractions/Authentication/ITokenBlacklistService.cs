namespace Application.Abstractions.Authentication
{
    public interface ITokenBlacklistService
    {
        Task<bool> IsBlacklistedAsync(string jti);
        Task BlacklistAsync(string jti, TimeSpan ttl);
    }
}
