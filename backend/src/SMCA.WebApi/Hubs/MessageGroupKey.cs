namespace SMCA.WebApi.Hubs;

/// <summary>
/// Single source of truth for SignalR group names used by owner messaging.
/// </summary>
/// <remarks>
/// <para>
/// The hub joins each authenticated connection to a group named after the
/// user's id, and <c>SignalRMessagePushService</c> pushes to that same group.
/// Both sides MUST derive the key through this helper so they can never drift.
/// </para>
/// <para>
/// The key is the canonical (<c>"D"</c>) <see cref="Guid.ToString()"/> form,
/// lowercase with hyphens. This is exactly the value of the JWT
/// <see cref="System.Security.Claims.ClaimTypes.NameIdentifier"/> claim:
/// <c>JwtProvider</c> mints it as <c>userId.ToString()</c>.
/// </para>
/// <para>
/// Note: it is <b>not</b> the JWT <c>sub</c> claim. <c>JwtProvider</c> writes the
/// claims with <c>ClaimTypes.NameIdentifier</c> and
/// <c>JwtSecurityTokenHandler.WriteToken</c> serializes them under that long URI
/// name, so <c>sub</c> is never present on the wire or in the validated
/// principal — only <c>ClaimTypes.NameIdentifier</c> is.
/// </para>
/// </remarks>
public static class MessageGroupKey
{
    /// <summary>
    /// Group key for a user id. Must match the value of the authenticated
    /// principal's <see cref="System.Security.Claims.ClaimTypes.NameIdentifier"/>
    /// claim.
    /// </summary>
    public static string ForUserId(Guid userId) => userId.ToString();
}
