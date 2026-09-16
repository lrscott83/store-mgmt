import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { UserModel } from '@store-mgmt/domain';
import { EModules } from '@store-mgmt/domain';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { useMultiStore } from '../use-multi-store';

function makeUser(overrides: Partial<UserModel>): UserModel {
  return {
    id: 'u1',
    fullName: 'Owner',
    cellPhone: '',
    email: '',
    isActive: true,
    password: '',
    roles: [],
    featureIds: [],
    storeModuleIds: [],
    isSuperAdmin: false,
    isOwnerAdmin: true,
    isReSeller: false,
    selectedStoreId: 's1',
    paymentDueDate: null,
    isInTrial: false,
    paymentStatus: 'AlDia',
    authToken: '',
    expiresIn: Date.now() + 60_000,
    ...overrides,
  } as UserModel;
}

function Probe() {
  const { enabled, stores } = useMultiStore();
  return (
    <div>
      <span data-testid="enabled">{String(enabled)}</span>
      <span data-testid="count">{stores.length}</span>
    </div>
  );
}

function setUser(user: UserModel | null) {
  useAuthStore.setState({ user });
}

describe('useMultiStore', () => {
  beforeEach(() => {
    setUser(null);
  });

  it('disabled with no user', () => {
    render(<Probe />);
    expect(screen.getByTestId('enabled').textContent).toBe('false');
  });

  it('disabled for non-owner (store user)', () => {
    setUser(makeUser({ isOwnerAdmin: false, storeModuleIds: [EModules.MultiStores] }));
    render(<Probe />);
    expect(screen.getByTestId('enabled').textContent).toBe('false');
  });

  it('disabled for superadmin (not an owner)', () => {
    setUser(makeUser({ isSuperAdmin: true, storeModuleIds: [EModules.MultiStores] }));
    render(<Probe />);
    expect(screen.getByTestId('enabled').textContent).toBe('false');
  });

  it('disabled for owner WITHOUT the MultiStores module', () => {
    setUser(
      makeUser({
        storeList: [
          { id: 's1', name: 'A', isActive: true },
          { id: 's2', name: 'B', isActive: true },
        ],
      }),
    );
    render(<Probe />);
    expect(screen.getByTestId('enabled').textContent).toBe('false');
  });

  it('disabled with only ONE active store (nothing to group)', () => {
    setUser(
      makeUser({
        storeModuleIds: [EModules.MultiStores],
        storeList: [
          { id: 's1', name: 'A', isActive: true },
          { id: 's2', name: 'B', isActive: false },
        ],
      }),
    );
    render(<Probe />);
    expect(screen.getByTestId('enabled').textContent).toBe('false');
    expect(screen.getByTestId('count').textContent).toBe('1');
  });

  it('enabled with TWO active stores, exposing only active ones', () => {
    setUser(
      makeUser({
        storeModuleIds: [EModules.MultiStores],
        storeList: [
          { id: 's1', name: 'A', isActive: true },
          { id: 's2', name: 'B', isActive: true },
          { id: 's3', name: 'C', isActive: false },
        ],
      }),
    );
    render(<Probe />);
    expect(screen.getByTestId('enabled').textContent).toBe('true');
    expect(screen.getByTestId('count').textContent).toBe('2');
  });

  it('treats missing isActive as active (cached sessions from older backends)', () => {
    setUser(
      makeUser({
        storeModuleIds: [EModules.MultiStores],
        storeList: [
          { id: 's1', name: 'A' },
          { id: 's2', name: 'B' },
        ] as UserModel['storeList'],
      }),
    );
    render(<Probe />);
    expect(screen.getByTestId('enabled').textContent).toBe('true');
  });
});
