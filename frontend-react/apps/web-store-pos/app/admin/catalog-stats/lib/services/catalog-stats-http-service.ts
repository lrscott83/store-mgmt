import type { BaseResponseModel } from '@store-mgmt/domain';
import { apiClient } from '~/shared/lib/http/api-client';

/** Espejo de `CatalogSource` del backend, por VALOR. */
export enum CatalogSourceKind {
  Direct = 0,
  WhatsApp = 1,
  Instagram = 2,
  Facebook = 3,
  Google = 4,
  OtherSearch = 5,
  Referral = 6,
  Campaign = 7,
}

export interface CatalogStatsSource {
  source: CatalogSourceKind;
  visits: number;
}

export interface CatalogStatsProduct {
  productId: string;
  name: string;
  views: number;
}

export interface CatalogStatsDay {
  day: string;
  visits: number;
}

/** Espejo de `CatalogStatsDto` (GET /v1/stores/{storeId}/catalog-stats). */
export interface CatalogStats {
  days: number;
  visits: number;
  visitors: number;
  pageViews: number;
  orders: number;
  /** Pedidos / visitas. 0 cuando no hubo visitas. */
  conversionRate: number;
  sources: CatalogStatsSource[];
  topProducts: CatalogStatsProduct[];
  daily: CatalogStatsDay[];
}

/** Espejo de `CatalogStoreStatsDto`: una tienda con visitas en el periodo. */
export interface CatalogStoreStats {
  storeId: string;
  name: string;
  visits: number;
}

/**
 * Espejo de `CatalogStatsOverviewDto` (GET /v1/stores/catalog-stats): el agregado de todas las
 * tiendas (`totals`) y SOLO las tiendas con visitas en el periodo (`stores`).
 */
export interface CatalogStatsOverview {
  totals: CatalogStats;
  stores: CatalogStoreStats[];
}

export const catalogStatsHttpService = {
  async getOverview(days: number): Promise<BaseResponseModel<CatalogStatsOverview>> {
    const response = await apiClient.get<BaseResponseModel<CatalogStatsOverview>>(
      '/v1/stores/catalog-stats',
      { params: { days } },
    );
    return response.data;
  },

  async getStats(storeId: string, days: number): Promise<BaseResponseModel<CatalogStats>> {
    const response = await apiClient.get<BaseResponseModel<CatalogStats>>(
      `/v1/stores/${storeId}/catalog-stats`,
      { params: { days } },
    );
    return response.data;
  },
};
