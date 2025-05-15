using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.EntityFrameworkCore;
using Infrastructure.Persistence.Contexts;
using Domain.Common.Extensions;
using Domain.Entities.StorePaymentStatuses;
using Domain.Common.Enums;

namespace Infrastructure.Persistence.EntityConfigurations
{
    internal sealed class StorePaymentStatusEntityTypeConfiguration : IEntityTypeConfiguration<StorePaymentStatus>
    {
        private readonly ApplicationDbContext _context;
        public StorePaymentStatusEntityTypeConfiguration(ApplicationDbContext context)
        {
            _context = context;
        }

        public void Configure(EntityTypeBuilder<StorePaymentStatus> builder) 
        { 

            builder.HasKey(x => x.Id);

            builder.HasMany(c => c.StorePayments)
             .WithOne(e => e.StorePaymentStatus)
             .HasForeignKey(e => e.StorePaymentStatusId)
             .OnDelete(DeleteBehavior.Restrict);

            builder.HasData(
                StorePaymentStatus.Create((int)StorePaymentStatusType.Created, StorePaymentStatusType.Created.GetDisplayName()));

            builder.HasData(
                StorePaymentStatus.Create((int)StorePaymentStatusType.Notified, StorePaymentStatusType.Notified.GetDisplayName()));

            builder.HasData(
                StorePaymentStatus.Create((int)StorePaymentStatusType.Invoiced, StorePaymentStatusType.Invoiced.GetDisplayName()));

            builder.HasData(
                StorePaymentStatus.Create((int)StorePaymentStatusType.Approved, StorePaymentStatusType.Approved.GetDisplayName()));

            builder.HasData(
                StorePaymentStatus.Create((int)StorePaymentStatusType.Paid, StorePaymentStatusType.Paid.GetDisplayName()));
        }
    }
}
