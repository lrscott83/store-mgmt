import { describe, it, expect, beforeEach } from 'vitest';
import {
  encryptEntity,
  decryptEntity,
  isEncrypted,
  ENTITY_ENVELOPE_PREFIX,
  MissingDataKeyError,
} from '../entity-crypto';
import { setDek, clearDek } from '../data-key-store';
import { importRoster, clearRoster } from '../../offline/roster-store';
import { writeDeviceDekTable, clearDeviceDekTable, hasDeviceDekWrap } from '../device-dek-table';
import type { OfflineRosterBundle } from '../../offline/roster-types';

function v2Bundle(overrides: Partial<OfflineRosterBundle> = {}): OfflineRosterBundle {
  return {
    bundleId: 'b1',
    issuedAt: 1000,
    expiresAt: 999_999_999_999,
    formatVersion: 2,
    storeId: 's1',
    users: [
      {
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
        wrappedDek: 'ct',
        wrapSalt: 'salt',
        wrapIv: 'iv',
      },
    ],
    ...overrides,
  };
}

describe('entity-crypto — permanent marker-based passthrough (decryptEntity)', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDek();
  });

  it('decryptEntity(null) returns null', () => {
    expect(decryptEntity(null)).toBeNull();
  });

  it('decryptEntity returns an unmarked value unchanged, no decryption attempted', () => {
    expect(decryptEntity('[{"a":1}]')).toBe('[{"a":1}]');
  });

  it('isEncrypted is false for unmarked values and true for the marker prefix', () => {
    expect(isEncrypted('[{"a":1}]')).toBe(false);
    expect(isEncrypted(`${ENTITY_ENVELOPE_PREFIX}anything`)).toBe(true);
  });
});

// device-wrapped-dek design §4 (AUTHORIZED rewrite #2, engram
// sdd/device-wrapped-dek/design-decisions): encryption absence is a
// permanent, first-class mode ONLY while this device has never completed a
// login — i.e. no roster AND no device wrap table. Once either is true, the
// plaintext passthrough no longer applies.
describe('entity-crypto — encryption absence is a permanent mode ONLY while this device has never completed a login (device-wrapped-dek)', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDek();
    clearRoster();
    clearDeviceDekTable();
  });

  it('no roster ever imported AND no device wrap table: encryptEntity returns input unchanged and does NOT throw', () => {
    expect(hasDeviceDekWrap()).toBe(false);
    expect(encryptEntity('[{"a":1}]')).toBe('[{"a":1}]');
  });

  it('a device DEK/table is set: encryptEntity encrypts to enc:v1:, regardless of roster state (v1 roster here)', () => {
    importRoster(
      {
        bundleId: 'b0',
        issuedAt: 1,
        expiresAt: 999_999_999_999,
        formatVersion: 1,
        storeId: 's1',
        users: [],
      },
      500,
    );
    const dek = new Uint8Array(32).fill(0x09);
    setDek(dek, 's1');
    writeDeviceDekTable({ formatVersion: 1, dekSource: 'local', storeId: 's1', device: null, users: {} });

    expect(encryptEntity('[{"a":1}]')).toMatch(/^enc:v1:/);
  });

  // The one-line guard flip (device-wrapped-dek §4): this is what fails
  // against the pre-change code, which only checked `isEncryptionProvisioned()`
  // (roster-only) and would silently pass this value through as plaintext.
  it('no DEK, but this device holds a wrap table (bootstrap did not recover it) and no roster: MissingDataKeyError, NOT plaintext', () => {
    writeDeviceDekTable({
      formatVersion: 1,
      dekSource: 'local',
      storeId: 's1',
      device: null,
      users: { ana: { wrappedDek: 'ct', wrapSalt: 'salt', wrapIv: 'iv' } },
    });
    expect(hasDeviceDekWrap()).toBe(true);

    expect(() => encryptEntity('[{"a":1}]')).toThrow(MissingDataKeyError);
  });
});

describe('entity-crypto — encryptEntity DEK checked before roster state', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDek();
    clearRoster();
  });

  it('DEK present: encrypts to enc:v1: and decrypts back to the original string', () => {
    const dek = new Uint8Array(32).fill(0x07);
    setDek(dek, 's1');

    const encrypted = encryptEntity('[{"a":1}]');
    expect(encrypted.startsWith(ENTITY_ENVELOPE_PREFIX)).toBe(true);

    const decrypted = decryptEntity(encrypted);
    expect(decrypted).toBe('[{"a":1}]');
  });

  it('provisioned but locked (no DEK): encryptEntity throws MissingDataKeyError', () => {
    importRoster(v2Bundle(), 500);
    // No setDek call — locked.
    expect(() => encryptEntity('[{"a":1}]')).toThrow(MissingDataKeyError);
  });

  it('marked value with no DEK: decryptEntity throws MissingDataKeyError', () => {
    const dek = new Uint8Array(32).fill(0x07);
    setDek(dek, 's1');
    const encrypted = encryptEntity('[{"a":1}]');
    clearDek();

    expect(() => decryptEntity(encrypted)).toThrow(MissingDataKeyError);
  });
});
