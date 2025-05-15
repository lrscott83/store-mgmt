using Domain.Common.Events;

namespace Domain.Common.Entities
{
    public interface IEntity
    {
        IReadOnlyCollection<IDomainEvent> GetDomainEvents();
        void ClearDomainEvents();
    }
}