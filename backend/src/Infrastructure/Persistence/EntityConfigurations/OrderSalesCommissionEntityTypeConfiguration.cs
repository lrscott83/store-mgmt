using Domain.Entities.OrderSalesCommissions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Infrastructure.Persistence.EntityConfigurations
{
    /// <summary>
    /// Comisión por línea de pedido. `OrderItemId` es ÚNICO: la idempotencia de la generación
    /// vive en la base, no en un read-then-write del handler. `ON DELETE RESTRICT` en todos los
    /// bordes: es un registro financiero y no debe desaparecer con el pedido o el gestor.
    /// </summary>
    internal sealed class OrderSalesCommissionEntityTypeConfiguration
        : IEntityTypeConfiguration<OrderSalesCommission>
    {
        private readonly ApplicationDbContext _context;

        public OrderSalesCommissionEntityTypeConfiguration(ApplicationDbContext context)
        {
            _context = context;
        }

        public void Configure(EntityTypeBuilder<OrderSalesCommission> builder)
        {
            builder.ToTable("OrderSalesCommission");
            builder.HasQueryFilter(x => _context.IsSuperAdmin || x.TenantId == _context.TenantId);

            builder.HasKey(x => x.Id);
            builder.HasIndex(x => x.TenantId);
            builder.HasIndex(x => x.OrderId);
            builder.HasIndex(x => x.OrderItemId).IsUnique();
            builder.HasIndex(x => x.SalesManagerId);
            builder.HasIndex(x => x.OwnerId);
            builder.HasIndex(x => x.StoreId);
            builder.HasIndex(x => x.Status);

            builder.Property(x => x.Type).IsRequired();
            builder.Property(x => x.Currency).IsRequired();
            builder.Property(x => x.Status).IsRequired();

            // Precio y monto son dinero de la línea: 2 decimales, como el total del pedido.
            builder.Property(x => x.UnitPrice).HasColumnType("decimal(18,2)");
            builder.Property(x => x.Amount).HasColumnType("decimal(18,2)");
            builder.Property(x => x.PaymentNote).HasMaxLength(500);

            builder.HasOne(x => x.Order)
                .WithMany()
                .HasForeignKey(x => x.OrderId)
                .OnDelete(DeleteBehavior.Restrict);

            builder.HasOne(x => x.OrderItem)
                .WithMany()
                .HasForeignKey(x => x.OrderItemId)
                .OnDelete(DeleteBehavior.Restrict);

            builder.HasOne(x => x.SalesManager)
                .WithMany()
                .HasForeignKey(x => x.SalesManagerId)
                .OnDelete(DeleteBehavior.Restrict);

            builder.HasOne(x => x.Owner)
                .WithMany()
                .HasForeignKey(x => x.OwnerId)
                .OnDelete(DeleteBehavior.Restrict);

            builder.HasOne(x => x.Store)
                .WithMany()
                .HasForeignKey(x => x.StoreId)
                .OnDelete(DeleteBehavior.Restrict);

            builder.HasOne(x => x.PaidByUser)
                .WithMany()
                .HasForeignKey(x => x.PaidByUserId)
                .OnDelete(DeleteBehavior.Restrict);
        }
    }
}
