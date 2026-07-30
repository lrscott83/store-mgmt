using Domain.Entities.Authentication;
using Domain.Interfaces.Repositories;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Persistence.Repositories;

internal sealed class RefreshTokenRepository : IRefreshTokenRepository
{
    private readonly ApplicationDbContext _dbContext;

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
