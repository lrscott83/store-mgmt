import { apiClient } from './api-client';
import type { OfflineRosterBundle } from '~/shared/lib/offline/roster-types';

/**
 * WU14 correction: `GET /v1/storeusers/{storeId}/offline-roster` DOES exist
 * server-side — `StoreUsersController.cs` implements exactly this route.
 * Prefix verified `/v1` (not `/api/v1`), matching `auth-http-service.ts:12`
 * and `user-http-service.ts:39`.
 */
export const rosterHttpService = {
  async getOfflineRoster(storeId: string): Promise<OfflineRosterBundle> {
    const response = await apiClient.get<{ data: OfflineRosterBundle }>(
      `/v1/storeusers/${storeId}/offline-roster`,
    );
    return response.data.data;
  },
};
