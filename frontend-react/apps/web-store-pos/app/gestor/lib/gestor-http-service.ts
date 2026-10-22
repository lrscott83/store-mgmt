import type {
  BaseResponseModel,
  Currency,
  SalesCommissionStatus,
  SalesCommissionType,
} from '@store-mgmt/domain';
import type { OnlineOrderStatus } from '~/sales/lib/services/ordering-http-service';
import { apiClient } from '~/shared/lib/http/api-client';

/** Espejo de `Application.Dtos.SalesManagers.SalesManagerOrderDto`. */
export interface GestorOrder {
  orderId: string;
  code: string | null;
  storeId: string;
  storeName: string;
  status: OnlineOrderStatus;
  date: string;
  total: number;
  currency: Currency;
  itemsCount: number;
}

/** Espejo de `Application.Dtos.SalesManagers.SalesManagerCommissionDto`. */
export interface GestorCommission {
  id: string;
  orderId: string;
  orderCode: string | null;
  orderDate: string;
  storeId: string;
  storeName: string;
  productName: string;
  quantity: number;
  type: SalesCommissionType;
  value: number;
  unitPrice: number;
  amount: number;
  currency: Currency;
  status: SalesCommissionStatus;
  paidAt: string | null;
  paymentNote: string | null;
}

/** Espejo de `Application.Dtos.SalesManagers.SalesManagerCatalogDto`. */
export interface GestorCatalog {
  storeId: string;
  storeName: string;
  catalogSlug: string;
}

/**
 * Vista del gestor (T9). El backend autoriza por el rol Owner-level `GestorVentas`; esta capa
 * solo transporta. Ningún dato de otro gestor ni de otro Owner sale por estos endpoints.
 */
export const gestorHttpService = {
  async getOrders(): Promise<BaseResponseModel<GestorOrder[]>> {
    const response = await apiClient.get<BaseResponseModel<GestorOrder[]>>(
      '/v1/sales-managers/orders',
    );
    return response.data;
  },

  async getCommissions(): Promise<BaseResponseModel<GestorCommission[]>> {
    const response = await apiClient.get<BaseResponseModel<GestorCommission[]>>(
      '/v1/sales-managers/commissions',
    );
    return response.data;
  },

  async getStores(): Promise<BaseResponseModel<GestorCatalog[]>> {
    const response = await apiClient.get<BaseResponseModel<GestorCatalog[]>>(
      '/v1/sales-managers/stores',
    );
    return response.data;
  },
};
