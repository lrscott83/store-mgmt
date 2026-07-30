using Domain.Entities.Authentication;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Infrastructure.Persistence.EntityConfigurations;

internal sealed class RefreshTokenEntityTypeConfiguration : IEntityTypeConfiguration<RefreshToken>
{
    private readonly ApplicationDbContext _context;

    public RefreshTokenEntityTypeConfiguration(ApplicationDbContext context)
    {
        _context = context;
    }

    public void Configure(EntityTypeBuilder<RefreshToken> builder)
    {
        builder.ToTable("RefreshTokens");

        builder.HasKey(x => x.Id);

        builder.Property(x => x.Token)
            .HasMaxLength(500)
            .IsRequired();

        builder.Property(x => x.TokenHash)
            .HasMaxLength(500)
            .IsRequired();

        builder.Property(x => x.UserId)
            .IsRequired();

        builder.Property(x => x.ExpiresAt)
            .IsRequired();

        builder.Property(x => x.CreatedAt)
            .IsRequired();

        builder.Property(x => x.RevokedAt)
            .IsRequired(false);

        builder.Property(x => x.ReplacedByToken)
            .HasMaxLength(500)
            .IsRequired(false);

        builder.HasIndex(x => x.TokenHash)
            .IsUnique()
            .HasDatabaseName("IX_RefreshTokens_TokenHash");

        builder.HasIndex(x => x.UserId)
            .HasDatabaseName("IX_RefreshTokens_UserId");
    }
}
