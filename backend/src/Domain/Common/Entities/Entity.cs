using Domain.Common.Events;

namespace Domain.Common.Entities
{
    public abstract class Entity : IEntity
    {
        private readonly List<IDomainEvent> _domainEvents = new();
        protected Entity()
        {

        }
        public void ClearDomainEvents()
        {
            _domainEvents.Clear();
        }

        public IReadOnlyCollection<IDomainEvent> GetDomainEvents()
        {
            return _domainEvents.ToList();
        }

        protected void Raise(IDomainEvent domainEvent) { _domainEvents.Add(domainEvent); }
    }
    public abstract class Entity<TId> : Entity
    {
        protected Entity(TId id)
        {
            Id = id;
        }

        public TId Id { get; init; }

        
    }
}
