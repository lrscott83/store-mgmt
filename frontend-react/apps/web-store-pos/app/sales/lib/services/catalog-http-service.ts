import type { BaseResponseModel } from '@store-mgmt/domain';
import { apiClient } from '~/shared/lib/http/api-client';

const API_URL = (import.meta.env['API_URL'] as string | undefined) ?? '';

/**
 * Estado del catálogo de la tienda seleccionada (cabecera de la vista Catálogo Web).
 * Espejo de `Application/Dtos/WebCatalog/CatalogDtos.cs` (CatalogStatusDto).
 */
export interface CatalogStatus {
  storeSlug: string;
  catalogUrl: string;
  catalogSyncedAt: string | null;
  sourceCategoriesCount: number;
  sourceProductsCount: number;
  publishedProductsCount: number;
  productsWithoutMainImageCount: number;
}

/** Resumen del botón "Sincronizar Catálogo" (CatalogSyncSummaryDto). */
export interface CatalogSyncSummary {
  storeSlug: string;
  catalogUrl: string;
  syncedAt: string;
  categoriesCreated: number;
  categoriesUpdated: number;
  productsCreated: number;
  productsUpdated: number;
  productsDeactivated: number;
}

/**
 * Producto del origen con sus campos de catálogo, tal como lo devuelve
 * `GET /v1/catalog/products` (CatalogProductViewDto). Un solo viaje pinta la lista editable.
 */
export interface CatalogProductView {
  id: string;
  categoryId: string;
  categoryName: string;
  name: string;
  price: number;
  currency: string;
  order: number;
  /**
   * Orden de la CATEGORÍA del producto (0 si la navegación no vino cargada). Lo necesita la
   * importación Catálogo Web → POS: el POS conserva también el orden de categoría, no solo el del
   * producto. Opcional porque el backend lo expone desde T1 y los consumidores de la vista no lo
   * usan; cuando viaja, siempre es un número.
   */
  categoryOrder?: number;
  /** false = la copia publicada está despublicada (fuera de venta o inactivo). */
  availableToSale: boolean;
  isActive: boolean;
  /** Descripción publicada: texto plano, nunca HTML (decisión D9). */
  description: string;
  /** % de descuento escalado con 2 decimales (1250 == 12.50 %). */
  percentDiscountPrice: number;
  /** Monto rebajado escalado con 2 decimales (500 == 5.00). */
  discountPrice: number;
  isNew: boolean;
  /** Clave de la imagen principal (null = sin imagen). */
  image: string | null;
  /** Galería en orden de presentación. */
  images: string[];
  finalPrice: number;
  hasDiscount: boolean;
}

/** Categoría del catálogo de la tienda (alta directa del SuperAdmin, store-scoped). */
export interface CatalogCategory {
  id: string;
  name: string;
  order: number;
}

/**
 * Cuerpo del alta de categoría: `order` ausente deja que el backend la ponga al final. No se
 * inventa un orden en el cliente porque la vista no conoce el máximo real de la tienda.
 */
export interface CatalogCategoryCreate {
  name: string;
  order?: number;
}

/**
 * Cuerpo del alta de producto desde el catálogo. `currency` viaja por VALOR del enum `Currency`
 * (igual que `UpdateProductCatalogFieldsCommand`); ausente = CUP en el backend.
 */
export interface CatalogProductCreate {
  categoryId: string;
  name: string;
  price: number;
  currency?: number;
  description?: string;
  order?: number;
}

/** Lo único que devuelve el alta: el id con el que se sube la imagen y se recarga el panel. */
export interface CatalogProductCreated {
  id: string;
}

/**
 * Cuerpo de `PUT /v1/catalog/products/{id}`: SOLO los campos del catálogo (decisión D8).
 * Un campo ausente no se toca; el backend no recibe el resto del producto, así que esta vista
 * nunca sobrescribe nombre, precio, orden ni código de barras.
 */
export interface CatalogProductFields {
  description?: string;
  percentDiscountPrice?: number;
  discountPrice?: number;
  isNew?: boolean;
  image?: string;
  removeImage?: boolean;
}

/**
 * Catálogo LOCAL del POS que viaja en "Sincronizar Catálogo" (espejo de
 * `Application/Dtos/WebCatalog/CatalogSnapshotDto.cs`).
 *
 * El POS es offline-first: el servidor no conoce sus productos, así que el botón envía esta foto y
 * el backend la espeja antes de publicar. Los ids son los Guid que el POS ya generó, para que la
 * copia publicada siga siendo 1:1 con el origen.
 */
export interface CatalogSnapshotCategory {
  id: string;
  name: string;
  order: number;
  isActive: boolean;
}

/**
 * Producto local: SOLO los hechos que el POS es dueño. Los campos del catálogo (descripción,
 * descuentos, "Nuevo" e imagen principal) y la galería se editan en la vista Catálogo Web, así que
 * NO viajan aquí — el espejo nunca los pisa (decisión D8). Ausente del snapshot = ya no existe en
 * el dispositivo: el backend lo despublica, nunca lo borra (decisión D6).
 */
export interface CatalogSnapshotProduct {
  id: string;
  categoryId: string;
  name: string;
  price: number;
  /** Moneda por VALOR del enum `Currency`; ausente = CUP. */
  currency?: number;
  order: number;
  availableToSale: boolean;
  isActive: boolean;
  businessId?: string;
  discountFromInventory: boolean;
}

export interface CatalogSnapshot {
  categories: CatalogSnapshotCategory[];
  products: CatalogSnapshotProduct[];
}

/**
 * Endpoints del módulo Catálogo Web (módulo 18). El gate real vive en el backend
 * (`[HasPermission(StoreRoleFeatures.WebCatalogAdmin)]`: módulo 18 + feature 122 + OwnerAdmin).
 */
/** Categoría publicada del catálogo público. */
export interface PublicCatalogCategory {
  id: string;
  name: string;
  slug: string;
  productsCount: number;
}

/** Cabecera del catálogo público: la tienda y sus categorías activas. */
export interface PublicCatalog {
  storeId: string;
  storeName: string;
  storeSlug: string;
  categories: PublicCatalogCategory[];
}

/** Producto publicado tal como lo ve el cliente final. */
export interface PublicCatalogProduct {
  id: string;
  name: string;
  /** Descripción en texto plano: los saltos de línea se respetan, nunca se interpreta HTML. */
  description: string;
  price: number;
  /** Precio final combinando % y monto rebajado (D7). */
  finalPrice: number;
  hasDiscount: boolean;
  percentDiscountPrice: number;
  percentDiscount: number;
  discountPrice: number;
  discountAmount: number;
  isNew: boolean;
  currency: string;
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  imageUrl: string | null;
  imageUrls: string[];
}

/** Página de resultados del catálogo público. */
export interface PublicCatalogPage {
  items: PublicCatalogProduct[];
  total: number;
  page: number;
  pageSize: number;
}

/** Filtros del listado público (`pageSize` se limita a 60 en el backend). */
export interface PublicCatalogFilters {
  categorySlug?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

/**
 * MARCA de la tienda: el logo y el banner que el dueño sube desde la vista Catálogo Web.
 * Espejo de `Application/Dtos/WebCatalog/StoreCatalogBrandingDto.cs`.
 *
 * Son CLAVES, no URLs: la clave es lo que se persiste, y la URL pública la compone el config
 * anónimo con el slug de la tienda. `paletteId` viaja para conocerla, pero NO se escribe: las
 * paletas se cancelaron (decisión del owner, 2026-10-07) y el catálogo sigue con la que ya usa.
 */
export interface CatalogBranding {
  logoKey: string | null;
  bannerKey: string | null;
  paletteId: string;
  /**
   * Cuántos elementos por fila muestra la rejilla del catálogo público en MÓVIL: 1 o 2. Solo la
   * plantilla `default` lo usa; `boutique` lo ignora. Espejo de
   * `StoreCatalogBrandingDto.MobileColumns` (decisión del owner, 2026-10-12).
   */
  mobileColumns: number;
}

/**
 * Cuerpo de `PUT /v1/catalog/branding`: un PARCHE. Lo que no viaja no se toca, así que cambiar
 * el logo no borra el banner (y al revés). Los campos son independientes.
 */
export interface CatalogBrandingUpdate {
  logo?: File;
  banner?: File;
  removeLogo?: boolean;
  removeBanner?: boolean;
  /** Elementos por fila en móvil (1 o 2). Ausente = no se toca. */
  mobileColumns?: number;
}

/**
 * Conjunto del SHOWCASE del catálogo: el carrusel de la cabecera o las imágenes del día.
 * Espejo de `Domain/Common/Enums/StoreCatalogImageKind.cs` POR VALOR — los valores viajan como
 * número tanto en el multipart del alta como en el cuerpo del reordenado, así que reordenar el
 * enum en el C# rompería los dos endpoints en silencio.
 */
export enum CatalogShowcaseKind {
  Carousel = 0,
  Daily = 1,
}

/**
 * Una imagen del showcase tal como la ve el dueño. Espejo de
 * `Application/Dtos/WebCatalog/StoreCatalogImageDto.cs`.
 *
 * Son CLAVES, no URLs, por el mismo motivo que en `CatalogBranding`: lo que se persiste es la
 * clave y la URL la compone el endpoint público de media con el slug de la tienda. `id` viaja
 * porque quitar y reordenar son por id, que es lo único que identifica UNA imagen concreta.
 */
export interface CatalogShowcaseImage {
  id: string;
  kind: CatalogShowcaseKind;
  key: string;
  /** Posición dentro de SU conjunto, empezando en 0. */
  orderIndex: number;
  caption: string | null;
  isActive: boolean;
}

/**
 * Las imágenes de la tienda agrupadas por conjunto (decisión C1: dos conjuntos INDEPENDIENTES).
 * Espejo de `Application/Dtos/WebCatalog/StoreCatalogImagesDto.cs`.
 *
 * Son DOS LISTAS y no un array plano por una razón práctica: la vista renderiza dos secciones y
 * no debería conocer el enum para decidir a cuál pertenece una imagen. Ambas listas están siempre
 * presentes aunque estén vacías — una tienda recién sincronizada no tiene ninguna imagen y eso NO
 * es un 404.
 */
export interface CatalogShowcaseImages {
  carousel: CatalogShowcaseImage[];
  daily: CatalogShowcaseImage[];
}

/**
 * Alta de UNA imagen del showcase. El pie de foto viaja en el MISMO POST porque el backend no
 * tiene endpoint para cambiarlo: corregirlo obliga a quitar la imagen y volver a subirla.
 */
export interface CatalogShowcaseImageUpload {
  kind: CatalogShowcaseKind;
  file: File;
  caption?: string;
}

/**
 * Una imagen del SHOWCASE ya publicada para el cliente final: el carrusel de cabecera o las
 * imágenes del día. A diferencia de `CatalogShowcaseImage` (la vista del dueño, que habla en
 * CLAVES y lleva `id`/`kind`/`orderIndex`), aquí viaja lo único que el catálogo necesita pintar:
 * la ruta y el pie de foto.
 */
export interface PublicShowcaseImage {
  /** Ruta RELATIVA del endpoint público de media (nunca una ruta del servidor). */
  readonly url: string;
  /** Pie de foto opcional: el dueño lo escribe al subir, y puede no ponerlo. */
  readonly caption?: string | null;
}

/**
 * Configuración de pedidos que el catálogo público lee sin sesión
 * (`GET /v1/public/ordering/{storeSlug}/config`). Espejo de `PublicOrderingConfigDto`.
 *
 * `logoUrl`/`bannerUrl` son rutas RELATIVAS del endpoint público de media (nunca rutas del
 * servidor): se resuelven con `apiFileUrl`.
 *
 * Sin costo de envío ni importe mínimo: el pedido vale lo que valen sus líneas y no hay
 * mínimo que frappe. Ni el backend los publica ni esta UI los pinta.
 */
export interface PublicOrderingConfig {
  enabled: boolean;
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  businessHours: string | null;
  deliveryZones: string | null;
  paletteId: string;
  /**
   * Id de la PLANTILLA (vista) con la que el storefront pinta el catálogo. `default` = la vista
   * actual. Una tienda sin fila, o con la plantilla en blanco, recibe `default`.
   */
  templateId: string;
  /**
   * Cuántos elementos por fila muestra la rejilla del catálogo público en MÓVIL: 1 o 2. Solo lo usa
   * la plantilla `default`; `boutique` lo ignora. Espejo de `PublicOrderingConfigDto.MobileColumns`
   * (decisión del owner, 2026-10-12). Un valor leído fuera de rango se normaliza en el backend a 2.
   */
  mobileColumns: number;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  /**
   * La tienda tiene ACTIVO el módulo "Pedidos WhatsApp" (19). Es el interruptor del CARRITO
   * (M2): sin él no hay carrito ni pedidos nuevos, aunque `enabled` esté en true.
   *
   * INDEPENDIENTE de `enabled` a propósito: uno es lo que compró la tienda (el módulo es de
   * `StoreModule`, no del plan) y el otro la decisión de abrir pedidos hoy.
   */
  pedidosWhatsAppEnabled: boolean;
  /**
   * La tienda tiene ACTIVO el módulo "Gestión de Pedidos" (20). Decide el MODO del alta, no si se
   * persiste: con el módulo el checkout espera la respuesta (alta síncrona, código y consulta del
   * pedido); sin él el `POST` se dispara en SEGUNDO PLANO y el resumen sale por `wa.me` en el mismo
   * gesto. Las vistas de gestión siguen ocultas hasta que el módulo esté activo.
   */
  gestionPedidosEnabled: boolean;
  /**
   * Número de WhatsApp de la tienda, con prefijo internacional, TAL CUAL lo guardó el dueño.
   *
   * Viaja AQUÍ y no solo en la respuesta de creación desde T5 (2026-10-10), que revierte F4-T2:
   * en el alta en segundo plano (sin módulo 20) no hay respuesta de creación de la que sacarlo —
   * sin este campo el frontend no podría armar el `wa.me` de ese modo.
   *
   * `null`/`undefined` = la tienda no lo tiene configurado: el enlace queda BLOQUEADO y el aviso
   * lo dice. NUNCA se "limpia" aquí: el backend lo publica tal cual y `wa.me` lo normaliza a
   * dígitos (`whatsapp-order-link.ts`).
   */
  whatsappNumber?: string | null;
  /**
   * Carrusel de cabecera e imágenes del día, cada uno en orden de presentación y SIEMPRE
   * presente aunque esté VACÍO (decisión C1: dos conjuntos independientes; una tienda recién
   * sincronizada no tiene ninguno y eso NO es un 404). Al ser una lista vacía y no un campo
   * ausente, quien lo pinte decide con `length` si lo muestra, sin tratar los dos casos distinto.
   */
  carouselImages: PublicShowcaseImage[];
  dailyImages: PublicShowcaseImage[];
}

/**
 * Modalidad de entrega de un pedido online, por VALOR del enum `OrderDeliveryType`
 * (`Domain/Common/Enums/OrderDeliveryType.cs`).
 */
export enum PublicOrderDeliveryType {
  Pickup = 0,
  Delivery = 1,
}

/**
 * Estado de un pedido online, por VALOR de `OrderStatus` (`Domain/Common/Enums/OrderStatus.cs`).
 * Los valores numéricos están persistidos, así que no se reordenan.
 */
export enum PublicOrderStatusKind {
  New = 0,
  Accepted = 1,
  Preparing = 2,
  Ready = 3,
  Delivered = 4,
  Cancelled = 5,
}

/**
 * Pago de un pedido online, por VALOR de `OrderPaymentStatus`. Es manual y en efectivo (D3): lo
 * marca una persona, no una pasarela, así que solo hay estos dos.
 */
export enum PublicOrderPaymentStatus {
  Pending = 0,
  Paid = 1,
}

/**
 * Cuerpo de `POST /v1/public/ordering/{storeSlug}/orders`. Espejo de `CreateOnlineOrderCommand`.
 *
 * DELIBERADAMENTE sin `price` ni `total`: el cliente no los envía porque el servidor los calcula
 * con los productos publicados. El `storeSlug` tampoco viaja —lo pone la ruta— para que el cuerpo
 * no pueda decidir en qué tienda se crea el pedido.
 */
export interface CreatePublicOrderRequest {
  customerName: string;
  customerPhone: string;
  deliveryType: PublicOrderDeliveryType;
  /** Obligatorio solo con `Delivery`. */
  deliveryAddress?: string;
  notes?: string;
  items: PublicOrderLineRequest[];
}

/** Una línea del pedido: QUÉ producto y CUÁNTO, nunca a qué precio. */
export interface PublicOrderLineRequest {
  productId: string;
  quantity: number;
}

/**
 * Una línea del SNAPSHOT persistido del pedido (`OnlineOrderCreatedLineDto`): nombre, cantidad y
 * precio UNITARIO tal como quedaron guardados en `OrderItem`.
 *
 * El precio es el del servidor por definición — es una copia de lo ya persistido—, así que el
 * resumen de WhatsApp se arma con esto y no con el carrito del cliente.
 */
export interface PublicOrderCreatedLine {
  name: string;
  quantity: number;
  price: number;
}

/** Lo que devuelve el alta (`OnlineOrderCreatedDto`): el código con el que se consulta el pedido. */
export interface PublicOrderCreated {
  id: string;
  code: string;
  /** Subtotal de las líneas, ya calculado por el servidor desde el snapshot persistido. */
  subtotal: number;
  /** Total YA calculado por el servidor. Sin costo de envío, así que hoy coincide con el subtotal. */
  total: number;
  /** Moneda del catálogo por valor de `Currency`. */
  currency: number;
  /**
   * Líneas del snapshot PERSISTIDO, no las que envió el cliente: es lo que la tienda ve en su
   * panel y lo que el resumen de WhatsApp tiene que decir (si no, el mensaje no cuadra con el
   * pedido guardado).
   */
  lines: PublicOrderCreatedLine[];
  /**
   * Número de WhatsApp de la tienda (F4, decisión T2). REPETIDO en la respuesta de creación desde
   * T5 (2026-10-10), que además lo publica en `PublicOrderingConfig`: aquí sigue llegando porque es
   * el número con el que el servidor resolvió ESTE pedido, y el config lo lee cualquiera que abra
   * el catálogo.
   *
   * `null`/`undefined` cuando la tienda no lo tiene configurado: el enlace `wa.me` queda
   * BLOQUEADO. Con el módulo 20 activo es el caso raro (el aviso lo dirá); sin él —modo solo
   * WhatsApp— el número del CONFIG es el que manda, porque esta respuesta no existe.
   */
  whatsappNumber?: string | null;
}

/**
 * Estado de un pedido tal como lo ve quien lo pidió (`PublicOrderStatusDto`). Va ACOTADO a
 * propósito: sin nombre ni teléfono del cliente, sin dirección, sin notas ni ids internos.
 *
 * Los enums viajan como NÚMERO (serialización por defecto de `System.Text.Json`), no como
 * cadena: `status`, `paymentStatus`, `deliveryType` y `currency`.
 */
export interface PublicOrderStatus {
  code: string;
  status: PublicOrderStatusKind;
  paymentStatus: PublicOrderPaymentStatus;
  deliveryType: PublicOrderDeliveryType;
  total: number;
  /** Moneda del catálogo por valor de `Currency`. */
  currency: number;
  /** Líneas con el SNAPSHOT del momento del pedido, no el precio del catálogo de hoy. */
  items: PublicOrderStatusItem[];
}

/** Una línea de la consulta pública: nombre, cantidad y precio unitario del snapshot. */
export interface PublicOrderStatusItem {
  name: string;
  quantity: number;
  price: number;
}

/** Prefijo del cliente del dueño: la tienda sale del claim de la sesión. */
const SESSION_CATALOG_PATH = '/v1/catalog';

/**
 * Cliente de configuración del catálogo contra un prefijo dado. Los métodos son los mismos para el
 * dueño y para el SuperAdmin: lo único que cambia es de dónde sale la tienda — del claim
 * (`/v1/catalog`) o de la RUTA (`/v1/stores/{storeId}/catalog`). El backend ejecuta exactamente los
 * mismos comandos/queries en ambos casos.
 */
function createCatalogConfigClient(basePath: string) {
  return {
    async getStatus(): Promise<BaseResponseModel<CatalogStatus>> {
      const response = await apiClient.get<BaseResponseModel<CatalogStatus>>(`${basePath}/status`);
      return response.data;
    },

    async getProducts(): Promise<BaseResponseModel<CatalogProductView[]>> {
      const response = await apiClient.get<BaseResponseModel<CatalogProductView[]>>(
        `${basePath}/products`,
      );
      return response.data;
    },

    /** Categorías de la tienda ordenadas por `order` (panel del catálogo admin). */
    async getCategories(): Promise<BaseResponseModel<CatalogCategory[]>> {
      const response = await apiClient.get<BaseResponseModel<CatalogCategory[]>>(
        `${basePath}/categories`,
      );
      return response.data;
    },

    /** Alta de categoría. Sin `order` el backend la deja al final: el cliente no lo adivina. */
    async createCategory(
      payload: CatalogCategoryCreate,
    ): Promise<BaseResponseModel<CatalogCategory>> {
      const response = await apiClient.post<BaseResponseModel<CatalogCategory>>(
        `${basePath}/categories`,
        payload,
      );
      return response.data;
    },

    /**
     * Alta de producto en el catálogo publicado. Devuelve SOLO el id: la imagen principal se sube
     * después con `uploadImage`, porque necesita ese id.
     */
    async createProduct(
      payload: CatalogProductCreate,
    ): Promise<BaseResponseModel<CatalogProductCreated>> {
      const response = await apiClient.post<BaseResponseModel<CatalogProductCreated>>(
        `${basePath}/products`,
        payload,
      );
      return response.data;
    },

    /**
     * Sincroniza el catálogo publicado con el origen (crea lo que falta, actualiza lo existente y
     * despublica lo que dejó de estar en venta; nunca borra).
     *
     * `snapshot` es el catálogo local de esta tienda: sin él el servidor publicaría lo que tenga en
     * su propia tabla de productos, que para una tienda offline-first está vacía.
     */
    async sync(snapshot?: CatalogSnapshot): Promise<BaseResponseModel<CatalogSyncSummary>> {
      const response = await apiClient.post<BaseResponseModel<CatalogSyncSummary>>(
        `${basePath}/sync`,
        {
          snapshot: snapshot ?? null,
        },
      );
      return response.data;
    },

    /** Guarda los campos del catálogo de un producto. */
    async saveProductFields(
      productId: string,
      fields: CatalogProductFields,
    ): Promise<BaseResponseModel<boolean>> {
      const response = await apiClient.put<BaseResponseModel<boolean>>(
        `${basePath}/products/${productId}`,
        fields,
      );
      return response.data;
    },

    /** Sube una imagen a la galería y devuelve su clave. */
    async uploadImage(productId: string, file: File): Promise<BaseResponseModel<string>> {
      const formData = new FormData();
      formData.append('file', file);
      // `Content-Type: multipart/form-data` EXPLÍCITO: `api-client` fija `application/json` como
      // cabecera por defecto, y axios convierte un FormData a JSON cuando ve ese tipo — el POST salía
      // como JSON y el backend lo rechazaba con 415. Declarando multipart, axios deja el FormData
      // intacto y el adaptador borra la cabecera para que el navegador ponga el boundary real.
      const response = await apiClient.post<BaseResponseModel<string>>(
        `${basePath}/products/${productId}/images`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      return response.data;
    },

    /** Quita una imagen de la galería (se borra el archivo, sin vuelta atrás). */
    async removeImage(productId: string, path: string): Promise<BaseResponseModel<boolean>> {
      const response = await apiClient.delete<BaseResponseModel<boolean>>(
        `${basePath}/products/${productId}/images`,
        { params: { path } },
      );
      return response.data;
    },

    /** Reordena la galería enviando el orden final completo. */
    async reorderImages(productId: string, paths: string[]): Promise<BaseResponseModel<boolean>> {
      const response = await apiClient.put<BaseResponseModel<boolean>>(
        `${basePath}/products/${productId}/images/order`,
        { paths },
      );
      return response.data;
    },

    /**
     * Marca de la tienda actual. Una tienda sin fila NO es un 404: el backend devuelve los valores
     * por defecto (sin logo, sin banner, paleta actual).
     */
    async getBranding(): Promise<BaseResponseModel<CatalogBranding>> {
      const response = await apiClient.get<BaseResponseModel<CatalogBranding>>(
        `${basePath}/branding`,
      );
      return response.data;
    },

    /**
     * Sube, cambia o quita el logo y/o el banner (F8). Es un PUT PARCIAL: lo que no se manda no
     * se toca, así que cambiar el logo no borra el banner.
     *
     * Multipart porque los archivos viajan como `IFormFile`. El `Content-Type` EXPLÍCITO es el
     * mismo requisito documentado en `uploadImage`: `api-client` fija `application/json` y axios
     * convertiría el FormData a JSON — declarando multipart, axios deja el FormData intacto y el
     * adaptador borra la cabecera para que el navegador ponga el boundary real.
     */
    async updateBranding(
      payload: CatalogBrandingUpdate,
    ): Promise<BaseResponseModel<CatalogBranding>> {
      const formData = new FormData();
      if (payload.logo) formData.append('logo', payload.logo);
      if (payload.banner) formData.append('banner', payload.banner);
      if (payload.removeLogo) formData.append('removeLogo', 'true');
      if (payload.removeBanner) formData.append('removeBanner', 'true');
      // Ausente = "no toco el ajuste": el backend lo lee como null.
      if (payload.mobileColumns !== undefined) {
        formData.append('mobileColumns', String(payload.mobileColumns));
      }
      const response = await apiClient.put<BaseResponseModel<CatalogBranding>>(
        `${basePath}/branding`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      return response.data;
    },

    // --- SHOWCASE: carrusel de cabecera e imágenes del día, los dos conjuntos independientes. ---

    /**
     * Las imágenes de la tienda actual agrupadas por conjunto. Una tienda sin imágenes devuelve los
     * dos conjuntos VACÍOS, no un 404: acaba de sincronizar y todavía no subió ninguna.
     */
    async getShowcaseImages(): Promise<BaseResponseModel<CatalogShowcaseImages>> {
      const response = await apiClient.get<BaseResponseModel<CatalogShowcaseImages>>(
        `${basePath}/showcase`,
      );
      return response.data;
    },

    /**
     * Sube UNA imagen a UN conjunto. Multipart porque el archivo viaja como `IFormFile`, y el
     * `Content-Type` EXPLÍCITO es el mismo requisito documentado en `uploadImage`: `api-client` fija
     * `application/json` como cabecera por defecto y axios convertiría el FormData a JSON — declarando
     * multipart, axios lo deja intacto y el adaptador borra la cabecera para que el navegador ponga el
     * boundary real.
     *
     * `kind` viaja como NÚMERO (el binder de `[FromForm]` acepta "0"/"1" para el enum), y el pie de
     * foto solo se manda si el dueño lo escribió: vacío y ausente no son lo mismo para el comando.
     */
    async uploadShowcaseImage(
      payload: CatalogShowcaseImageUpload,
    ): Promise<BaseResponseModel<CatalogShowcaseImage>> {
      const formData = new FormData();
      formData.append('kind', String(payload.kind));
      formData.append('file', payload.file);
      if (payload.caption) formData.append('caption', payload.caption);
      const response = await apiClient.post<BaseResponseModel<CatalogShowcaseImage>>(
        `${basePath}/showcase`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      return response.data;
    },

    /** Quita una imagen: borra la fila y el archivo (sin vuelta atrás). */
    async removeShowcaseImage(imageId: string): Promise<BaseResponseModel<boolean>> {
      const response = await apiClient.delete<BaseResponseModel<boolean>>(
        `${basePath}/showcase/${imageId}`,
      );
      return response.data;
    },

    /**
     * Reordena UN conjunto enviando su orden FINAL COMPLETO — no un movimiento: el backend reescribe
     * el `OrderIndex` de todas las imágenes de ese conjunto y rechaza (400) una lista incompleta,
     * con repetidos o con ids de otro conjunto.
     */
    async reorderShowcaseImages(
      kind: CatalogShowcaseKind,
      orderedIds: string[],
    ): Promise<BaseResponseModel<boolean>> {
      const response = await apiClient.put<BaseResponseModel<boolean>>(
        `${basePath}/showcase/order`,
        {
          kind,
          orderedIds,
        },
      );
      return response.data;
    },
  };
}

/**
 * Cliente store-scoped para el SuperAdmin. La tienda viaja en la RUTA, así que la configuración no
 * depende de su tienda seleccionada (un SuperAdmin no tiene ninguna) y no toca la sesión ni la DEK.
 */
export function catalogClientForStore(storeId: string) {
  return createCatalogConfigClient(`/v1/stores/${storeId}/catalog`);
}

/**
 * Una fila del CSV de importación del catálogo, ya normalizada por `parseCsvProducts`:
 * categoría, producto, precio de venta y moneda de venta (número del enum `Currency`;
 * ausente = CUP). Al backend le llegan estos nombres, no los del CSV.
 */
export interface CatalogCsvImportRow {
  categoryName: string;
  productName: string;
  price: number;
  currency?: number;
}

/** Resumen del import (espejo de `CatalogCsvImportSummaryDto`). */
export interface CatalogCsvImportSummary {
  categoriesCreated: number;
  productsCreated: number;
  productsUpdated: number;
  rowsProcessed: number;
}

/**
 * Import CSV de productos al catálogo de UNA tienda (SuperAdmin, store-scoped).
 *
 * UPSERT por categoría + producto: crea lo que falta y actualiza SOLO precio y moneda de lo
 * existente. Es una sola petición — el CSV se parsea en el navegador — y es todo o nada: una fila
 * inválida hace que el backend rechace el import completo.
 */
export async function importCatalogCsv(
  storeId: string,
  rows: CatalogCsvImportRow[],
): Promise<BaseResponseModel<CatalogCsvImportSummary>> {
  const response = await apiClient.post<BaseResponseModel<CatalogCsvImportSummary>>(
    `/v1/stores/${storeId}/catalog/import`,
    { rows },
  );
  return response.data;
}

export const catalogHttpService = {
  ...createCatalogConfigClient(SESSION_CATALOG_PATH),

  /** URL pública (anónima) de una imagen del catálogo publicado. */
  mediaUrl(storeSlug: string, key: string): string {
    return `/api/v1/public/catalog/${storeSlug}/media/${key}`;
  },

  // --- API pública: sin sesión, la consume el catálogo que ve el cliente final. ---

  /** Cabecera del catálogo publicado (tienda + categorías con sus conteos). */
  async getPublicCatalog(storeSlug: string): Promise<BaseResponseModel<PublicCatalog>> {
    const response = await apiClient.get<BaseResponseModel<PublicCatalog>>(
      `/v1/public/catalog/${encodeURIComponent(storeSlug)}`,
    );
    return response.data;
  },

  /** Listado público paginado, con filtro por categoría y búsqueda por nombre. */
  async getPublicProducts(
    storeSlug: string,
    filters: PublicCatalogFilters = {},
  ): Promise<BaseResponseModel<PublicCatalogPage>> {
    const response = await apiClient.get<BaseResponseModel<PublicCatalogPage>>(
      `/v1/public/catalog/${encodeURIComponent(storeSlug)}/products`,
      { params: filters },
    );
    return response.data;
  },

  /** Detalle público de un producto publicado (descripción + galería). */
  async getPublicProduct(
    storeSlug: string,
    productId: string,
  ): Promise<BaseResponseModel<PublicCatalogProduct>> {
    const response = await apiClient.get<BaseResponseModel<PublicCatalogProduct>>(
      `/v1/public/catalog/${encodeURIComponent(storeSlug)}/products/${productId}`,
    );
    return response.data;
  },

  /**
   * Configuración de pedidos + marca que la carta pública lee sin sesión. A diferencia del
   * catálogo, un fallo aquí NO es un 404 de tienda inexistente: la marca es opcional, así que
   * quien la consume trata el error como "sin marca" y sigue pintando la página.
   */
  async getPublicOrderingConfig(
    storeSlug: string,
  ): Promise<BaseResponseModel<PublicOrderingConfig>> {
    const response = await apiClient.get<BaseResponseModel<PublicOrderingConfig>>(
      `/v1/public/ordering/${encodeURIComponent(storeSlug)}/config`,
    );
    return response.data;
  },

  /**
   * Crea el pedido del cliente anónimo (F3, T5). Es la única escritura pública y lleva su propio
   * límite de tasa en el servidor.
   *
   * El payload NO lleva precio ni total: el servidor los recalcula leyendo el catálogo, así que un
   * total manipulado desde el navegador no cambia nada.
   */
  async createPublicOrder(
    storeSlug: string,
    payload: CreatePublicOrderRequest,
  ): Promise<BaseResponseModel<PublicOrderCreated>> {
    const response = await apiClient.post<BaseResponseModel<PublicOrderCreated>>(
      `/v1/public/ordering/${encodeURIComponent(storeSlug)}/orders`,
      payload,
    );
    return response.data;
  },

  /**
   * Alta del pedido del GESTOR de ventas (T5b/T5c). Mismo payload que el público; el backend
   * pone la atribución desde el token, nunca desde el cuerpo. El slug va en la ruta y el
   * servidor verifica que la tienda pertenezca al Owner del gestor y tenga el módulo 21.
   */
  async createSalesManagerOrder(
    storeSlug: string,
    payload: CreatePublicOrderRequest,
  ): Promise<BaseResponseModel<PublicOrderCreated>> {
    const response = await apiClient.post<BaseResponseModel<PublicOrderCreated>>(
      `/v1/sales-managers/orders/${encodeURIComponent(storeSlug)}`,
      payload,
    );
    return response.data;
  },

  /**
   * Persiste el pedido SIN esperar la respuesta (modo sin "Gestión de Pedidos", 20).
   *
   * El storefront abre `wa.me` en el mismo gesto: el pedido viaja por WhatsApp y la fila se
   * escribe en segundo plano. Un fallo aquí NO se muestra al cliente —el canal de entrega sigue
   * siendo WhatsApp— y por eso el request va con `skipLoading` y el error se traga.
   *
   * No hay `await` a propósito: bloquear el handoff hasta que la base confirme era justo lo que
   * el modo asíncrono elimina. El backend sigue validando el pedido; si lo rechaza, la tienda lo
   * recibe igual por WhatsApp.
   */
  createPublicOrderInBackground(
    storeSlug: string,
    payload: CreatePublicOrderRequest,
  ): Promise<void> {
    try {
      return fetch(`${API_URL}/v1/public/ordering/${encodeURIComponent(storeSlug)}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      })
        .then(() => undefined)
        .catch((err: unknown) => {
          // Best-effort: el pedido ya salió por WhatsApp. Dejamos señal para diagnosticar una
          // caída del endpoint sin bloquear ni asustar al cliente.
          console.warn(
            '[catalog-http-service] no se pudo persistir el pedido en segundo plano',
            err,
          );
        });
    } catch (err) {
      console.warn('[catalog-http-service] no se pudo iniciar el pedido en segundo plano', err);
      return Promise.resolve();
    }
  },

  /**
   * Estado de un pedido por código + teléfono (F3, T6), la vía de autoservicio sin cuenta (D4).
   *
   * El `404` es uniforme a propósito —código inexistente, de otra tienda o teléfono que no
   * coincide responden igual—, así que un fallo aquí NO significa "ese código no existe".
   */
  async getPublicOrderStatus(
    storeSlug: string,
    code: string,
    phone: string,
  ): Promise<BaseResponseModel<PublicOrderStatus>> {
    const response = await apiClient.get<BaseResponseModel<PublicOrderStatus>>(
      `/v1/public/ordering/${encodeURIComponent(storeSlug)}/orders/${encodeURIComponent(code)}`,
      { params: { phone } },
    );
    return response.data;
  },
};
