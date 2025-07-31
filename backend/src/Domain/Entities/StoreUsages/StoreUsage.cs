using Domain.Common.Entities;
using Domain.Common.Events;
using Domain.Entities.Stores;
using Domain.Entities.Users;

namespace Domain.Entities.StoreUsages
{
    public sealed class StoreUsage : Entity<Guid>
    {
        public Store Store { get; set; }
        public Guid StoreId { get; set; }
        public User User { get; set; }
        public Guid UserId { get; set; }
        public DateTime Day { get; set; }
        public string IpAddress { get; set; }
        public string GfDevice { get; set; }
        public string GfDeviceId { get; set; }
        public string GfSessionId { get; set; }

        private StoreUsage(Guid id, Guid storeId, Guid userId, DateTime day, string ipAddress, string gfDevice, string gfDeviceId, string gfSessionId) : base(id)
        {
            Id = id;
            StoreId = storeId;
            UserId = userId;
            Day = day;
            IpAddress = ipAddress;
            GfDevice = gfDevice;
            GfDeviceId = gfDeviceId;
            GfSessionId = gfSessionId;
        }

        public static StoreUsage Create(Guid storeId, Guid userId, DateTime day, string ipAddress, string gfDevice, string gfDeviceId, string gfSessionId)
        {
            var module = new StoreUsage(Guid.NewGuid(), storeId, userId, day, ipAddress, gfDevice, gfDeviceId, gfSessionId);
            module.Raise(new FeatureCreatedDomainEvent(storeId, userId, day));
            return module;
        }
    }

    public sealed record FeatureCreatedDomainEvent(Guid StoreId, Guid UserId, DateTime Day) : IDomainEvent { }
}
