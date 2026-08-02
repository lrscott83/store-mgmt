import { describe, it, expect, beforeEach } from 'vitest';
import {
  importRoster,
  getRoster,
  getRawRoster,
  isEncryptionProvisioned,
  findRosterUser,
  isRosterProvisioned,
  clearRoster,
  ExpiredBundleError,
  ReplayBundleError,
  InvalidBundleError,
} from '../roster-store';
import type { OfflineRosterBundle } from '../roster-types';

const ROSTER_KEY = 'lizoft.offline-roster';
const REPLAY_KEY = 'lizoft.offline-roster-last';

function makeBundle(overrides: Partial<OfflineRosterBundle> = {}): OfflineRosterBundle {
  return {
    bundleId: 'b1',
    issuedAt: 1000,
    expiresAt: 20_000, // strictly future relative to `now = 10_000` used below
    formatVersion: 1,
    storeId: 's1',
    users: [
      {
        id: 'u1',
        login: 'ana',
        fullName: 'Ana Pérez',
        isActive: true,
        roles: [],
        featureIds: [1],
        storeModuleIds: [],
        isSuperAdmin: false,
        isOwnerAdmin: false,
        isReSeller: false,
        selectedStoreId: 's1',
        verifier: { hash: 'h', salt: 's', iterations: 210_000 },
      },
    ],
    ...overrides,
  };
}

describe('roster-store — fresh import + read', () => {
  beforeEach(() => localStorage.clear());

  it('persists and reads back the exact bundle', () => {
    const bundle = makeBundle();
    importRoster(bundle, 10_000);
    expect(getRoster(10_000)).toEqual(bundle);
  });

  it('findRosterUser finds a user by login', () => {
    const bundle = makeBundle();
    importRoster(bundle, 10_000);
    expect(findRosterUser('ana', 10_000)?.id).toBe('u1');
    expect(findRosterUser('ghost', 10_000)).toBeNull();
  });

  it('isRosterProvisioned is true right after import', () => {
    importRoster(makeBundle(), 10_000);
    expect(isRosterProvisioned(10_000)).toBe(true);
  });
});

describe('roster-store — anti-replay + expiry (spec offline-roster-bundle)', () => {
  beforeEach(() => localStorage.clear());

  it('rejects an already-expired bundle at import time and persists nothing', () => {
    const bundle = makeBundle({ expiresAt: 5_000 });
    expect(() => importRoster(bundle, 10_000)).toThrow(ExpiredBundleError);
    expect(getRoster(10_000)).toBeNull();
  });

  it('rejects re-importing the identical bundle (same bundleId)', () => {
    importRoster(makeBundle(), 10_000);
    expect(() => importRoster(makeBundle(), 11_000)).toThrow(ReplayBundleError);
  });

  it('rejects a different bundle with an equal issuedAt', () => {
    importRoster(makeBundle({ bundleId: 'b1', issuedAt: 1000 }), 10_000);
    expect(() =>
      importRoster(makeBundle({ bundleId: 'b2', issuedAt: 1000 }), 11_000),
    ).toThrow(ReplayBundleError);
  });

  it('rejects a different bundle with an older issuedAt', () => {
    importRoster(makeBundle({ bundleId: 'b1', issuedAt: 1000 }), 10_000);
    expect(() =>
      importRoster(makeBundle({ bundleId: 'b2', issuedAt: 500 }), 11_000),
    ).toThrow(ReplayBundleError);
  });

  it('accepts a strictly newer bundle and replaces the stored roster', () => {
    importRoster(makeBundle({ bundleId: 'b1', issuedAt: 1000 }), 10_000);
    const newer = makeBundle({ bundleId: 'b2', issuedAt: 2000, expiresAt: 30_000 });
    importRoster(newer, 11_000);
    expect(getRoster(11_000)).toEqual(newer);
  });
});

describe('roster-store — D3 shape guard (expiresAt/issuedAt/bundleId/users must be well-typed)', () => {
  beforeEach(() => localStorage.clear());

  it('importRoster throws InvalidBundleError when expiresAt is an ISO string, not a number', () => {
    const malformed = {
      ...makeBundle(),
      expiresAt: '2099-01-01T00:00:00.000Z' as unknown as number,
    };
    expect(() => importRoster(malformed, 10_000)).toThrow(InvalidBundleError);
  });

  it('importRoster throws InvalidBundleError when users is not an array', () => {
    const malformed = { ...makeBundle(), users: 'not-an-array' as unknown as [] };
    expect(() => importRoster(malformed, 10_000)).toThrow(InvalidBundleError);
  });

  it('getRoster returns null (never throws) on a malformed stored shape', () => {
    // Bypass importRoster's own guard by writing directly to storage, simulating
    // a bundle whose expiresAt arrived as an ISO string (e.g. a future backend
    // drift) — without the shape guard this would compare as NaN/false and stay
    // "valid" forever. Design correction #8: the corrected assertion form.
    localStorage.setItem(
      ROSTER_KEY,
      JSON.stringify({
        bundleId: 'b1',
        issuedAt: 1000,
        expiresAt: '2099-01-01T00:00:00.000Z',
        formatVersion: 1,
        storeId: 's1',
        users: [],
      }),
    );
    expect(getRoster(20_000)).toBeNull();
    expect(isRosterProvisioned(20_000)).toBe(false);
  });
});

describe('roster-store — getRawRoster (design §4, trap 1: expiry-ignoring raw read)', () => {
  beforeEach(() => localStorage.clear());

  it('returns the bundle even when expiresAt is in the past, while getRoster returns null for the same bytes', () => {
    // Bypass importRoster's own expiry guard, simulating a bundle that
    // expired AFTER it was stored (the only way an expired bundle exists on
    // disk in practice).
    localStorage.setItem(
      'lizoft.offline-roster',
      JSON.stringify(makeBundle({ expiresAt: 5_000, formatVersion: 2 })),
    );

    expect(getRawRoster()).toEqual(makeBundle({ expiresAt: 5_000, formatVersion: 2 }));
    expect(getRoster(10_000)).toBeNull();
  });

  it('returns null and does not throw when no bundle is stored', () => {
    expect(getRawRoster()).toBeNull();
  });

  it('returns null on a malformed stored shape, same as getRoster', () => {
    localStorage.setItem(ROSTER_KEY, 'not-json{{{');
    expect(getRawRoster()).toBeNull();
  });
});

describe('roster-store — isEncryptionProvisioned (design §4, trap 1)', () => {
  beforeEach(() => localStorage.clear());

  it('stays true for an expired v2 bundle with a wrapped DEK', () => {
    localStorage.setItem(
      ROSTER_KEY,
      JSON.stringify(
        makeBundle({
          expiresAt: 5_000,
          formatVersion: 2,
          users: [
            {
              ...makeBundle().users[0],
              wrappedDek: 'ct',
              wrapSalt: 'salt',
              wrapIv: 'iv',
            },
          ],
        }),
      ),
    );
    expect(isEncryptionProvisioned()).toBe(true);
  });

  it('is false for a v1 bundle', () => {
    importRoster(makeBundle({ formatVersion: 1 }), 10_000);
    expect(isEncryptionProvisioned()).toBe(false);
  });

  it('is false with no bundle at all', () => {
    expect(isEncryptionProvisioned()).toBe(false);
  });
});

describe('roster-store — clearRoster (REPLAY_KEY intentionally survives)', () => {
  beforeEach(() => localStorage.clear());

  it('clears the roster but leaves the anti-replay marker in place', () => {
    importRoster(makeBundle(), 10_000);
    expect(localStorage.getItem(REPLAY_KEY)).not.toBeNull();

    clearRoster();

    expect(getRoster(10_000)).toBeNull();
    expect(isRosterProvisioned(10_000)).toBe(false);
    expect(localStorage.getItem(REPLAY_KEY)).not.toBeNull();
  });
});
