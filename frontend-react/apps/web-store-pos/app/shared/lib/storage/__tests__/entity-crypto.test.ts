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

describe('entity-crypto — encryption absence is a permanent, first-class mode (hard constraint)', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDek();
    clearRoster();
  });

  it('no roster ever imported: encryptEntity returns input unchanged and does NOT throw', () => {
    expect(encryptEntity('[{"a":1}]')).toBe('[{"a":1}]');
  });

  it('v1-roster device: encryptEntity returns input unchanged, no throw', () => {
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
    expect(encryptEntity('[{"a":1}]')).toBe('[{"a":1}]');
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
