namespace Application.Dtos.Authentication
{
    public sealed record AuthDto(string Login, string AuthToken, string RefreshToken, DateTime ExpiresIn)
    {
    }
}
