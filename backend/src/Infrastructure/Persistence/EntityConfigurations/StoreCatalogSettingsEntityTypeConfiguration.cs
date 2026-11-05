using Domain.Entities.StoreCatalogSettings;
using Domain.Common.Enums;
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
            builder.Property(x => x.LogoKey).HasMaxLength(StoreCatalogSettings.ImageKeyMaxLength);
            builder.Property(x => x.BannerKey).HasMaxLength(StoreCatalogSettings.ImageKeyMaxLength);
            builder.Property(x => x.WhatsappNumber).HasMaxLength(StoreCatalogSettings.WhatsappNumberMaxLength);
            builder.Property(x => x.PaletteId).HasMaxLength(StoreCatalogSettings.PaletteIdMaxLength).IsRequired();

            // Id de la PLANTILLA (vista) del catálogo. Mismo límite que `PaletteId`; kebab-case
            // validado en el command de marca, con `default` como valor de una fila recién creada.
            builder.Property(x => x.TemplateId).HasMaxLength(StoreCatalogSettings.TemplateIdMaxLength).IsRequired();

            // Elementos por fila en MÓVIL de la rejilla pública (1 o 2; decisión del owner,
            // 2026-10-12). El `HasDefaultValue` es lo que hace que la migración rellene las filas
            // existentes con 2 (el comportamiento actual) en vez del 0 que EF pondría por defecto.
            builder.Property(x => x.MobileColumns)
                .IsRequired()
                .HasDefaultValue(StoreCatalogSettings.DefaultMobileColumns);

            // Modo de PRECIO del catálogo (por unidad o mayorista). `HasDefaultValue` es lo que
            // rellena las filas existentes con `Unit` — el comportamiento histórico — en vez del 0
            // que EF pondría por defecto, que no es ningún valor del enum.
            builder.Property(x => x.PriceMode)
                .IsRequired()
                .HasDefaultValue(CatalogPriceMode.Unit)
                // El centinela evita que EF tome el 0 del CLR como "valor sin asignar": con
                // `Unit` como centinela, el default de la base solo se usa cuando el valor ES
                // `Unit`, que es exactamente lo que queremos (nunca se escribe un 0).
                .HasSentinel(CatalogPriceMode.Unit);

            // D16: horarios y zonas son texto libre para el dueño, sin estructura que validar.
            builder.Property(x => x.BusinessHours).HasMaxLength(StoreCatalogSettings.BusinessHoursMaxLength);
            builder.Property(x => x.DeliveryZones).HasMaxLength(StoreCatalogSettings.DeliveryZonesMaxLength);

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