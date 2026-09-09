using Domain.Common.Entities;
using Domain.Common.Events;

namespace Domain.Entities.Plans
{
    public sealed class StorePlan : Entity<int>
    {
        public string Name { get; set; }
        public int Order { get; set; }
        public bool IsActive { get; set; } = false;
        public ICollection<StorePlanModule> StorePlanModules { get; set; }

        private StorePlan(int id, string name, int order, bool isActive) : base(id)
        {
            Name = name;
            Order = order;
            IsActive = isActive;
            StorePlanModules = new List<StorePlanModule>();
        }

        public static StorePlan Create(int id, string name, int order, bool isActive)
        {
            var plan = new StorePlan(id, name, order, isActive);
            plan.Raise(new StorePlanCreatedDomainEvent(id));
            return plan;
        }
    }

    public sealed record StorePlanCreatedDomainEvent(int StorePlanId) : IDomainEvent { }
}