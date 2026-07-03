import { beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import type { UserModel } from '@store-mgmt/domain';
import { getCurrentUserLogin } from '../current-user';

function makeUser(overrides: Partial<UserModel> = {}): UserModel {
  return {
    id: 'u1',
    login: 'jdoe',
    fullName: 'Test User',
    cellPhone: '',
    email: 'jdoe@test.com',
    isActive: true,
    password: '',
    authToken: 'tok',
    refreshToken: 'ref',
    expiresIn: Date.now() + 1000000,
    roles: [],
    featureIds: [],
    storeModuleIds: [],
    isSuperAdmin: false,
    isOwnerAdmin: false,
    isReSeller: false,
    selectedStoreId: 's1',
    ...overrides,
  };
}

// Angular parity: every offline service's create/update mutation stamps
// AuthenticationService.currentUserValue?.login (NOT fullName) into createdByName/
// updatedByName. This helper is the single React equivalent read point.
describe('getCurrentUserLogin', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false, error: null });
  });

  it('returns "" when no user is authenticated', () => {
    expect(getCurrentUserLogin()).toBe('');
  });

  it('returns the authenticated user login', () => {
    useAuthStore.setState({ user: makeUser({ login: 'jdoe' }) });
    expect(getCurrentUserLogin()).toBe('jdoe');
  });

  it('re-reads lazily — reflects a login change between two calls (no caching)', () => {
    useAuthStore.setState({ user: makeUser({ login: 'first' }) });
    expect(getCurrentUserLogin()).toBe('first');

    useAuthStore.setState({ user: makeUser({ login: 'second' }) });
    expect(getCurrentUserLogin()).toBe('second');
  });
});
