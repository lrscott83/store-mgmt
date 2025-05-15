namespace Application.Dtos.UserManagement
{
    public sealed class UserListDto
    {
        public Guid Id { get; set; }
        public string Login { get; set; }
        public string FullName { get; set; }
        public string OwnerName { get; set; }
        public string StoreName { get; set; }
        public IEnumerable<string> RoleNames { get; set; }
        public string? CellPhone { get; set; }
        public string? Email { get; set; }
        public bool IsActive { get; set; }
    }
}
