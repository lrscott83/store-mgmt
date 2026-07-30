using Application.Abstractions.Authentication;
using Microsoft.Extensions.Caching.Memory;

namespace SMCA.WebApi.Services
{
    internal sealed class TokenBlacklistService : ITokenBlacklistService
    {
        private readonly IMemoryCache _cache;
        public TokenBlacklistService(IMemoryCache cache) => _cache = cache;

        public Task<bool> IsBlacklistedAsync(string jti)
        {
            return Task.FromResult(_cache.TryGetValue(jti, out _));
        }

        public Task BlacklistAsync(string jti, TimeSpan ttl)
        {
            _cache.Set(jti, true, ttl);
            return Task.CompletedTask;
        }
    }
}
