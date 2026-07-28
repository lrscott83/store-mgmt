import { apiClient } from './api-client';
import type { OfflineRosterBundle } from '~/shared/lib/offline/roster-types';

/**
 * BLOCKED-for-verification (design "Honesty" section): `GET
 * /v1/storeusers/{storeId}/offline-roster` does not exist server-side yet
 * (§7a, 0% implemented). This service is buildable and unit-testable
 * against a mocked transport ONLY — the real response envelope, DTO field
 * casing, and whether `users[].verifier` exists at all remain unverified
 * until the backend ships. Prefix verified `/v1` (not `/api/v1`), matching
 * `auth-http-service.ts:12` and `user-http-service.ts:39`.
 */
export const rosterHttpService = {
  async getOfflineRoster(storeId: string): Promise<OfflineRosterBundle> {
    const response = await apiClient.get<{ data: OfflineRosterBundle }>(
      `/v1/storeusers/${storeId}/offline-roster`,
    );
    return response.data.data;
  },
};
