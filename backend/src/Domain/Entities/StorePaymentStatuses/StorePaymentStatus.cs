using Domain.Common.Entities;
using Domain.Common.Events;
using Domain.Entities.StorePayments;

namespace Domain.Entities.StorePaymentStatuses
{
    public sealed class StorePaymentStatus : Entity<int>
    {
        public string Name { get; set; }
        public ICollection<StorePayment> StorePayments { get; set; }

        private StorePaymentStatus(int id, string name)
            : base(id)
        {
            Name = name;
            StorePayments = new List<StorePayment>();
        }

        public static StorePaymentStatus Create(int id, string name)
        {
            var role = new StorePaymentStatus(id, name);
            role.Raise(new StorePaymentStatusCreatedDomainEvent(role.Id));
            return role;
        }
    }

    public sealed record StorePaymentStatusCreatedDomainEvent(int StorePaymentStatusId) : IDomainEvent;
}
