using Domain.Entities.Tenants;
using Infrastructure.Persistence.Contexts;
using Infrastructure.Persistence.Outbox;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Infrastructure.Persistence.EntityConfigurations
{
    internal class OutboxMessageEntityTypeConfiguration : IEntityTypeConfiguration<OutboxMessage>
    {
        private readonly ApplicationDbContext _context;
        public OutboxMessageEntityTypeConfiguration(ApplicationDbContext context)
        {
            _context = context;
        }

        public void Configure(EntityTypeBuilder<OutboxMessage> builder)
        {
            // below line must be added to all entities to protect the data of every tenant (client)
            // Global admins should be able to see data from all tenants
            //builder.HasQueryFilter(x => (_context.IsGlobalAdmin || x.Id == _context.TenantId));

            builder.HasKey(x => x.Id);
        }
    }
}