using Domain.Common.Entities;
using Infrastructure.Persistence.Outbox;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Newtonsoft.Json;

namespace Infrastructure.Persistence.Interceptors
{
    internal sealed class OutboxMessagesInterceptor : SaveChangesInterceptor
    {
        private static readonly JsonSerializerSettings SerializerSettings = new()
        {
            TypeNameHandling = TypeNameHandling.All,
        };

        public async override ValueTask<InterceptionResult<int>> SavingChangesAsync(
            DbContextEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default)
        {
            if (eventData.Context is not null) 
            {
                InsertOutboxMessages(eventData.Context);
            }

            return await base.SavingChangesAsync(eventData, result, cancellationToken);
        }

        private void InsertOutboxMessages(DbContext context)
        {
            List<OutboxMessage> outboxMessages = context.ChangeTracker
                .Entries<IEntity>()
                .Select(entry => entry.Entity)
                .SelectMany(entity =>
                {
                    var domainEvents = entity.GetDomainEvents();
                    entity.ClearDomainEvents();
                    return domainEvents;
                })
                .Select(domainEvent => new OutboxMessage(
                    Guid.NewGuid(),
                    domainEvent.GetType().Name,
                    JsonConvert.SerializeObject(domainEvent, SerializerSettings),
                    TimeProvider.System.GetUtcNow()))
                .ToList();

            context.Set<OutboxMessage>().AddRange(outboxMessages);
        }
    }
}
