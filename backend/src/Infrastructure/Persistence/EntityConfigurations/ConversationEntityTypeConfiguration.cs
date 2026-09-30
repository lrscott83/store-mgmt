using Domain.Entities.Messages;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Infrastructure.Persistence.EntityConfigurations;

public class ConversationEntityTypeConfiguration : IEntityTypeConfiguration<Conversation>
{
    public void Configure(EntityTypeBuilder<Conversation> builder)
    {
        builder.ToTable("Conversations");
        builder.HasKey(c => c.Id);
        builder.HasIndex(c => c.OwnerId);
        builder.HasIndex(c => c.StoreId);
        builder.HasIndex(c => new { c.OwnerId, c.StoreId }).IsUnique();
    }
}
