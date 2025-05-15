namespace Application.Abstractions.HttpContext
{
    public interface IHttpContextService
    {
        public string AccessToken { get; }
        public string UserExternalId { get; }
        public string IPAddress { get; }
        public string GfDevice { get; }
        public string GfDeviceId { get; }
        public string GfSessionId { get; }
        public bool IsSuperAdmin { get; }
        public bool IsOwnerAdmin { get; }
        public bool IsReSeller { get; }
        public bool IsSuperAdminOrOwnerAdmin { get; }
        public string TenantId { get; }
        public string StoreId { get; }
        public Task SignOutAsync();
    }
}
