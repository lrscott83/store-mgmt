import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { UserModel } from '@store-mgmt/domain';

// ── USAGE-HOOK-1/2 (Stage 6 Slice C — navigation-triggered tracker) ─────────
// Wires `registerStoreActivity` to route navigation, matching Angular's
// `router.events.pipe(filter(NavigationEnd))` subscription.
//
// USAGE-HOOK-4 (store-usage-tracker re-arm fix, 2026-09-14): the hook ALSO
// stamps on pointer/keyboard activity (throttled per userId:storeId), gates
// everything on `isTrackingReady()` (readiness, NOT the old armed-only flag —
// a persisted session re-arms the tracker after a reload), and flushes pending
// days through `flushUsage` as soon as a valid tracking context exists.

const registerStoreActivityMock = vi.fn();
const cleanOldStoreUsageMock = vi.fn();
const isTrackingReadyMock = vi.fn();
const flushUsageMock = vi.fn();
vi.mock('~/shared/lib/usage/store-usage-tracker', () => ({
  registerStoreActivity: registerStoreActivityMock,
  cleanOldStoreUsage: cleanOldStoreUsageMock,
  isTrackingReady: isTrackingReadyMock,
  flushUsage: flushUsageMock,
}));

function makeUser(overrides: Partial<UserModel> = {}): UserModel {
  return {
    id: 'user-1',
    fullName: 'Test User',
    email: 'test@example.com',
    cellPhone: '',
    isActive: true,
    password: '',
    login: 'test@example.com',
    authToken: 'token123',
    refreshToken: 'refresh123',
    expiresIn: Date.now() + 1000 * 60 * 60,
    roles: [],
    featureIds: [],
    storeModuleIds: [],
    isSuperAdmin: false,
    isOwnerAdmin: false,
    isReSeller: false,
    selectedStoreId: 'store-1',
    paymentDueDate: null,
    isInTrial: false,
    paymentStatus: 'NoAplica',
    ...overrides,
  };
}

describe('useStoreUsageTracker — USAGE-HOOK-1: registers activity when authenticated AND ready', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls registerStoreActivity with userId + selectedStoreId on mount when ready', async () => {
    isTrackingReadyMock.mockReturnValue(true);
    const { useAuthStore } = await import('~/shared/lib/stores/auth-store');
    useAuthStore.setState({ user: makeUser(), isAuthenticated: true });

    const { useStoreUsageTracker } = await import('../use-store-usage-tracker');
    renderHook(() => useStoreUsageTracker(), { wrapper: MemoryRouter });

    expect(registerStoreActivityMock).toHaveBeenCalledWith('user-1', 'store-1');
  });

  // Readiness re-arm (USAGE-8): the gate is no longer the exclusive `armed`
  // flag — after a reload with a valid persisted session the tracker works
  // again, so "not ready" (not merely "not armed") is what blocks.
  it('does NOT call registerStoreActivity when authenticated but NOT ready', async () => {
    isTrackingReadyMock.mockReturnValue(false);
    const { useAuthStore } = await import('~/shared/lib/stores/auth-store');
    useAuthStore.setState({ user: makeUser(), isAuthenticated: true });

    const { useStoreUsageTracker } = await import('../use-store-usage-tracker');
    renderHook(() => useStoreUsageTracker(), { wrapper: MemoryRouter });

    expect(registerStoreActivityMock).not.toHaveBeenCalled();
    expect(flushUsageMock).not.toHaveBeenCalled();
  });

  it('does not call registerStoreActivity when unauthenticated', async () => {
    isTrackingReadyMock.mockReturnValue(true);
    const { useAuthStore } = await import('~/shared/lib/stores/auth-store');
    useAuthStore.setState({ user: null, isAuthenticated: false });

    const { useStoreUsageTracker } = await import('../use-store-usage-tracker');
    renderHook(() => useStoreUsageTracker(), { wrapper: MemoryRouter });

    expect(registerStoreActivityMock).not.toHaveBeenCalled();
    expect(flushUsageMock).not.toHaveBeenCalled();
  });
});

// ── USAGE-HOOK-4 (activity stamping): a user working a single screen all day
// (no navigation) must still be stamped. Window listeners attach/detach on
// mount/unmount; stamps are throttled to one per 5 minutes per context.

describe('useStoreUsageTracker — USAGE-HOOK-4: stamps on pointer/keyboard activity, throttled', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isTrackingReadyMock.mockReturnValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('registers activity on a keyboard interaction (first event of the window)', async () => {
    const { useAuthStore } = await import('~/shared/lib/stores/auth-store');
    useAuthStore.setState({ user: makeUser(), isAuthenticated: true });

    const { useStoreUsageTracker } = await import('../use-store-usage-tracker');
    renderHook(() => useStoreUsageTracker(), { wrapper: MemoryRouter });
    // Drop the mount-time navigation stamp so only activity-driven calls count.
    registerStoreActivityMock.mockClear();

    window.dispatchEvent(new Event('keydown'));
    expect(registerStoreActivityMock).toHaveBeenCalledTimes(1);
    expect(registerStoreActivityMock).toHaveBeenCalledWith('user-1', 'store-1');
  });

  it('throttles repeated activity within the 5-minute window (one stamp per context)', async () => {
    const { useAuthStore } = await import('~/shared/lib/stores/auth-store');
    useAuthStore.setState({ user: makeUser(), isAuthenticated: true });

    const { useStoreUsageTracker } = await import('../use-store-usage-tracker');
    renderHook(() => useStoreUsageTracker(), { wrapper: MemoryRouter });
    registerStoreActivityMock.mockClear();

    window.dispatchEvent(new Event('pointerdown'));
    window.dispatchEvent(new Event('pointerdown'));
    window.dispatchEvent(new Event('keydown'));
    expect(registerStoreActivityMock).toHaveBeenCalledTimes(1);
  });

  it('stamps again after the throttle window elapses (same context)', async () => {
    vi.useFakeTimers();
    const { useAuthStore } = await import('~/shared/lib/stores/auth-store');
    useAuthStore.setState({ user: makeUser(), isAuthenticated: true });

    const { useStoreUsageTracker } = await import('../use-store-usage-tracker');
    renderHook(() => useStoreUsageTracker(), { wrapper: MemoryRouter });
    registerStoreActivityMock.mockClear();

    window.dispatchEvent(new Event('pointerdown'));
    expect(registerStoreActivityMock).toHaveBeenCalledTimes(1);

    // 5-minute throttle window (STORE_USAGE_ACTIVITY_THROTTLE_MS) + 1ms.
    vi.advanceTimersByTime(5 * 60_000 + 1);
    window.dispatchEvent(new Event('keydown'));
    expect(registerStoreActivityMock).toHaveBeenCalledTimes(2);
  });

  it('does not attach listeners (no anonymous telemetry) without a valid user + store', async () => {
    const { useAuthStore } = await import('~/shared/lib/stores/auth-store');
    useAuthStore.setState({ user: null, isAuthenticated: false });

    const { useStoreUsageTracker } = await import('../use-store-usage-tracker');
    renderHook(() => useStoreUsageTracker(), { wrapper: MemoryRouter });
    registerStoreActivityMock.mockClear();

    window.dispatchEvent(new Event('pointerdown'));
    window.dispatchEvent(new Event('keydown'));
    expect(registerStoreActivityMock).not.toHaveBeenCalled();
    expect(flushUsageMock).not.toHaveBeenCalled();
  });

  it('detaches the activity listeners on unmount', async () => {
    const { useAuthStore } = await import('~/shared/lib/stores/auth-store');
    useAuthStore.setState({ user: makeUser(), isAuthenticated: true });

    const { useStoreUsageTracker } = await import('../use-store-usage-tracker');
    const { unmount } = renderHook(() => useStoreUsageTracker(), { wrapper: MemoryRouter });
    unmount();
    registerStoreActivityMock.mockClear();

    window.dispatchEvent(new Event('pointerdown'));
    window.dispatchEvent(new Event('keydown'));
    expect(registerStoreActivityMock).not.toHaveBeenCalled();
  });
});

// ── USAGE-HOOK-5 (USAGE-10/readiness flush): pending unsaved days are flushed
// the moment a valid tracking context exists — not only after navigation.

describe('useStoreUsageTracker — USAGE-HOOK-5: flushes pending days on readiness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls flushUsage with the hydrated userId when ready on mount', async () => {
    isTrackingReadyMock.mockReturnValue(true);
    const { useAuthStore } = await import('~/shared/lib/stores/auth-store');
    useAuthStore.setState({ user: makeUser(), isAuthenticated: true });

    const { useStoreUsageTracker } = await import('../use-store-usage-tracker');
    renderHook(() => useStoreUsageTracker(), { wrapper: MemoryRouter });

    expect(flushUsageMock).toHaveBeenCalledWith('user-1');
  });

  it('does NOT call flushUsage when not ready (no persisted session / not armed)', async () => {
    isTrackingReadyMock.mockReturnValue(false);
    const { useAuthStore } = await import('~/shared/lib/stores/auth-store');
    useAuthStore.setState({ user: makeUser(), isAuthenticated: true });

    const { useStoreUsageTracker } = await import('../use-store-usage-tracker');
    renderHook(() => useStoreUsageTracker(), { wrapper: MemoryRouter });

    expect(flushUsageMock).not.toHaveBeenCalled();
  });
});

// ── USAGE-HOOK-3 (Slice 5 — Fase 1 auth cluster, port of Angular
// `cleanOldData(30)` unconditional mount-time call) ─────────────────────────

describe('useStoreUsageTracker — USAGE-HOOK-3: invokes cleanOldStoreUsage once on mount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls cleanOldStoreUsage with userId, selectedStoreId, and 30 exactly once on mount', async () => {
    const { useAuthStore } = await import('~/shared/lib/stores/auth-store');
    useAuthStore.setState({ user: makeUser(), isAuthenticated: true });

    const { useStoreUsageTracker } = await import('../use-store-usage-tracker');
    renderHook(() => useStoreUsageTracker(), { wrapper: MemoryRouter });

    expect(cleanOldStoreUsageMock).toHaveBeenCalledTimes(1);
    expect(cleanOldStoreUsageMock).toHaveBeenCalledWith('user-1', 'store-1', 30);
  });
});
