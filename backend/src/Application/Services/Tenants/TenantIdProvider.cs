using Domain.Interfaces.Repositories;
using Microsoft.AspNetCore.Http;

namespace Application.Services.Tenants
{
    public sealed class TenantIdProvider
    {
        private const string TenantIdHeaderName = "X-TenantId";

        private readonly IHttpContextAccessor _httpContextAccessor;
        public TenantIdProvider(IHttpContextAccessor httpContextAccessor)
        {
            _httpContextAccessor = httpContextAccessor;
        }

        public Guid? GetTenantId()
        {
            var tenantIdHeader = _httpContextAccessor.HttpContext?
                .Request
                .Headers[TenantIdHeaderName];

            if (!tenantIdHeader.HasValue)
                return null;
            
            Guid.TryParse(tenantIdHeader.Value, out Guid tenantId);
            return tenantId;
        }
    }
}
