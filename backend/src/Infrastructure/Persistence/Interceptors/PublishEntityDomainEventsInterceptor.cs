using Domain.Common.Entities;
using Domain.Common.Events;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace Infrastructure.Persistence.Interceptors
{
    internal sealed class PublishEntityDomainEventsInterceptor : SaveChangesInterceptor
    {
        private readonly IPublisher _publisher;
        public PublishEntityDomainEventsInterceptor(IPublisher publisher)
        {
            _publisher = publisher;
        }

        public override async ValueTask<int> SavedChangesAsync(
            SaveChangesCompletedEventData eventData, int result, CancellationToken cancellationToken = default)
        {
            if (eventData.Context is not null)
                await PublishEntityDomainEvents(eventData.Context);

            return await base.SavedChangesAsync(eventData, result, cancellationToken);
        }

        private async Task PublishEntityDomainEvents(DbContext context)
        {
            List<IDomainEvent> domainEvents = context.ChangeTracker
                .Entries<IEntity>()
                .Select(entry => entry.Entity)
                .SelectMany(entity =>
                {
                    var domainEvents = entity.GetDomainEvents();
                    entity.ClearDomainEvents();
                    return domainEvents;
                })
                .ToList();

            foreach (var domainEvent in domainEvents)
            {
                await _publisher.Publish(domainEvent);
            }
        }
    }
}
