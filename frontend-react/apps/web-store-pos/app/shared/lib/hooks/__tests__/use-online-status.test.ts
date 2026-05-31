import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ── HOOK-1 through HOOK-3, S-HOOK-1 ─────────────────────────────────────────

describe('useOnlineStatus — HOOK-1: initial value from navigator.onLine', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });

  it('returns true when navigator.onLine is true', async () => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    const { useOnlineStatus } = await import('../use-online-status');
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);
  });

  it('returns false when navigator.onLine is false', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    const { useOnlineStatus } = await import('../use-online-status');
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(false);
  });
});

describe('useOnlineStatus — HOOK-2: reacts to online/offline events', () => {
  afterEach(() => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });

  it('becomes false when offline event fires', async () => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    const { useOnlineStatus } = await import('../use-online-status');
    const { result } = renderHook(() => useOnlineStatus());

    expect(result.current).toBe(true);

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    expect(result.current).toBe(false);
  });

  it('becomes true again when online event fires after going offline', async () => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    const { useOnlineStatus } = await import('../use-online-status');
    const { result } = renderHook(() => useOnlineStatus());

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current).toBe(false);

    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(result.current).toBe(true);
  });
});

describe('useOnlineStatus — HOOK-3: listeners removed on unmount (S-HOOK-1)', () => {
  it('removes both event listeners when component unmounts', async () => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

    const { useOnlineStatus } = await import('../use-online-status');
    const { unmount } = renderHook(() => useOnlineStatus());

    unmount();

    const removedEvents = removeEventListenerSpy.mock.calls.map((c) => c[0]);
    expect(removedEvents).toContain('online');
    expect(removedEvents).toContain('offline');
  });
});
