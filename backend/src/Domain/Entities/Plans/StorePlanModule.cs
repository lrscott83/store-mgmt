using Domain.Common.Entities;
using Domain.Common.Events;
using Domain.Entities.Modules;

namespace Domain.Entities.Plans
{
    public sealed class StorePlanModule : Entity
    {
        public int PlanId { get; set; }
        public StorePlan StorePlan { get; set; } = null!;
        public int ModuleId { get; set; }
        public Module Module { get; set; } = null!;

        private StorePlanModule(int planId, int moduleId)
        {
            PlanId = planId;
            ModuleId = moduleId;
        }

        public static StorePlanModule Create(int planId, int moduleId)
        {
            var storePlanModule = new StorePlanModule(planId, moduleId);
            storePlanModule.Raise(new StorePlanModuleCreatedDomainEvent(planId, moduleId));
            return storePlanModule;
        }
    }

    public sealed record StorePlanModuleCreatedDomainEvent(int PlanId, int ModuleId) : IDomainEvent { }
}