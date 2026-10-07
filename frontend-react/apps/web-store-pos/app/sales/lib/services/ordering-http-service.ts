import type { BaseResponseModel } from '@store-mgmt/domain';
import { apiClient } from '~/shared/lib/http/api-client';

/**
 * Configuración de pedidos online de la tienda, tal como la ve su dueño (vista "Pedidos
 * WhatsApp", F1). Espejo de `Application/Dtos/OnlineOrdering/OnlineOrderingDtos.cs`
 * (`StoreCatalogSettingsDto`).
 *
 * Son SOLO las columnas de pedidos: la marca (`LogoKey`/`BannerKey`/`PaletteId`) es de F8 y vive
 * en la vista Catálogo Web, así que no viaja aquí. SIN moneda (A3 eliminada): los precios y la
 * moneda los pone el catálogo.
 */
export interface OrderingSettings {
  /** Interruptor maestro: apagado = la tienda no acepta pedidos y el storefront no ofrece carrito. */
  enabled: boolean;
  /** Teléfono con prefijo internacional (D17) para armar el enlace `wa.me`. null = sin número. */
  whatsappNumber: string | null;
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  /** Costo de envío en la moneda del catálogo. 0 = envío gratis. */
  deliveryFee: number;
  /** Importe mínimo del pedido. 0 = sin mínimo. */
  minimumOrderAmount: number;
  /** Horario de atención como texto libre (D16). null = no publicado. */
  businessHours: string | null;
  /** Zonas de reparto como texto libre (D16). null = todas. */
  deliveryZones: string | null;
  /** Sello de la última sincronización (diagnóstico). null = nunca sincronizado. */
  syncedAt: string | null;
}

/**
 * Cuerpo de `PUT /v1/online-ordering/settings` (el botón "Sincronizar"): la fila COMPLETA de
 * pedidos, no un parche — el servidor resuelve alta o actualización por tienda.
 *
 * NO lleva `storeId`: la tienda es la del contexto de la petición, y `syncedAt` tampoco: lo fija
 * el servidor con su reloj. Los importes viajan ya en número (el formulario los convierte).
 */
export interface OrderingSettingsPayload {
  enabled: boolean;
  whatsappNumber: string | null;
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  deliveryFee: number;
  minimumOrderAmount: number;
  businessHours: string | null;
  deliveryZones: string | null;
}

/**
 * Endpoints de gestión de la configuración de pedidos (módulo 18, F1). El gate real vive en el
 * backend (`[HasPermission(StoreRoleFeatures.WebCatalogAdmin)]`: módulo 18 + feature 122 +
 * OwnerAdmin) — aquí solo se hablan las dos rutas.
 */
export const orderingHttpService = {
  /**
   * Configuración de pedidos de la tienda actual. Una tienda sin fila NO es un 404: el backend
   * devuelve los valores por defecto con `enabled = false`.
   */
  async getSettings(): Promise<BaseResponseModel<OrderingSettings>> {
    const response = await apiClient.get<BaseResponseModel<OrderingSettings>>(
      '/v1/online-ordering/settings',
    );
    return response.data;
  },

  /** Guarda la configuración (alta la primera vez, actualización después) y fija `syncedAt`. */
  async updateSettings(
    payload: OrderingSettingsPayload,
  ): Promise<BaseResponseModel<OrderingSettings>> {
    const response = await apiClient.put<BaseResponseModel<OrderingSettings>>(
      '/v1/online-ordering/settings',
      payload,
    );
    return response.data;
  },
};