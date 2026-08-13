namespace Application.Dtos.Authentication
{
    /// <summary>
    /// Login/Register/Refresh response. <c>WrappedDek</c>/<c>WrapSalt</c>/<c>WrapIv</c> carry the
    /// store DEK wrapped with the user's decrypted offline password pre-hash (roster-compatible,
    /// see OfflineRosterUserDto). Only the login path populates them; Register/Refresh leave them
    /// empty (default <c>""</c>).
    /// </summary>
    public sealed record AuthDto(
        string Login,
        string AuthToken,
        DateTime ExpiresIn,
        string? RefreshToken = null,
        DateTimeOffset? RefreshTokenExpiresAt = null,
        string WrappedDek = "",
        string WrapSalt = "",
        string WrapIv = "")
    {
    }
}
