using System;


namespace Domain.Common.Entities
{
    public interface ITenantBaseEntity
    {
        Guid TenantId { get; }
    }
}
