import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('~/shared/lib/http/api-client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}));

import { apiClient } from '~/shared/lib/http/api-client';
import { notificationsHttpService } from '../notifications-http-service';

describe('notificationsHttpService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('markAllAsRead calls POST /v1/notifications/mark-all-read', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: { data: 3, succeeded: true } });

    await notificationsHttpService.markAllAsRead();

    expect(apiClient.post).toHaveBeenCalledWith('/v1/notifications/mark-all-read');
  });

  it('markAllAsRead unwraps the number of notifications the backend flipped', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: { data: 3, succeeded: true } });

    const result = await notificationsHttpService.markAllAsRead();

    expect(result.data).toBe(3);
    expect(typeof result.data).toBe('number');
  });
});
