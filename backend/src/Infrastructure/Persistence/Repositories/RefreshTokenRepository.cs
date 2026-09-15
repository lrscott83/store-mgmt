using Domain.Entities.Authentication;
using Domain.Interfaces.Repositories;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Persistence.Repositories;

public sealed class RefreshTokenRepository : IRefreshTokenRepository
{    private readonly ApplicationDbContext _dbContext;

    public RefreshTokenRepository(ApplicationDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<RefreshToken?> GetByTokenHashAsync(string tokenHash)
    {
        return await _dbContext.Set<RefreshToken>()
            .FirstOrDefaultAsync(rt => rt.TokenHash == tokenHash);
    }

    public async Task<List<RefreshToken>> GetActiveByUserIdAsync(Guid userId)
    {
        return await _dbContext.Set<RefreshToken>()
            .Where(rt => rt.UserId == userId && rt.IsActive)
            .ToListAsync();
    }

    public async Task<List<RefreshToken>> GetActiveByUserIdsAsync(IReadOnlyCollection<Guid> userIds, CancellationToken cancellationToken = default)
    {
        // Bulk variant for the store-deactivation revocation pass: one query for
        // the whole affected set (the RevokeCommand per-user loop generalized).
        // NOTE: the predicate spells out IsActive in mapped columns
        // (RevokedAt/ExpiresAt) — the computed `rt.IsActive` member is unmapped and
        // EF cannot translate it (GetActiveByUserIdAsync carries that latent bug).
        if (userIds.Count == 0)
            return new List<RefreshToken>();

        var now = DateTimeOffset.UtcNow;
        return await _dbContext.Set<RefreshToken>()
            .Where(rt => userIds.Contains(rt.UserId)
                && rt.RevokedAt == null
                && rt.ExpiresAt > now)
            .ToListAsync(cancellationToken);
    }

    public void Add(RefreshToken refreshToken)
    {
        _dbContext.Set<RefreshToken>().Add(refreshToken);
    }

    public void Update(RefreshToken refreshToken)
    {
        _dbContext.Entry(refreshToken).State = EntityState.Modified;
    }

    public void RemoveRange(IEnumerable<RefreshToken> tokens)
    {
        _dbContext.Set<RefreshToken>().RemoveRange(tokens);
    }
}
