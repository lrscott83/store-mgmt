using Domain.Entities.StoreCatalogSettings;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Infrastructure.Persistence.EntityConfigurations
{
    /// <summary>
    /// Configuración del catálogo web de UNA tienda (F2): pedidos online + marca.
    ///
    /// Lo único que este archivo fija por encima del default es que `StoreId` es ÚNICO: D7 pide
    /// una fila por tienda, y sin ese índice una tienda podría tener dos configuraciones
    /// contradictorias y el comando de creación leería la que encontrara primero.
    /// </summary>
    internal sealed class StoreCatalogSettingsEntityTypeConfiguration : IEntityTypeConfiguration<StoreCatalogSettings>
    {
        private readonly ApplicationDbContext _context;
        public StoreCatalogSettingsEntityTypeConfiguration(ApplicationDbContext context)
        {
            _context = context;
        }

        public void Configure(EntityTypeBuilder<StoreCatalogSettings> builder)
        {
            builder.HasQueryFilter(x => _context.IsSuperAdmin || x.TenantId == _context.TenantId);
            builder.HasIndex(x => x.TenantId);
            builder.HasIndex(x => x.StoreId).IsUnique();

            builder.HasKey(x => x.Id);

            // Claves de imagen: mismo límite que `Product.Image` (ruta de almacenamiento).
            builder.Property(x => x.LogoKey).HasMaxLength(512);
            builder.Property(x => x.BannerKey).HasMaxLength(512);
            builder.Property(x => x.WhatsappNumber).HasMaxLength(32);
            builder.Property(x => x.PaletteId).HasMaxLength(64).IsRequired();

            // D16: horarios y zonas son texto libre para el dueño, sin estructura que validar.
            builder.Property(x => x.BusinessHours).HasMaxLength(512);
            builder.Property(x => x.DeliveryZones).HasMaxLength(512);

            // Importes de dinero: el default del DbContext los dejaría en decimal(18,6) (un tipo de
            // almacenamiento), y el costo de envío y el mínimo se comparan contra un total que el
            // catálogo redondea a 2 decimales (CatalogPricing).
            builder.Property(x => x.DeliveryFee).HasColumnType("decimal(18,2)");
            builder.Property(x => x.MinimumOrderAmount).HasColumnType("decimal(18,2)");

            builder.HasOne(s => s.Store)
                .WithMany()
                .HasForeignKey(s => s.StoreId)
                .OnDelete(DeleteBehavior.Restrict);
        }
    }
}