import type { BaseResponseModel } from '@store-mgmt/domain';
import { apiClient } from '~/shared/lib/http/api-client';

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

export const catalogHttpService = {
  async getStatus(): Promise<BaseResponseModel<CatalogStatus>> {
    const response = await apiClient.get<BaseResponseModel<CatalogStatus>>('/v1/catalog/status');
    return response.data;
  },

  async getProducts(): Promise<BaseResponseModel<CatalogProductView[]>> {
    const response = await apiClient.get<BaseResponseModel<CatalogProductView[]>>(
      '/v1/catalog/products',
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
    const response = await apiClient.post<BaseResponseModel<CatalogSyncSummary>>('/v1/catalog/sync', {
      snapshot: snapshot ?? null,
    });
    return response.data;
  },

  /** Guarda los campos del catálogo de un producto. */
  async saveProductFields(
    productId: string,
    fields: CatalogProductFields,
  ): Promise<BaseResponseModel<boolean>> {
    const response = await apiClient.put<BaseResponseModel<boolean>>(
      `/v1/catalog/products/${productId}`,
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
      `/v1/catalog/products/${productId}/images`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return response.data;
  },

  /** Quita una imagen de la galería (se borra el archivo, sin vuelta atrás). */
  async removeImage(productId: string, path: string): Promise<BaseResponseModel<boolean>> {
    const response = await apiClient.delete<BaseResponseModel<boolean>>(
      `/v1/catalog/products/${productId}/images`,
      { params: { path } },
    );
    return response.data;
  },

  /** Reordena la galería enviando el orden final completo. */
  async reorderImages(productId: string, paths: string[]): Promise<BaseResponseModel<boolean>> {
    const response = await apiClient.put<BaseResponseModel<boolean>>(
      `/v1/catalog/products/${productId}/images/order`,
      { paths },
    );
    return response.data;
  },

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
};
