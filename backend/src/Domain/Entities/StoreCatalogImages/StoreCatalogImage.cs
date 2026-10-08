using Domain.Common.Entities;
using Domain.Common.Enums;
using Domain.Entities.Stores;

namespace Domain.Entities.StoreCatalogImages
{
    /// <summary>
    /// Una imagen del SHOWCASE del catálogo público: del carrusel de la cabecera o del bloque de
    /// imágenes del día. N filas por tienda, dos CONJUNTOS independientes (decisión del Owner C1) y
    /// orden dentro de cada conjunto.
    ///
    /// Tabla propia, y no dos columnas de texto en `StoreCatalogSettings`, por tres motivos que no son
    /// de estilo:
    ///
    ///   * Es N, no 1: una tienda sube hasta <see cref="MaxImagesPerKind"/> imágenes por conjunto.
    ///   * Cada imagen se QUITA por su id, con su archivo en disco. Una columna con un JSON de claves
    ///     obligaría a reescribir la columna entera para borrar una, y el borrado de archivos
    ///     quedaría en manos de un serializador en vez de un comando.
    ///   * El repositorio usa entidades EF y el storefront consume el catálogo por HTTP: una lista de
    ///     objetos es lo que ambos esperan.
    ///
    /// NO tiene columna de fecha: en v1 "del día" es un bloque de destacadas que el dueño cambia a
    /// mano (decisión C4). Añadirla después es una migración; meterla ahora sería una columna muerta.
    /// </summary>
    public sealed class StoreCatalogImage : AuditableEntity<Guid>, ITenantBaseEntity
    {
        /// <summary>
        /// Máximo de imágenes POR CONJUNTO. 10 es un carrusel usable: más que eso ni se ven ni se
        /// pueden mantener a mano.
        ///
        /// Vive en la entidad, y no en un `*Limits` aparte, porque el tope es parte de qué es una
        /// imagen de showcase válida — lo comprueban el comando de alta y su test— y no una constante
        /// de infrastructure que el Domain no conoce. El mismo criterio que
        /// `StoreCatalogSettings.DefaultPaletteId`.
        /// </summary>
        public const int MaxImagesPerKind = 10;

        /// <summary>
        /// Tope del pie de foto. Es texto libre del dueño, pero no ilimitado: sale en el catálogo
        /// público y vive en una columna.
        /// </summary>
        public const int CaptionMaxLength = 200;

        /// <summary>Tienda a la que pertenece. Es el aislamiento real: el filtro global acota por tenant.</summary>
        public Guid StoreId { get; set; }
        public Store Store { get; set; } = null!;

        /// <summary>Conjunto al que pertenece (carrusel o imágenes del día).</summary>
        public StoreCatalogImageKind Kind { get; set; }

        /// <summary>
        /// Clave relativa del archivo dentro del almacenamiento del catálogo. Es lo ÚNICO que se
        /// persiste de la imagen; la URL pública la compone el config anónimo con el slug.
        /// </summary>
        public string Key { get; set; }

        /// <summary>
        /// Posición dentro del conjunto, empezando en 0. Se llama <c>OrderIndex</c> y no <c>Order</c>
        /// porque <c>ORDER</c> es una palabra reservada de SQL y aquí el orden no se modela como
        /// columna con valor por defecto en la base, sino como algo que el reordenado reescribe
        /// entero.
        /// </summary>
        public int OrderIndex { get; set; }

        /// <summary>Pie de foto opcional. null = sin pie.</summary>
        public string? Caption { get; set; }

        /// <summary>
        /// Si la imagen se publica. Por defecto `true`: el dueño la subió para que se viera.
        ///
        /// En v1 nada la apaga —quitar una imagen borra la fila— así que es el interruptor que
        /// existe para que "dejar de mostrarla sin perder el archivo" no necesite una migración
        /// después. Tanto la vista de gestión como el catálogo público la respetan, para que "lo que
        /// el dueño ve" y "lo que ve el cliente" no puedan separarse.
        /// </summary>
        public bool IsActive { get; set; } = true;

        public Guid TenantId { get; set; }

        private StoreCatalogImage(Guid id, Guid storeId, Guid tenantId, StoreCatalogImageKind kind, string key,
            int orderIndex, string? caption) : base(id)
        {
            StoreId = storeId;
            TenantId = tenantId;
            Kind = kind;
            Key = key;
            OrderIndex = orderIndex;
            Caption = caption;
        }

        /// <summary>
        /// Crea una imagen de showcase. NO sube el archivo ni valida el tope: eso lo hace el comando,
        /// que es quien lee el conjunto actual y conoce el almacenamiento.
        /// </summary>
        public static StoreCatalogImage Create(Guid storeId, Guid tenantId, StoreCatalogImageKind kind, string key,
            int orderIndex, string? caption)
            => Create(Guid.NewGuid(), storeId, tenantId, kind, key, orderIndex, caption);

        /// <summary>
        /// Crea la imagen con un id CONOCIDO. Lo necesitan los tests y cualquierseed que tenga que
        /// fijar el id de antemano: `Entity&lt;TId&gt;.Id` es `init`, así que la única forma de fijarlo
        /// es nacer con él.
        /// </summary>
        public static StoreCatalogImage Create(Guid id, Guid storeId, Guid tenantId, StoreCatalogImageKind kind, string key,
            int orderIndex, string? caption)
            => new(id, storeId, tenantId, kind, key, orderIndex, caption);
    }
}