import type {
  PublicCatalog,
  PublicCatalogPage,
  PublicCatalogProduct,
  PublicOrderingConfig,
  PublicShowcaseImage,
} from '~/sales/lib/services/catalog-http-service';

/**
 * Contrato entre el CONTENEDOR del catálogo público (`public-catalog.tsx`) y una PLANTILLA (vista).
 *
 * El contenedor es dueño de TODO lo que es funcionalidad: la carga de datos, la búsqueda, el filtro
 * por categoría, la paginación, el carrito, el checkout y la consulta de estado. Las plantillas solo
 * PINTAN la página navegable: reciben datos y callbacks, y no hablan con la red ni con el store del
 * carrito.
 *
 * Las OVERLAYS (modal de detalle, carrito, checkout, estado del pedido) NO son responsabilidad de la
 * plantilla: las pinta el contenedor, para que toda plantilla comparta exactamente la misma
 * funcionalidad.
 *
 * Así, cambiar de plantilla cambia la VISTA y nada más.
 */
export interface CatalogTemplateProps {
  /** Slug de la tienda: la identidad de la carta pública. */
  readonly storeSlug: string;
  /** Cabecera publicada: nombre de la tienda y categorías activas. null mientras carga. */
  readonly catalog: PublicCatalog | null;
  /** Página de productos actual (items + total). null antes de la primera carga. */
  readonly page: PublicCatalogPage | null;
  /** Total de productos que cumplen el filtro (para el conteo y la paginación). */
  readonly total: number;
  /** Total de páginas, mínimo 1. */
  readonly totalPages: number;
  /** Página actual (1-based). */
  readonly currentPage: number;
  /** Texto del buscador tal como lo teclea el cliente (antes del debounce). */
  readonly searchInput: string;
  /** Categoría seleccionada (slug), vacío = todas. */
  readonly categorySlug: string;
  /** La última carga de la lista falló: se avisa sin tumbar la cabecera. */
  readonly listFailed: boolean;
  /** Config de pedidos + marca. null = el endpoint falló; la carta se publica igual. */
  readonly orderingConfig: PublicOrderingConfig | null;
  /** ¿La tienda acepta pedidos? Gatea carrito y botones de añadir. */
  readonly orderingEnabled: boolean;
  /** URL resuelta del logo de la tienda, o null si no tiene. */
  readonly logoUrl: string | null;
  /** Carrusel de cabecera, en orden de presentación. Vacío = no se pinta. */
  readonly carouselImages: readonly PublicShowcaseImage[];
  /** Imágenes del día (destacadas manuales). Vacío = no se pinta. */
  readonly dailyImages: readonly PublicShowcaseImage[];
  /** Contador del carrito de ESTA tienda. */
  readonly cartCount: number;

  /** El cliente teclea en el buscador (el contenedor aplica debounce). */
  readonly onSearchInputChange: (value: string) => void;
  /** El cliente envía el buscador a mano. */
  readonly onSearchSubmit: () => void;
  /** El cliente elige categoría ('' = todas). */
  readonly onCategoryChange: (slug: string) => void;
  /** El cliente cambia de página. */
  readonly onPageChange: (page: number) => void;
  /** El cliente abre la tarjeta de un producto (detalle). */
  readonly onOpenDetail: (product: PublicCatalogProduct) => void;
  /** El cliente añade un producto al carrito. */
  readonly onAddToCart: (product: PublicCatalogProduct) => void;
  /** El cliente abre el carrito. */
  readonly onOpenCart: () => void;
}
