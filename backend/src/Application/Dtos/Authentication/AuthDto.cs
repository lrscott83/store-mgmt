namespace Application.Dtos.Authentication
{
    public sealed record AuthDto(
        string Login,
        string AuthToken,
        DateTime ExpiresIn,
        string? RefreshToken = null,
        DateTimeOffset? RefreshTokenExpiresAt = null)
    {
    }
}
