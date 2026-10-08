using Domain.Common.Limits;
using Domain.Entities.StoreCatalogImages;
using Domain.Entities.Stores;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Infrastructure.Persistence.EntityConfigurations
{
    /// <summary>
    /// Imágenes del SHOWCASE del catálogo público (carrusel e imágenes del día), N filas por tienda.
    ///
    /// Lo único que este archivo fija por encima del default:
    ///
    ///   * El filtro global por tenant, IGUAL que el de las imágenes de producto y el de la
    ///     configuración del catálogo. De él depende la seguridad de las lecturas EN SESIÓN, y su
    ///     ausencia haría que la gestión del showcase no quedara confinada a la tienda del contexto.
    ///   * Un índice por `StoreId`: todas las lecturas filtran por tienda, en sesión y en público.
    ///   * Un índice ÚNICO por `(StoreId, Key)`: la clave ya trae un `guid`, así que dos filas con la
    ///     misma clave solo pueden significar que la misma imagen se registró dos veces — y una imagen
    ///     que "quitar" borraría por una fila y dejaría la otra apuntando a un archivo que ya no está.
    ///     El índice lo convierte en un error de base en vez de un dato raro.
    ///   * `OrderIndex` NO es único, y no debe serlo: el reordenado reescribe los índices de todo el
    ///     conjunto, y un índice único obligaría a una actualización en dos pasos (intermedios
    ///     inválidos) que el repositorio no hace.
    /// </summary>
    internal sealed class StoreCatalogImageEntityTypeConfiguration : IEntityTypeConfiguration<StoreCatalogImage>
    {
        private readonly ApplicationDbContext _context;

        public StoreCatalogImageEntityTypeConfiguration(ApplicationDbContext context)
        {
            _context = context;
        }

        public void Configure(EntityTypeBuilder<StoreCatalogImage> builder)
        {
            builder.HasQueryFilter(x => _context.IsSuperAdmin || x.TenantId == _context.TenantId);
            builder.HasIndex(x => x.TenantId);
            builder.HasIndex(x => x.StoreId);
            builder.HasIndex(x => new { x.StoreId, x.Key }).IsUnique();

            builder.HasKey(x => x.Id);

            // Clave de imagen: mismo límite que `Product.Image` (ruta de almacenamiento).
            builder.Property(x => x.Key)
                .IsRequired()
                .HasMaxLength(ProductEntityLimits.ImagePathMaxLength);
            builder.Property(x => x.Caption).HasMaxLength(StoreCatalogImage.CaptionMaxLength);
            builder.Property(x => x.OrderIndex).HasDefaultValue(0);

            // `Restrict` y no cascada, igual que la configuración del catálogo: borrar una tienda no
            // debe decidir en cascada qué pasa con los archivos de su catálogo. `StoreCatalogImage`
            // no es el dueño de la relación desde `Store`, así que el borrado de la tienda lo
            // bloquea antes de llegar aquí, que es lo correcto: los archivos se limpian desde el
            // comando que los subió.
            builder.HasOne(image => image.Store)
                .WithMany()
                .HasForeignKey(image => image.StoreId)
                .OnDelete(DeleteBehavior.Restrict);
        }
    }
}