import { describe, expect, it, vi } from 'vitest';
import { createService } from '../service-factory';

interface TestItem {
  id: string;
}

const makeImpl = (tag: string) => ({
  tag,
  getAll: vi.fn(() => [] as TestItem[]),
  getById: vi.fn((_id: string) => undefined as TestItem | undefined),
  create: vi.fn((item: TestItem) => item),
  update: vi.fn((item: TestItem) => item),
  delete: vi.fn((_id: string) => undefined),
});

describe('ServiceFactory', () => {
  describe('OFFL-02: Factory returns offline service by default', () => {
    it('returns offline impl when USE_ONLINE_SERVICE is false', async () => {
      vi.doMock('~/shared/lib/config/global-config', () => ({
        GlobalConfig: { USE_ONLINE_SERVICE: false },
      }));

      const { createService: cs } = await import('../service-factory');
      const offline = makeImpl('offline');
      const online = makeImpl('online');
      const service = cs(offline, online);
      service.getAll();
      expect(offline.getAll).toHaveBeenCalledOnce();
      expect(online.getAll).not.toHaveBeenCalled();
    });

    it('createService returns the offline instance (not online) when USE_ONLINE_SERVICE is false', () => {
      const offline = makeImpl('offline');
      const online = makeImpl('online');
      const service = createService(offline, online);
      service.getAll();
      expect(offline.getAll).toHaveBeenCalled();
    });
  });
});
