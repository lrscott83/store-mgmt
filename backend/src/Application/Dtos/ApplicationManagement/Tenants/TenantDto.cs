namespace Application.Dtos.ApplicationManagement.Tenants
{
    public sealed class TenantDto 
    {
        public Guid Id { get; set; }
        public string Name { get; set; }
        public string Description { get; set; }
        public string? ConnectionString { get; set; }
        public bool IsActive { get; set; }
     }
}
