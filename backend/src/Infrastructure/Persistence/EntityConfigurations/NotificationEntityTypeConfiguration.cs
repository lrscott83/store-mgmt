using Domain.Entities.Notifications;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Infrastructure.Persistence.EntityConfigurations;

public class NotificationEntityTypeConfiguration : IEntityTypeConfiguration<Notification>
{
    public void Configure(EntityTypeBuilder<Notification> builder)
    {
        builder.ToTable("Notifications");
        builder.HasKey(n => n.Id);

        // Bound the three copied facts: they are rendered verbatim in the bell popover, and an
        // unbounded text column would let a pathological registration store megabytes per notice.
        builder.Property(n => n.OwnerName).IsRequired().HasMaxLength(200);
        builder.Property(n => n.OwnerCellPhone).IsRequired().HasMaxLength(50);
        builder.Property(n => n.StoreName).IsRequired().HasMaxLength(200);

        builder.Property(n => n.CreatedAt).IsRequired();

        // NO FK and NO TenantId here, ON PURPOSE — do not read that as an oversight.
        // A notice is addressed to the CANONICAL SuperAdmin (DataUtils.SuperAdminUser.Id), one global
        // operator who is not a tenant and not a store actor, so there is no owner row and no tenant
        // row to point at. A nullable FK would cascade a global audit trail away every time an
        // unrelated user was purged.
        // The consequence, stated plainly: Notification rows are NOT reachable by
        // CleanupUserAsync / CleanupTenantCascadeAsync / ResetDataAsync, which all walk FKs. A test
        // that seeds notifications therefore owns its own teardown (delete by CreatedAt or by
        // recipient) instead of relying on the shared cleanup services. Production notices are
        // append-only; there is no deletion UI in this slice.
        // If purge coverage is ever wanted, it needs its own explicit repository/cleanup path — it
        // is NOT a missing cascade.

        // The bell's list is always "all notices, newest first" and the badge is always "unread
        // count", so both queries filter/order on these two columns.
        builder.HasIndex(n => n.CreatedAt);
        builder.HasIndex(n => n.ReadAt);
    }
}