namespace Application.Abstractions.Authentication
{
    public interface IJwtProvider
    {
        string GenerateToken(Guid userId, string userLogin);
        string GenerateToken(Guid userId, string userLogin, DateTime expiresAt);
        string GenerateRefreshToken();
    }
}
