namespace Application.Dtos.Management.StoreUsers
{
    public sealed class StoreUserDto
    {
        public Guid Id { get; set; }
        public Guid StoreId { get; set; }
        public Guid StoreName { get; set; }
        public required string Login { get; set; }
        public required string FullName { get; set; }
        public string? CellPhone { get; set; }
        public string? Email { get; set; }
        public bool IsActive { get; set; }
    }
}
