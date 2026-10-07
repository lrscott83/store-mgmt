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
 * Un repartidor de la tienda, tal como lo ve su panel (F7, vista "Repartidores"). Espejo de
 * `DeliveryDriverDto`.
 *
 * El `isActive` es una baja LÓGICA, no un borrado: apagar esta bandera NO elimina la fila ni los
 * pedidos que ya llevó, solo la esconde de las listas por defecto.
 */
export interface DeliveryDriver {
  readonly id: string;
  readonly storeId: string;
  readonly name: string;
  readonly phone: string;
  readonly isActive: boolean;
}

/**
 * Cuerpo de alta y de edición. SIN `storeId` (la tienda es la del contexto) y SIN `tenantId`.
 * La edición añade `isActive`, porque el interruptor de baja va en el mismo PATCH que el texto:
 * es la acción que el dueño hace ("se fue", "vuelve"), no un endpoint aparte.
 */
export interface DeliveryDriverPayload {
  name: string;
  phone: string;
}

/**
 * Endpoints de gestión de la configuración de pedidos (módulo 18, F1) y del catálogo de
 * repartidores (módulo 18, F7).
 *
 * El gate real vive en el backend, y NO es el mismo en los dos: la configuración es
 * `[HasPermission(StoreRoleFeatures.WebCatalogAdmin)]` (módulo 18 + feature 122 + solo
 * OwnerAdmin) mientras que los repartidores son `OnlineOrdersAdmin` (módulo 18 + feature 123 +
 * OwnerAdmin Y StoreUser, D15). Aquí solo se hablan las rutas.
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

  /**
   * Repartidores de la tienda actual (F7). Espejo de
   * `Application/Dtos/OnlineOrdering/DeliveryDriverDtos.cs`.
   *
   * SIN `tenantId`: el aislamiento por tienda ya está resuelto en el servidor y la vista no
   * necesita el tenant de cada fila. SÍ lleva `storeId`, a diferencia del DTO de configuración
   * de más arriba: la respuesta dice de qué tienda es cada repartidor en lugar de dejarlo
   * implícito, y no hay nada que el cliente pueda cambiar con él.
   *
   * NO lleva el número de pedidos asignados. Contarlo es leer `Order.DriverId` — dato de F5, que
   * es la vista de la operación del pedido. Aquí solo se gestiona el catálogo de personas (D8).
   */
  async getDeliveryDrivers(): Promise<BaseResponseModel<DeliveryDriver[]>> {
    // `activeOnly=true`: la vista de gestión necesita ver los dados de baja para poder
    // reactivarlos. El valor por defecto del backend (solo activos) es el que necesita el
    // selector de reparto de F5, no este.
    const response = await apiClient.get<BaseResponseModel<DeliveryDriver[]>>(
      '/v1/delivery-drivers',
      { params: { activeOnly: true } },
    );
    return response.data;
  },

  /**
   * Da de alta un repartidor. Nace activo: no hay `isActive` en el cuerpo, y volverlo a apagar
   * es una EDICIÓN, no un alta.
   *
   * NO lleva `storeId`: la tienda es la del contexto de la petición, y mandarlo dejaría que un
   * dueño creara repartidores en la tienda de otro.
   */
  async createDeliveryDriver(
    payload: DeliveryDriverPayload,
  ): Promise<BaseResponseModel<DeliveryDriver>> {
    const response = await apiClient.post<BaseResponseModel<DeliveryDriver>>(
      '/v1/delivery-drivers',
      payload,
    );
    return response.data;
  },

  /**
   * Edita nombre, teléfono y el interruptor de activo. Un repartidor de otra tienda responde 404
   * — indistinguible de uno inexistente, que es lo que el aislamiento por tienda quiere.
   *
   * Apagar `isActive` es una BAJA LÓGICA: no borra la fila ni los pedidos que ya llevó.
   */
  async updateDeliveryDriver(
    id: string,
    payload: DeliveryDriverPayload & { isActive: boolean },
  ): Promise<BaseResponseModel<DeliveryDriver>> {
    const response = await apiClient.patch<BaseResponseModel<DeliveryDriver>>(
      `/v1/delivery-drivers/${id}`,
      payload,
    );
    return response.data;
  },
};