import { describe, it, expect, vi } from 'vitest';

vi.mock('~/shared/lib/http/api-client', () => ({
  apiClient: { get: vi.fn() },
}));

import { apiClient } from '~/shared/lib/http/api-client';
import { rosterHttpService } from '../roster-http-service';

// BLOCKED-for-verification (design "Honesty" section, tasks.md Task 10):
// `GET /v1/storeusers/{storeId}/offline-roster` does not exist server-side
// (§7a, 0% implemented). This test proves ONLY the URL called and the
// `response.data.data` unwrapping against a MOCKED transport — the real
// response envelope, DTO casing, and whether `users[].verifier` exists at
// all remain unverified until the backend ships.
describe('rosterHttpService.getOfflineRoster — unit-level only (BLOCKED-for-verification)', () => {
  it('calls the /v1 (not /api/v1) endpoint and unwraps response.data.data', async () => {
    const bundle = {
      bundleId: 'b1',
      issuedAt: 1000,
      expiresAt: 2_000_000_000_000,
      formatVersion: 1,
      storeId: 's1',
      users: [],
    };
    vi.mocked(apiClient.get).mockResolvedValue({ data: { data: bundle, succeeded: true } });

    const result = await rosterHttpService.getOfflineRoster('s1');

    expect(apiClient.get).toHaveBeenCalledWith('/v1/storeusers/s1/offline-roster');
    expect(result).toEqual(bundle);
  });

  // WU14 (regression coverage, not new behavior): the HTTP unwrapping has
  // no notion of formatVersion — same case as above with a v2 bundle
  // carrying the three wrap fields per user.
  it('unwraps a v2 bundle (with per-user wrap fields) the same way (WU14 regression coverage)', async () => {
    const bundle = {
      bundleId: 'b1',
      issuedAt: 1000,
      expiresAt: 2_000_000_000_000,
      formatVersion: 2,
      storeId: 's1',
      users: [
        {
          id: 'u1',
          login: 'ana',
          wrappedDek: 'ct',
          wrapSalt: 'salt',
          wrapIv: 'iv',
        },
      ],
    };
    vi.mocked(apiClient.get).mockResolvedValue({ data: { data: bundle, succeeded: true } });

    const result = await rosterHttpService.getOfflineRoster('s1');

    expect(apiClient.get).toHaveBeenCalledWith('/v1/storeusers/s1/offline-roster');
    expect(result).toEqual(bundle);
  });
});
