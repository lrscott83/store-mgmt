import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

// ── pos-client-error-logs S2/S3 (U4 finding 3) ──────────────────────────────
// The hook is the TRIGGER: it decides WHEN the buffered errors are published.
// `client-error-publisher.test.ts` pins what is published; this file pins the
// three trigger edges the publisher tests cannot see:
//  - it publishes once on mount while online + authenticated
//  - it publishes again every time connectivity flips back to online
//  - it publishes on the interval while online, and the interval is cleared on
//    unmount (nothing is published after the component goes away)

const { publishMock } = vi.hoisted(() => ({ publishMock: vi.fn() }));

vi.mock('../client-error-publisher', () => ({
  CLIENT_ERROR_PUBLISH_INTERVAL_MS: 60_000,
  publishClientErrorLogs: publishMock,
}));

// Fake persisted session: the hook reads the PERSISTED session, never the auth
// store (see the hook's docblock for why it must stay a leaf module).
vi.mock('~/shared/lib/auth/storage-service', () => ({
  StorageService: {
    getTokenFromLocalStorage: () => 'fake-token',
    getCurrentUser: () => ({ selectedStoreId: 'store-1' }),
  },
}));

import { useClientErrorPublisher } from '../use-client-error-publisher';

let onlineValue = true;

function setNavigatorOnline(value: boolean): void {
  onlineValue = value;
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    get: () => onlineValue,
  });
}

describe('useClientErrorPublisher — U3: publish triggers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    publishMock.mockResolvedValue(undefined);
    setNavigatorOnline(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    // Drop the own property so jsdom's own `onLine` getter (true) is back.
    Reflect.deleteProperty(window.navigator, 'onLine');
  });

  it('publishes once on mount with the online + authenticated gates and the selected store', () => {
    renderHook(() => useClientErrorPublisher());

    expect(publishMock).toHaveBeenCalledTimes(1);
    expect(publishMock).toHaveBeenCalledWith({
      online: true,
      authenticated: true,
      storeId: 'store-1',
    });
  });

  it('publishes again when connectivity flips back to online', () => {
    setNavigatorOnline(false);

    renderHook(() => useClientErrorPublisher());
    expect(publishMock).not.toHaveBeenCalled();

    setNavigatorOnline(true);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    expect(publishMock).toHaveBeenCalledTimes(1);
    expect(publishMock.mock.calls[0]![0]).toMatchObject({ online: true, authenticated: true });
  });

  it('publishes on the interval while the device stays online', () => {
    vi.useFakeTimers();
    renderHook(() => useClientErrorPublisher());
    publishMock.mockClear();

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(publishMock).toHaveBeenCalledTimes(1);
  });

  it('clears the interval on unmount (no publish after unmount)', () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() => useClientErrorPublisher());
    publishMock.mockClear();

    unmount();
    act(() => {
      vi.advanceTimersByTime(5 * 60_000);
    });

    expect(publishMock).not.toHaveBeenCalled();
  });
});
