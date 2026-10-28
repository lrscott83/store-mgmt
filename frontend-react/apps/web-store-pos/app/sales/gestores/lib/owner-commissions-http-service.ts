import type {
  BaseResponseModel,
  Currency,
  SalesCommissionStatus,
  SalesCommissionType,
} from '@store-mgmt/domain';
import { apiClient } from '~/shared/lib/http/api-client';

/** Espejo de `Application.Dtos.SalesManagers.OwnerSalesCommissionDto` (T10). */
export interface OwnerSalesCommission {
  id: string;
  salesManagerId: string;
  salesManagerName: string;
  salesManagerLogin: string;
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

/** Espejo de `Application.Dtos.SalesManagers.SalesManagerDto` (subset usado en el filtro). */
export interface SalesManagerOption {
  id: string;
  userId: string;
  login: string;
  fullName: string;
  cellPhone?: string | null;
  email?: string | null;
  isActive: boolean;
}

export interface OwnerCommissionFilter {
  status?: SalesCommissionStatus;
  salesManagerId?: string;
}

/**
 * T10: el Owner lista las comisiones de sus gestores y registra el pago completo (T7). El
 * backend exige OwnerAdmin; esta capa solo transporta.
 */
export const ownerCommissionsHttpService = {
  async list(filter: OwnerCommissionFilter = {}): Promise<BaseResponseModel<OwnerSalesCommission[]>> {
    const params: Record<string, string | number> = {};
    if (filter.status !== undefined) params['status'] = filter.status;
    if (filter.salesManagerId) params['salesManagerId'] = filter.salesManagerId;

    const response = await apiClient.get<BaseResponseModel<OwnerSalesCommission[]>>(
      '/v1/SalesCommissions',
      { params },
    );
    return response.data;
  },

  async pay(id: string, note?: string): Promise<BaseResponseModel<boolean>> {
    const response = await apiClient.post<BaseResponseModel<boolean>>(
      `/v1/SalesCommissions/${encodeURIComponent(id)}/pay`,
      { note: note ?? null },
    );
    return response.data;
  },

  async getManagers(): Promise<BaseResponseModel<SalesManagerOption[]>> {
    const response = await apiClient.get<BaseResponseModel<SalesManagerOption[]>>(
      '/v1/SalesManagers/all/true',
    );
    return response.data;
  },
};
