using Domain.Common.Entities;
using Domain.Common.Events;

namespace Domain.Entities.SystemConfigurations
{
    public sealed class SystemConfiguration : Entity<int>
    {
        public string Name { get; set; }
        public string Value { get; set; }
        private SystemConfiguration(int id, string name, string value)
            : base(id)
        {
            Name = name;
            Value = value;
        }

        public static SystemConfiguration Create(int id, string name, string value)
        {
            var configuration = new SystemConfiguration(id, name, value);
            configuration.Raise(new SystemConfigurationCreatedDomainEvent(configuration.Id));
            return configuration;
        }
    }

    public sealed record SystemConfigurationCreatedDomainEvent(int SystemConfigurationId) : IDomainEvent;
}
