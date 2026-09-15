using Domain.Entities.Authentication;

namespace Domain.Interfaces.Repositories;

public interface IRefreshTokenRepository
{
    Task<RefreshToken?> GetByTokenHashAsync(string tokenHash);
    Task<List<RefreshToken>> GetActiveByUserIdAsync(Guid userId);
    Task<List<RefreshToken>> GetActiveByUserIdsAsync(IReadOnlyCollection<Guid> userIds, CancellationToken cancellationToken = default);
    void Add(RefreshToken refreshToken);
    void Update(RefreshToken refreshToken);
    void RemoveRange(IEnumerable<RefreshToken> tokens);
}
