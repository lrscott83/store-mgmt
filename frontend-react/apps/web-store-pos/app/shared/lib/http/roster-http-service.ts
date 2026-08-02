import type { BaseResponseModel } from '@store-mgmt/domain';
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
    const response = await apiClient.get<BaseResponseModel<OfflineRosterBundle>>(
      `/v1/storeusers/${storeId}/offline-roster`,
    );
    // `ExportOfflineRosterAsync` wraps its result in an unconditional `Ok(...)`,
    // exactly like `GetMeAsync` does. The handler has no failure path today, so
    // this guard is currently unreachable — but the hand-rolled `{ data: X }`
    // this replaces gave a future failure nowhere to surface, and that is how
    // the same defect reached production on `/auth/me`.
    if (!response.data.succeeded) {
      throw new Error(
        response.data.errors[0]?.description ?? 'The offline roster could not be exported',
      );
    }
    return response.data.data;
  },
};
