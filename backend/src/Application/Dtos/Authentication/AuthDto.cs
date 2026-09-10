namespace Application.Dtos.Authentication
{
    /// <summary>
    /// One store's DEK wrapped under the user's password pre-hash — the per-store
    /// sibling of AuthDto's top-level <c>WrappedDek</c>/<c>WrapSalt</c>/<c>WrapIv</c>
    /// (same wrap format, <c>StoreKeyWrapService.WrapDek</c>, byte-compatible with the
    /// offline roster's per-user wrap). The login response carries one entry per store
    /// the user can switch to, so the frontend can provision a per-store device wrap
    /// table at login and later switch stores in-session (no logout, no password).
    /// </summary>
    public sealed record StoreDekWrapDto(
        string StoreId,
        string WrappedDek,
        string WrapSalt,
        string WrapIv)
    {
    }

    /// <summary>
    /// Login/Register/Refresh response. <c>WrappedDek</c>/<c>WrapSalt</c>/<c>WrapIv</c> carry the
    /// store DEK wrapped with the user's decrypted offline password pre-hash (roster-compatible,
    /// see OfflineRosterUserDto). Only the login path populates them; Register/Refresh leave them
    /// empty (default <c>""</c>). <c>StoreDekWraps</c> (login path only) carries the same wrap for
    /// EVERY store the user can switch to; <c>null</c>/empty means "not available" and degrades
    /// switching to the legacy logout flow — it never fails the login.
    /// </summary>
    public sealed record AuthDto(
        string Login,
        string AuthToken,
        DateTime ExpiresIn,
        string? RefreshToken = null,
        DateTimeOffset? RefreshTokenExpiresAt = null,
        string WrappedDek = "",
        string WrapSalt = "",
        string WrapIv = "",
        List<StoreDekWrapDto>? StoreDekWraps = null)
    {
    }
}
