using Domain.Entities.OrderSalesManagers;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Infrastructure.Persistence.EntityConfigurations
{
    /// <summary>
    /// Atribución pedido→gestor. `OrderId` único: un pedido no puede quedar atribuido dos veces.
    /// `ON DELETE RESTRICT` en todos los bordes porque es la evidencia del pedido del gestor y
    /// la base de la comisión.
    /// </summary>
    internal sealed class OrderSalesManagerEntityTypeConfiguration
        : IEntityTypeConfiguration<OrderSalesManager>
    {
        private readonly ApplicationDbContext _context;

        public OrderSalesManagerEntityTypeConfiguration(ApplicationDbContext context)
        {
            _context = context;
        }

        public void Configure(EntityTypeBuilder<OrderSalesManager> builder)
        {
            builder.ToTable("OrderSalesManager");
            builder.HasQueryFilter(x => _context.IsSuperAdmin || x.TenantId == _context.TenantId);

            builder.HasKey(x => x.Id);
            builder.HasIndex(x => x.TenantId);
            builder.HasIndex(x => x.OrderId).IsUnique();
            builder.HasIndex(x => x.SalesManagerId);
            builder.HasIndex(x => x.OwnerId);
            builder.HasIndex(x => x.StoreId);

            builder.HasOne(x => x.Order)
                .WithMany()
                .HasForeignKey(x => x.OrderId)
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
        }
    }
}
