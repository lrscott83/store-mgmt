using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.EntityFrameworkCore;
using Infrastructure.Persistence.Contexts;
using Domain.Entities.ProductCategories;
using Domain.Entities.Orders;

namespace Infrastructure.Persistence.EntityConfigurations
{
    internal sealed class OrderEntityTypeConfiguration : IEntityTypeConfiguration<Order>
    {
        private readonly ApplicationDbContext _context;
        public OrderEntityTypeConfiguration(ApplicationDbContext context)
        {
            _context = context;
        }

        public void Configure(EntityTypeBuilder<Order> builder)
        {
            builder.HasQueryFilter(x => _context.IsSuperAdmin || x.TenantId == _context.TenantId);
            builder.HasIndex(x => x.TenantId);
            builder.HasIndex(x => x.StoreId);

            builder.HasKey(x => x.Id);

            // --- Pedidos online (pedidos-whatsapp-persistencia, F2) ---
            //
            // `Code` es el código público que la persona dicta por WhatsApp: tiene que ser ÚNICO
            // dentro de la tienda, no globalmente (dos tiendas pueden tener su propio "AB12CD").
            // Índice PARCIAL porque `Code` es null en las ventas del POS (D6/D14), que siguen
            // escribiendo en la tabla con `OrderType` normal/mayorista.
            builder.Property(x => x.Code).HasMaxLength(16);
            builder.HasIndex(x => new { x.StoreId, x.Code })
                .IsUnique()
                .HasFilter("\"Code\" IS NOT NULL");

            // El repartidor se asigna DESPUÉS de crear el pedido (F7): la columna es nullable y el
            // borrado de un repartidor NO puede tumbar los pedidos que ya entregó (Restrict).
            builder.HasOne(o => o.Driver)
                .WithMany()
                .HasForeignKey(o => o.DriverId)
                .OnDelete(DeleteBehavior.Restrict);

            builder.HasMany(c => c.OrderItems)
                 .WithOne(e => e.Order)
                 .HasForeignKey(e => e.OrderId)
                 .OnDelete(DeleteBehavior.Restrict);

            builder.HasMany(c => c.Payments)
                 .WithOne(e => e.Order)
                 .HasForeignKey(e => e.OrderId)
                 .OnDelete(DeleteBehavior.Restrict);
        }
    }
}
