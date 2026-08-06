using Domain.Common.Entities;
using Domain.Common.Events;
using Domain.Entities.Owners;
using Domain.Entities.ReSellers;
using Domain.Entities.Stores;
using Domain.Entities.StoreUsages;
using Domain.Entities.StoreUsers;
using Domain.Entities.UserRoles;

namespace Domain.Entities.Users
{
    public sealed class User : AuditableEntity<Guid>, ITenantBaseEntity
    {
        public string Login { get; set; }
        public string Password { get; set; }
        public string? OfflinePasswordPreHash { get; set; }
        public string FullName { get; set; }
        public string? CellPhone { get; set; }
        public string? Email { get; set; }
        public ICollection<UserRole> UserRoles { get; set; }
        public ICollection<StoreUsage> StoreUsages { get; set; } = new List<StoreUsage>();
        public Owner? Owner { get; set; }
        public ReSeller? ReSeller { get; set; }
        public StoreUser? StoreUser { get; set; }
        public Guid SelectedStoreId { get; set; }
        public Guid TenantId { get; private set; }

        private User(Guid id, string login, string password, string fullName,
            string? cellPhone, string? email, Guid tenantId) : base(id)
        {
            Login = login;
            Password = password;
            FullName = fullName;
            CellPhone = cellPhone;
            Email = email;
            TenantId = tenantId;
        }

        public void SetTenantId(Guid tenantId)
        {
            TenantId = tenantId;
        }

        public static User Create(Guid id, string login, string password, string fullName,
            string? cellPhone, string? email, Guid tenantId)
        {
            User user = new User(id, login, password, fullName, cellPhone, email, tenantId);
            user.Raise(new UserCreatedDomainEvent(user.Id));
            return user;
        }

        public static User Create(string login, string password, string fullName,
            string? cellPhone, string? email, Guid tenantId)
        {
            return Create(Guid.NewGuid(), login, password, fullName, cellPhone, email, tenantId);
        }
    }

    public sealed record UserCreatedDomainEvent(Guid userId) : IDomainEvent;
}
