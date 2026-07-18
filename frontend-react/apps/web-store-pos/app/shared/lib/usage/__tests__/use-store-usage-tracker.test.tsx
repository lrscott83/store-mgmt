import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { UserModel } from '@store-mgmt/domain';

// ── USAGE-HOOK-1/2 (Stage 6 Slice C — navigation-triggered tracker) ─────────
// Wires `registerStoreActivity` to route navigation, matching Angular's
// `router.events.pipe(filter(NavigationEnd))` subscription.

const registerStoreActivityMock = vi.fn();
const cleanOldStoreUsageMock = vi.fn();
const isTrackingArmedMock = vi.fn();
vi.mock('~/shared/lib/usage/store-usage-tracker', () => ({
  registerStoreActivity: registerStoreActivityMock,
  cleanOldStoreUsage: cleanOldStoreUsageMock,
  isTrackingArmed: isTrackingArmedMock,
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
    ...overrides,
  };
}

describe('useStoreUsageTracker — USAGE-HOOK-1: registers activity when authenticated AND armed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls registerStoreActivity with userId + selectedStoreId on mount when armed', async () => {
    isTrackingArmedMock.mockReturnValue(true);
    const { useAuthStore } = await import('~/shared/lib/stores/auth-store');
    useAuthStore.setState({ user: makeUser(), isAuthenticated: true });

    const { useStoreUsageTracker } = await import('../use-store-usage-tracker');
    renderHook(() => useStoreUsageTracker(), { wrapper: MemoryRouter });

    expect(registerStoreActivityMock).toHaveBeenCalledWith('user-1', 'store-1');
  });

  // Angular parity: after a page reload the NavigationEnd subscription is never
  // re-armed (only an explicit login arms it), so the tracker stays dormant even
  // though the user is authenticated/rehydrated — no request on navigation.
  it('does NOT call registerStoreActivity when authenticated but NOT armed (reload parity)', async () => {
    isTrackingArmedMock.mockReturnValue(false);
    const { useAuthStore } = await import('~/shared/lib/stores/auth-store');
    useAuthStore.setState({ user: makeUser(), isAuthenticated: true });

    const { useStoreUsageTracker } = await import('../use-store-usage-tracker');
    renderHook(() => useStoreUsageTracker(), { wrapper: MemoryRouter });

    expect(registerStoreActivityMock).not.toHaveBeenCalled();
  });

  it('does not call registerStoreActivity when unauthenticated', async () => {
    isTrackingArmedMock.mockReturnValue(true);
    const { useAuthStore } = await import('~/shared/lib/stores/auth-store');
    useAuthStore.setState({ user: null, isAuthenticated: false });

    const { useStoreUsageTracker } = await import('../use-store-usage-tracker');
    renderHook(() => useStoreUsageTracker(), { wrapper: MemoryRouter });

    expect(registerStoreActivityMock).not.toHaveBeenCalled();
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
