namespace Application.Abstractions.Authentication;

public class AuthenticationSettings
{
    public const string SectionName = "Authentication";
    public string Pepper { get; set; } = string.Empty;
    public int Argon2MemoryKib { get; set; } = 0;
    public int Argon2TimeCost { get; set; } = 0;
    public int Argon2Parallelism { get; set; } = 0;
    public int Argon2SaltBytes { get; set; } = 0;
    public int Argon2HashBytes { get; set; } = 0;
    public string JwtSecretKey { get; set; } = string.Empty;
    public string Issuer { get; set; } = string.Empty;
    public string Audience { get; set; } = string.Empty;
    public int TokenLifetimeDays { get; set; } = 35;
    public int RefreshTokenExpirationDays { get; set; } = 7;
}
