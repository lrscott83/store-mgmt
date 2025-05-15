using Domain.Common.Entities;
using Domain.Common.Events;
using Domain.Entities.Modules;
using Domain.Entities.StoreRoleFeatures;
using Domain.Entities.StoreModules;

namespace Domain.Entities.Features
{
    public sealed class Feature : Entity<int>
    {
        public string Name { get; set; }
        public string Description { get; set; }
        public int ModuleId { get; set; }
        public Module Module { get; set; } = null!;
        public bool IsActive { get; set; } = false;
        public int Order { get; set; }
        public bool AvailableToStore { get; set; } = false;
        public ICollection<StoreRoleFeature> StoreRoleFeatures { get; set; }

        private Feature(int id, int moduleId, string name, string description, int order, bool availableToStore, bool isActive) : base(id)
        {
            Id = id;
            ModuleId = moduleId;
            Name = name;
            Description = description;
            Order = order;
            IsActive = isActive;
            AvailableToStore = availableToStore;
        }

        public static Feature Create(int id, string name, string description, int moduleId, int order, bool availableToStore, bool isActive)
        {
            var module = new Feature(id, moduleId, name, description, order, availableToStore, isActive);
            module.Raise(new FeatureCreatedDomainEvent(id));
            return module;
        }
    }

    public sealed record FeatureCreatedDomainEvent(int FeatureId) : IDomainEvent { }
}
