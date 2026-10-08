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

// --- Gestión de pedidos (F5): estados, pago, modalidad y repartidores ---------------------------
//
// Los enums se replican POR VALOR del backend (`Domain/Common/Enums/Order*.cs`), no por nombre:
// la API no registra `JsonStringEnumConverter`, así que viaja el NÚMERO en el cuerpo y en los
// filtros de la query. El nombre (`New`, `Accepted`, ...) es lo que se muestra al usuario, vía los
// `ORDERING_ORDERS.STATUS_*` de i18n. Reordenar o reutilizar un valor rompería datos históricos,
// igual que en `Currency` del paquete de dominio.

/** Espejo de `Domain.Common.Enums.OrderStatus`. Sin estado "En camino" (D18). */
export enum OnlineOrderStatus {
  New = 0,
  Accepted = 1,
  Preparing = 2,
  Ready = 3,
  Delivered = 4,
  Cancelled = 5,
}

/** Espejo de `Domain.Common.Enums.OrderPaymentStatus`. Eje INDEPENDIENTE del estado (D3/D12). */
export enum OnlineOrderPaymentStatus {
  Pending = 0,
  Paid = 1,
}

/** Espejo de `Domain.Common.Enums.OrderDeliveryType`. */
export enum OnlineOrderDeliveryType {
  Pickup = 0,
  Delivery = 1,
}

/**
 * Fila de la tabla de pedidos (F5). Espejo de `OnlineOrderListItemDto`. NO trae `StoreId` (la lista
 * es siempre de la tienda de la sesión) ni `StoreId` del repartidor: el selector no lo necesita.
 */
export interface OnlineOrderListItem {
  id: string;
  /** Código público dictado por WhatsApp. null en ventas del POS. */
  code: string | null;
  customerName: string | null;
  customerPhone: string | null;
  deliveryType: OnlineOrderDeliveryType;
  total: number;
  currency: number;
  status: OnlineOrderStatus;
  paymentStatus: OnlineOrderPaymentStatus;
  /** Repartidor asignado. null mientras nadie lo asigne. */
  driverId: string | null;
  /** Nombre YA resuelto por el servidor: la tabla lo pinta sin una segunda consulta por fila. */
  driverName: string | null;
  date: string;
}

/**
 * Los siete filtros del listado, más la paginación. Todos opcionales y combinados con Y; sin
 * ninguno sin usar la consulta no cambia. Los nombres son los de la URL (`GetOrdersAsync` los
 * declara uno a uno como `[FromQuery]`).
 */
export interface OnlineOrderFilters {
  status?: OnlineOrderStatus;
  paymentStatus?: OnlineOrderPaymentStatus;
  deliveryType?: OnlineOrderDeliveryType;
  driverId?: string;
  from?: string;
  to?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

/** Página de pedidos: `total` es el TOTAL FILTRADO, no el de la tienda (F5, T1). */
export interface OnlineOrderPage {
  items: OnlineOrderListItem[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Repartidor para el selector y el filtro por repartidor. Espejo del DTO de F7
 * (`GET /v1/delivery-drivers?activeOnly=true`). `phone` es opcional porque la vista solo pinta el
 * nombre; `isActive` viaja porque el endpoint sin `activeOnly` también los devuelve.
 */
export interface DeliveryDriverOption {
  id: string;
  name: string;
  phone?: string | null;
  isActive?: boolean;
}

// --- Métricas de ventas (F6): el agregado del rango y su desglose ------------------------------
//
// El agregado se calcula ENTERO en el servidor (`IOrderRepository.GetStatsByStoreIdAsync`, un solo
// `Count`/`Sum`/`GroupBy` en la base). Por eso NO hay `page`/`pageSize` en estos filtros: paginar un
// agregado no tiene sentido, y un `page` colado aquí se ignoraría en silencio.

/**
 * Filtros del agregado. Son un SUB-CONJUNTO de los del listado (`OnlineOrderFilters`) y a propósito
 * NO llevan `page`, `pageSize`, `search` ni `driverId`: el endpoint los declara uno a uno y solo
 * acepta estos cinco, así que inventar los otros aquí sería mandar parámetros que nadie lee.
 */
export interface OnlineOrderStatsFilters {
  status?: OnlineOrderStatus;
  paymentStatus?: OnlineOrderPaymentStatus;
  deliveryType?: OnlineOrderDeliveryType;
  from?: string;
  to?: string;
}

/** Conteo por estado. Espejo de `OnlineOrderStatusCountDto`: el enum por VALOR, como el resto. */
export interface OnlineOrderStatusCount {
  status: OnlineOrderStatus;
  count: number;
}

/** Conteo por modalidad. Espejo de `OnlineOrderDeliveryTypeCountDto`. */
export interface OnlineOrderDeliveryTypeCount {
  deliveryType: OnlineOrderDeliveryType;
  count: number;
}

/**
 * Métricas de los pedidos de la tienda en un rango (F6). Espejo de `OnlineOrderStatsDto`.
 *
 * `totalSales`, `averageTicket` y los cuatro campos de pago excluyen los CANCELADOS a propósito: un
 * cancelado no es venta ni es deuda. `ordersCount` y los dos desgloses sí los cuentan —los desgloses
 * son el ÚNICO sitio donde se ven— y por eso ambos suman `ordersCount`.
 *
 * `nonCancelledCount` viaja solo para poder verificar la regla desde el cliente: si
 * `averageTicket != totalSales / ordersCount`, hay cancelados, y sin este campo eso no se podría
 * distinguir de un agregado mal calculado.
 */
export interface OnlineOrderStats {
  ordersCount: number;
  nonCancelledCount: number;
  totalSales: number;
  averageTicket: number;
  paidCount: number;
  paidAmount: number;
  pendingCount: number;
  pendingAmount: number;
  /** Los seis estados en el orden del enum, con un 0 por cada estado sin pedidos del rango. */
  byStatus: OnlineOrderStatusCount[];
  /** Pickup y Delivery en el orden del enum, con un 0 por cada modalidad sin pedidos. */
  byDeliveryType: OnlineOrderDeliveryTypeCount[];
  /**
   * Moneda de TODOS los importes de esta respuesta, y es del conjunto: sale de los pedidos NO
   * cancelados del rango (A3 eliminada: no hay moneda configurable). Viaja como NÚMERO, no como
   * `"CUP"`, porque la API no registra `JsonStringEnumConverter` — el formateador de importes
   * (`formatMoneyWithCurrency`) ya pide el valor del enum.
   */
  currency: number;
}

/**
 * Transiciones alcanzables desde un estado — MISMA tabla que `Order.AllowedTransitionsFrom` (F2).
 *
 * Se replica aquí, no en el backend, para que la vista OFREZCA solo lo que el servidor aceptaría:
 * un botón que el servidor va a rechazar con un 400 es una trampa para quien opera la tienda. El
 * servidor sigue siendo la autoridad (`Order.ChangeStatus` es la única puerta): esta tabla decide
 * qué se PINTA, no qué se aplica. Los estados terminales no tienen salida.
 */
export const ORDER_STATUS_TRANSITIONS: Readonly<
  Record<OnlineOrderStatus, readonly OnlineOrderStatus[]>
> = {
  [OnlineOrderStatus.New]: [OnlineOrderStatus.Accepted, OnlineOrderStatus.Cancelled],
  [OnlineOrderStatus.Accepted]: [OnlineOrderStatus.Preparing, OnlineOrderStatus.Cancelled],
  [OnlineOrderStatus.Preparing]: [OnlineOrderStatus.Ready, OnlineOrderStatus.Cancelled],
  [OnlineOrderStatus.Ready]: [OnlineOrderStatus.Delivered, OnlineOrderStatus.Cancelled],
  [OnlineOrderStatus.Delivered]: [],
  [OnlineOrderStatus.Cancelled]: [],
};

/**
 * Endpoints de gestión de la configuración de pedidos (módulo 18, F1) y de la gestión de los
 * pedidos mismos (F5). El gate real vive en el backend: la configuración exige
 * `[HasPermission(StoreRoleFeatures.WebCatalogAdmin)]` (feature 122, solo OwnerAdmin) y la gestión
 * de pedidos `[HasPermission(StoreRoleFeatures.OnlineOrdersAdmin)]` (feature 123, OwnerAdmin +
 * StoreUser) — aquí solo se hablan las rutas.
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

  // --- Gestión de pedidos (F5) ---------------------------------------------------------------

  /**
   * Listado paginado y filtrado de los pedidos de la tienda de la sesión. Los filtros sin usar NO
   * viajan: mandarlos como `''` sería un predicado `Contains("")` en PostgreSQL, que coincide con
   * todo el histórico. Por eso el servicio quita los vacíos en vez de confiar en el llamador.
   */
  async listOrders(filters: OnlineOrderFilters = {}): Promise<BaseResponseModel<OnlineOrderPage>> {
    const params = withoutEmptyFilters(filters);
    const response = await apiClient.get<BaseResponseModel<OnlineOrderPage>>('/v1/online-orders', {
      params,
    });
    return response.data;
  },

  /** Mueve el pedido por la tabla de estados (F2). El servidor rechaza las transiciones inválidas. */
  async updateStatus(
    id: string,
    status: OnlineOrderStatus,
  ): Promise<BaseResponseModel<boolean>> {
    const response = await apiClient.patch<BaseResponseModel<boolean>>(
      `/v1/online-orders/${id}/status`,
      { status },
    );
    return response.data;
  },

  /** Marca el pago a mano. NO mueve el estado: el pago es un eje independiente (D3/D12). */
  async updatePayment(
    id: string,
    paymentStatus: OnlineOrderPaymentStatus,
  ): Promise<BaseResponseModel<boolean>> {
    const response = await apiClient.patch<BaseResponseModel<boolean>>(
      `/v1/online-orders/${id}/payment`,
      { paymentStatus },
    );
    return response.data;
  },

  /** Asigna el repartidor; `null` lo desasigna. El servidor exige que sea de la tienda y activo. */
  async assignDriver(id: string, driverId: string | null): Promise<BaseResponseModel<boolean>> {
    const response = await apiClient.patch<BaseResponseModel<boolean>>(
      `/v1/online-orders/${id}/driver`,
      { driverId },
    );
    return response.data;
  },

  /**
   * Repartidores activos para el selector y el filtro (F7). Es un endpoint de OTRA feature: si
   * todavía no está desplegado responde 404 y esta vista tiene que seguir funcionando, así que el
   * fallo se devuelve como lista vacía y quien llama decide avisar. Nunca lanza.
   */
  async listActiveDrivers(): Promise<DeliveryDriverOption[]> {
    try {
      const response = await apiClient.get<BaseResponseModel<DeliveryDriverOption[]>>(
        '/v1/delivery-drivers',
        { params: { activeOnly: true } },
      );
      return response.data.succeeded ? (response.data.data ?? []) : [];
    } catch {
      return [];
    }
  },

  /**
   * Métricas de los pedidos de la tienda en un rango (F6, vista "Ventas"). Comparte la MISMA tabla
   * y el mismo rango de fechas que el listado, pero agregado: sin `page`, y sin `search` ni
   * `driverId` porque el endpoint no los declara.
   *
   * A diferencia de `listActiveDrivers`, aquí NO se traga el fallo: quien llama es la vista, que
   * degrada la cabecera y conserva el historial, y esa decisión necesita ver el error.
   */
  async getSalesStats(
    filters: OnlineOrderStatsFilters = {},
  ): Promise<BaseResponseModel<OnlineOrderStats>> {
    const params = withoutEmptyFilters(filters);
    const response = await apiClient.get<BaseResponseModel<OnlineOrderStats>>(
      '/v1/online-orders/stats',
      { params },
    );
    return response.data;
  },
};

/**
 * Deja fuera los filtros sin usar. Un `''` o un `undefined` NO debe viajar: el backend trata el
 * texto en blanco como "sin filtro" en `search`, pero un `status=` vacío en la query es un
 * `Enum.Parse` que el binder resuelve a null — y en `from`/`to` una cadena vacía NO es null. Lo
 * que no se manda, no filtra; lo que se manda en blanco, filtra por algo que nadie pidió.
 */
function withoutEmptyFilters(filters: OnlineOrderFilters): Record<string, string | number> {
  const params: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    params[key] = value;
  }
  return params;
}