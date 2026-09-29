import type { BaseResponseModel } from '@store-mgmt/domain';
import { apiClient } from '~/shared/lib/http/api-client';

export interface StoreUsages {
  storeUsagesCountDays: number[];
  activeStoreCount: number;
  /** Owner display names of the stores used each day, aligned by index with
   * storeUsagesCountDays. Optional: older backends do not send it. */
  ownerNamesPerDay?: string[][];
}

/**
 * The dashboard's day axis is the VIEWER's calendar, so the client sends its own local
 * "today" and the server anchors its dense-bucket window there (client-local-day).
 *
 * Built from local parts on purpose: `toISOString()` would return the UTC date, which is
 * already the NEXT day for the whole evening in any timezone behind UTC (from 19:00 local
 * at UTC-5) — the exact reason a chart used to show a day that had not happened yet.
 * Same shape as `getToday()` in `app/shared/lib/usage/store-usage-tracker.ts`.
 */
export function localToday(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export const usageHttpService = {
  async getStoresLastWeek(today: string = localToday()): Promise<BaseResponseModel<StoreUsages>> {
    const response = await apiClient.get<BaseResponseModel<StoreUsages>>(
      `/v1/usages/stores-last-week?today=${today}`,
    );
    return response.data;
  },

  async getStoresLastMonth(today: string = localToday()): Promise<BaseResponseModel<StoreUsages>> {
    const response = await apiClient.get<BaseResponseModel<StoreUsages>>(
      `/v1/usages/stores-last-month?today=${today}`,
    );
    return response.data;
  },
};
