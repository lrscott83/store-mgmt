using Application.Abstractions.HttpContext;
using Domain.Common.Constants;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.BearerToken;
using System.Security.Claims;

namespace SMCA.WebApi.Services
{
    public class HttpContextService : IHttpContextService
    {
        private readonly IHttpContextAccessor _httpContextAccessor;
        private const string GfDeviceHeaderKey = "Gf-Device";
        private const string GfDeviceIdHeaderKey = "Gf-DeviceId";
        private const string GfSessionIdHeaderKey = "Gf-SessionId";

        public HttpContextService(IHttpContextAccessor httpContextAccessor)
        {
            _httpContextAccessor = httpContextAccessor;
        }

        public string AccessToken
        {
            get
            {
                {
                    string auth = _httpContextAccessor.HttpContext?.Request?.Headers?["Authorization"];

                    /*Bearer token*/
                    var key = "Bearer ";
                    var keyLength = key.Length;
                    var accessToken = auth.Substring(keyLength, auth.Length - keyLength);
                    return accessToken;
                }
            }
        }

        public string UserExternalId => _httpContextAccessor
            .HttpContext?.User?
            .FindFirstValue(ClaimTypes.NameIdentifier);

        public string GfDevice => GetHeaderValue(GfDeviceHeaderKey);
        public string GfDeviceId => GetHeaderValue(GfDeviceIdHeaderKey);
        public string GfSessionId => GetHeaderValue(GfSessionIdHeaderKey);
        public string IPAddress => GenerateIPAddress();

        public bool IsSuperAdmin => GetClaimValue(StringValueUtils.SuperAdminClaim) == "true";
        public bool IsOwnerAdmin => GetClaimValue(StringValueUtils.AdminClaim) == "true";
        public string TenantId => GetClaimValue(StringValueUtils.TenantIdClaim);
        public string StoreId => GetClaimValue(StringValueUtils.StoreIdClaim);

        public bool IsSuperAdminOrOwnerAdmin => IsSuperAdmin || IsOwnerAdmin;

        public bool IsReSeller => GetClaimValue(StringValueUtils.ReSellerClaim) == "true";

        private string GetHeaderValue(string headerKey)
        {
            var request = _httpContextAccessor.HttpContext.Request;
            if (request.Headers.ContainsKey(headerKey))
                return request.Headers[headerKey];
            else return null;
        }

        private string GenerateIPAddress()
        {
            var request = _httpContextAccessor.HttpContext.Request;
            if (request.Headers.ContainsKey("X-Forwarded-For"))
                return request.Headers["X-Forwarded-For"];
            else
                return _httpContextAccessor.HttpContext.Connection.RemoteIpAddress.MapToIPv4().ToString();
        }

        private string GetClaimValue(string claimType)
        {
            var claim = _httpContextAccessor.HttpContext?.User?.Claims?.FirstOrDefault(c => c.Type == claimType);
            if (claim != null)
                return claim.Value;
            else return null;
        }

        public Task SignOutAsync()
        {
            //await _httpContextAccessor.HttpContext?.SignOutAsync(BearerTokenDefaults.AuthenticationScheme);
            //_httpContextAccessor.HttpContext?.Session.Clear();
            _httpContextAccessor.HttpContext?.Response?.Headers?.Remove("Authorization");
            return Task.CompletedTask;
        }
    }
}
