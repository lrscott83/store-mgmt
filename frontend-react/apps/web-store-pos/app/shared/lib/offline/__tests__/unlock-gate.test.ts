// design §5, trap 2: the four combinations of roster-provisioned-for-this-user
// × DEK-present. The "no roster + no DEK -> false" row is the explicit
// stranding-bug regression — gating on `getDek() !== null` instead of
// `needsUnlock` would strand every online-auth-only user forever.
import { describe, it, expect, beforeEach } from 'vitest';
import { needsUnlock, hasUnreadableCiphertext } from '../unlock-gate';
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

  // SuperAdmin / Reseller stranding (online-login bug, reported by the admin
  // login redirecting to /login?unlock=1 forever): a user WITHOUT a store
  // (selectedStoreId empty) has no DEK and no wrap of their own by design —
  // auth-store.login skips resolveDekForLogin for them (auth-store.ts:354-358).
  // The device-level hasDeviceDekWrap() branch must NOT strand them: wrap
  // material left by ANOTHER user (e.g. an owner who used this browser) is
  // not theirs to unlock, and their password can never open it.
  it('user without a store is never locked, even when the device holds wrap material from another user', () => {
    writeDeviceDekTable({
      formatVersion: 1,
      dekSource: 'local',
      storeId: 's1',
      device: null,
      users: { 'owner-login': { wrappedDek: 'ct', wrapSalt: 'salt', wrapIv: 'iv' } },
    });
    expect(
      needsUnlock({
        login: 'superadmin',
        selectedStoreId: '',
      }),
    ).toBe(false);
  });

  it('user without a store is never locked even when selectedStoreId is the EMPTY_GUID', () => {
    writeDeviceDekTable({
      formatVersion: 1,
      dekSource: 'local',
      storeId: 's1',
      device: null,
      users: { 'owner-login': { wrappedDek: 'ct', wrapSalt: 'salt', wrapIv: 'iv' } },
    });
    expect(
      needsUnlock({
        login: 'reseller',
        selectedStoreId: '00000000-0000-0000-0000-000000000000',
      }),
    ).toBe(false);
  });
});

// `hasUnreadableCiphertext` is the second half of the gate
// (`needsUnlock() && hasUnreadableCiphertext()` in auth/routes/loaders.ts):
// it is what decides whether a locked-but-valid session may be hijacked to
// /login?unlock=1. Entity keys are literals mirrored from storage-keys.ts and
// entity-crypto.ts, same discipline loaders.test.ts:214-218 applies.
describe('hasUnreadableCiphertext — what counts as evidence (user report 2026-09-06)', () => {
  // Real (non-empty) ciphertext: a payload LONGER than the 40-base64-char
  // empty-collection sentinel, so the length heuristic cannot be what
  // dismisses it. Only the key prefix may.
  const REAL_CIPHERTEXT = `enc:v1:${'A'.repeat(60)}`;

  beforeEach(() => {
    localStorage.clear();
    clearDek();
  });

  it('is false with nothing encrypted on disk', () => {
    expect(hasUnreadableCiphertext()).toBe(false);
  });

  it('is false for a plaintext entity value — the enc:v1 marker is what counts, not the key', () => {
    localStorage.setItem('lizoft.store-products-s1', '[{"id":"p1"}]');
    expect(hasUnreadableCiphertext()).toBe(false);
  });

  it('is true for ordinary USER data ciphertext (the control row)', () => {
    localStorage.setItem('lizoft.store-products-s1', REAL_CIPHERTEXT);
    expect(hasUnreadableCiphertext()).toBe(true);
  });

  // Regression guard, retire-exchange-rates-register T9: the daily USD→MN
  // register is RETIRED and nothing regenerates it, but a device upgraded
  // from a build older than the retirement that has not since run the
  // migration or the auth-time wipe still carries
  // `lizoft.store-exchangeRates-<storeId>` in localStorage — for a store
  // with MultiMonedas that never opened "Tasas de Cambio", nothing ever
  // removes it. If the gate stopped excluding that prefix, such a device
  // would re-trigger exactly the 2026-09-06 lockout the guard was written
  // to prevent: dead ciphertext for a register nobody reads hijacking a
  // valid session. The KEY is what is excluded, not the code that wrote it.
  it('is false for a leftover retired exchange-rate register key — legacy ciphertext never justifies the hijack', () => {
    localStorage.setItem('lizoft.store-exchangeRates-s1', REAL_CIPHERTEXT);
    expect(hasUnreadableCiphertext()).toBe(false);
  });

  it('the exclusion is per-store: leftover register keys beside real user data still find the user data', () => {
    localStorage.setItem('lizoft.store-exchangeRates-s1', REAL_CIPHERTEXT);
    localStorage.setItem('lizoft.store-exchangeRates-s2', REAL_CIPHERTEXT);
    localStorage.setItem('lizoft.store-orders-s1', REAL_CIPHERTEXT);
    expect(hasUnreadableCiphertext()).toBe(true);
  });

  it('a key that merely starts with the entity name but not the retired prefix is still evidence', () => {
    // Guards an over-broad prefix match: `exchangeRatesArchive` must NOT
    // inherit the exclusion.
    localStorage.setItem('lizoft.store-exchangeRatesArchive-s1', REAL_CIPHERTEXT);
    expect(hasUnreadableCiphertext()).toBe(true);
  });

  it('the retired key is excluded independently of the legacy empty-collection rule', () => {
    // The prefix skip happens BEFORE the value is read, so the two
    // exclusions cannot mask one another: 40 chars is exactly the
    // empty-collection sentinel length and is dismissed for its own reason.
    localStorage.setItem('lizoft.store-exchangeRates-s1', REAL_CIPHERTEXT);
    localStorage.setItem('lizoft.store-warehouses-s1', `enc:v1:${'A'.repeat(40)}`);
    expect(hasUnreadableCiphertext()).toBe(false);
  });
});
