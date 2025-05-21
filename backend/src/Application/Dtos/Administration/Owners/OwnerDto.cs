namespace Application.Dtos.Administration.Owners
{
    public sealed class OwnerDto
    {
        public Guid Id { get; set; }
        public Guid UserId { get; set; }
        public string Login { get; set; }
        public string FullName { get; set; }
        public string CellPhone { get; set; }
        public string? Email { get; set; }
        public string? Description { get; set; }
        public bool Guest { get; set; }
        public List<OwnerStoreModuleDto> StoreModules { get; set; } = new List<OwnerStoreModuleDto>();
        public string ReSellerName { get; set; }
        public bool IsActive { get; set; }

    }
}
