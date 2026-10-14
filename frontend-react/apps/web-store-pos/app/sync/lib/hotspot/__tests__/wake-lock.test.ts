import { describe, it, expect, vi, afterEach } from 'vitest';
import { acquireWakeLock } from '../wake-lock';

function stubWakeLock(value: unknown) {
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, value });
}

describe('acquireWakeLock', () => {
  afterEach(() => {
    stubWakeLock(undefined);
  });

  it('requests a screen lock and exposes its release', async () => {
    const release = vi.fn(async () => {});
    const request = vi.fn(async () => ({ release }));
    stubWakeLock({ request });

    const handle = await acquireWakeLock();

    expect(request).toHaveBeenCalledWith('screen');
    await handle?.release();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('returns null when the API is unavailable', async () => {
    stubWakeLock(undefined);
    await expect(acquireWakeLock()).resolves.toBeNull();
  });

  it('returns null when the lock is refused', async () => {
    stubWakeLock({ request: vi.fn().mockRejectedValue(new Error('denied')) });
    await expect(acquireWakeLock()).resolves.toBeNull();
  });
});
