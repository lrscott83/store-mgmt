// design §5, trap 2: the four combinations of roster-provisioned-for-this-user
// × DEK-present. The "no roster + no DEK -> false" row is the explicit
// stranding-bug regression — gating on `getDek() !== null` instead of
// `needsUnlock` would strand every online-auth-only user forever.
import { describe, it, expect, beforeEach } from 'vitest';
import { needsUnlock } from '../unlock-gate';
import { importRoster } from '../roster-store';
import { setDek, clearDek } from '../../storage/data-key-store';
import { writeDeviceDekTable } from '../../storage/device-dek-table';
import type { OfflineRosterBundle } from '../roster-types';

function makeBundle(overrides: Partial<OfflineRosterBundle> = {}): OfflineRosterBundle {
  return {
    bundleId: 'b1',
    issuedAt: 1000,
    expiresAt: Date.now() + 1_000_000,
    formatVersion: 2,
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
        wrappedDek: 'ct',
        wrapSalt: 'salt',
        wrapIv: 'iv',
      },
    ],
    ...overrides,
  };
}

describe('needsUnlock — per-user, all four combinations (design §5)', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDek();
  });

  it('returns false for a null user', () => {
    expect(needsUnlock(null)).toBe(false);
  });

  it('row 1 — no roster entry for this user, no DEK: false (majority case, stranding regression)', () => {
    // No roster at all.
    expect(needsUnlock({ login: 'ana' })).toBe(false);
  });

  it('row 1b — a roster exists but has no entry for this login: false', () => {
    importRoster(makeBundle(), Date.now());
    expect(needsUnlock({ login: 'someone-else' })).toBe(false);
  });

  it('row 1c — a v1 roster (no wrap fields): false regardless of DEK', () => {
    importRoster(makeBundle({ formatVersion: 1 }), Date.now());
    expect(needsUnlock({ login: 'ana' })).toBe(false);
  });

  it('row 2 — not provisioned for this user, DEK present: false', () => {
    setDek(new Uint8Array(32), 's1');
    expect(needsUnlock({ login: 'ghost' })).toBe(false);
  });

  it('row 3 — provisioned for this user, no DEK: true (this IS the unlock screen)', () => {
    importRoster(makeBundle(), Date.now());
    expect(needsUnlock({ login: 'ana' })).toBe(true);
  });

  it('row 3b — provisioned but with empty-string wrap fields (backend default): false', () => {
    importRoster(
      makeBundle({
        users: [
          {
            ...makeBundle().users[0],
            wrappedDek: '',
            wrapSalt: '',
            wrapIv: '',
          },
        ],
      }),
      Date.now(),
    );
    expect(needsUnlock({ login: 'ana' })).toBe(false);
  });

  it('row 4 — provisioned for this user, DEK present: false (unlocked)', () => {
    importRoster(makeBundle(), Date.now());
    setDek(new Uint8Array(32), 's1');
    expect(needsUnlock({ login: 'ana' })).toBe(false);
  });

  it('is expiry-ignoring: an expired v2 bundle with a wrap entry still returns true (trap 1 interaction)', () => {
    localStorage.setItem(
      'lizoft.offline-roster',
      JSON.stringify(makeBundle({ expiresAt: Date.now() - 1_000 })),
    );
    expect(needsUnlock({ login: 'ana' })).toBe(true);
  });

  // device-wrapped-dek design §4/§7 (new row, append only — the nine rows
  // above are untouched): the device-wrap fast path is independent of
  // roster state entirely.
  it('device-wrapped-dek: a local wrap table exists, no DEK -> true, even with no roster entry for this user', () => {
    writeDeviceDekTable({
      formatVersion: 1,
      dekSource: 'local',
      storeId: 's1',
      device: null,
      users: { 'someone-else': { wrappedDek: 'ct', wrapSalt: 'salt', wrapIv: 'iv' } },
    });
    expect(needsUnlock({ login: 'ana' })).toBe(true);
  });
});
