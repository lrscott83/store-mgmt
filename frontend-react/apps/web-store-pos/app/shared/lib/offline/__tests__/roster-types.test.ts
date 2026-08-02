import { describe, it, expect, beforeEach } from 'vitest';
import type { OfflineRosterBundle, OfflineRosterUser } from '../roster-types';
import { importRoster, getRoster } from '../roster-store';

// spec offline-roster-bundle "Bundle carries optional per-user wrap fields;
// formatVersion stays a plain number" — a v1 bundle with no wrap fields on
// any user must remain a valid shape (unchanged today), and a v2 bundle
// with every user carrying non-empty wrappedDek/wrapSalt/wrapIv must ALSO
// be a valid shape once the type gains the three optional fields.

function baseUser(overrides: Partial<OfflineRosterUser> = {}): OfflineRosterUser {
  return {
    id: 'u1',
    login: 'ana',
    fullName: 'Ana Pérez',
    isActive: true,
    roles: [],
    featureIds: [],
    storeModuleIds: [],
    isSuperAdmin: false,
    isOwnerAdmin: false,
    isReSeller: false,
    selectedStoreId: 's1',
    verifier: { hash: 'h', salt: 's', iterations: 210_000 },
    ...overrides,
  };
}

describe('roster-types — optional per-user wrap fields', () => {
  beforeEach(() => localStorage.clear());

  it('v1 bundle without wrap fields on any user is a valid shape', () => {
    const bundle: OfflineRosterBundle = {
      bundleId: 'b1',
      issuedAt: 1000,
      expiresAt: 20_000,
      formatVersion: 1,
      storeId: 's1',
      users: [baseUser()],
    };
    importRoster(bundle, 10_000);
    expect(getRoster(10_000)).toEqual(bundle);
  });

  it('v2 bundle with every user carrying non-empty wrappedDek/wrapSalt/wrapIv is a valid shape', () => {
    const bundle: OfflineRosterBundle = {
      bundleId: 'b2',
      issuedAt: 1000,
      expiresAt: 20_000,
      formatVersion: 2,
      storeId: 's1',
      users: [baseUser({ wrappedDek: 'ct-base64', wrapSalt: 'salt-base64', wrapIv: 'iv-base64' })],
    };
    importRoster(bundle, 10_000);
    const stored = getRoster(10_000);
    expect(stored?.users[0].wrappedDek).toBe('ct-base64');
    expect(stored?.users[0].wrapSalt).toBe('salt-base64');
    expect(stored?.users[0].wrapIv).toBe('iv-base64');
  });
});
