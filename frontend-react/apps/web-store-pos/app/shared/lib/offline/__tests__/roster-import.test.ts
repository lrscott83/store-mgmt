import { describe, it, expect, beforeEach } from 'vitest';
import {
  deriveStoreIdFromFilename,
  importRosterFile,
  rosterImportErrorMessageId,
  UnknownFileError,
} from '../roster-import';
import { serializeRoster } from '../roster-serializer';
import { getRoster, importRoster } from '../roster-store';
import type { OfflineRosterBundle } from '../roster-types';

const STORE_ID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

function makeBundle(overrides: Partial<OfflineRosterBundle> = {}): OfflineRosterBundle {
  return {
    bundleId: 'b1',
    issuedAt: 1000,
    expiresAt: Date.now() + 1_000_000,
    formatVersion: 1,
    storeId: STORE_ID,
    users: [],
    ...overrides,
  };
}

function makeFile(payload: Uint8Array, name = `roster-${STORE_ID}.smcabundle`): File {
  return new File([payload], name);
}

describe('deriveStoreIdFromFilename', () => {
  it('recovers the store id from an unmodified export filename', () => {
    expect(deriveStoreIdFromFilename(`roster-${STORE_ID}.smcabundle`)).toBe(STORE_ID);
  });

  it('is case-insensitive about the GUID', () => {
    expect(deriveStoreIdFromFilename(`roster-${STORE_ID.toUpperCase()}.smcabundle`)).toBe(
      STORE_ID.toUpperCase(),
    );
  });

  it('returns null when the name carries no GUID', () => {
    expect(deriveStoreIdFromFilename('roster.smcabundle')).toBeNull();
    expect(deriveStoreIdFromFilename('roster-mi-tienda.smcabundle')).toBeNull();
  });

  it('returns null for the right GUID under the wrong extension', () => {
    expect(deriveStoreIdFromFilename(`roster-${STORE_ID}.zip`)).toBeNull();
  });
});

describe('importRosterFile', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('imports using the store id taken from the filename', async () => {
    const bundle = makeBundle();
    const file = makeFile(await serializeRoster(bundle, 'master', STORE_ID));

    await importRosterFile({ file, master: 'master' });

    expect(getRoster()?.bundleId).toBe('b1');
  });

  it('prefers an explicit store id over the filename', async () => {
    // Serialized under EXPLICIT_ID while the filename advertises STORE_ID:
    // only the explicit argument can open it, so a pass proves precedence.
    const EXPLICIT_ID = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
    const bundle = makeBundle({ storeId: EXPLICIT_ID });
    const file = makeFile(await serializeRoster(bundle, 'master', EXPLICIT_ID));

    await importRosterFile({ file, master: 'master', storeId: EXPLICIT_ID });

    expect(getRoster()?.bundleId).toBe('b1');
  });

  it('falls back to the filename when the explicit store id is blank', async () => {
    const bundle = makeBundle();
    const file = makeFile(await serializeRoster(bundle, 'master', STORE_ID));

    await importRosterFile({ file, master: 'master', storeId: '   ' });

    expect(getRoster()?.bundleId).toBe('b1');
  });

  it('throws UnknownFileError for a renamed file instead of blaming the password', async () => {
    const bundle = makeBundle();
    const file = makeFile(await serializeRoster(bundle, 'master', STORE_ID), 'activacion.smcabundle');

    await expect(importRosterFile({ file, master: 'master' })).rejects.toThrow(UnknownFileError);
    expect(getRoster()).toBeNull();
  });

  it('propagates WrongPasswordError untouched', async () => {
    const bundle = makeBundle();
    const file = makeFile(await serializeRoster(bundle, 'master', STORE_ID));

    await expect(importRosterFile({ file, master: 'incorrect' })).rejects.toMatchObject({
      name: 'WrongPasswordError',
    });
    expect(getRoster()).toBeNull();
  });

  it('propagates CorruptFileError untouched', async () => {
    const file = makeFile(new Uint8Array([1, 2, 3, 4, 5]));

    await expect(importRosterFile({ file, master: 'master' })).rejects.toMatchObject({
      name: 'CorruptFileError',
    });
  });

  it('propagates ExpiredBundleError untouched', async () => {
    const bundle = makeBundle({ expiresAt: Date.now() - 1000 });
    const file = makeFile(await serializeRoster(bundle, 'master', STORE_ID));

    await expect(importRosterFile({ file, master: 'master' })).rejects.toMatchObject({
      name: 'ExpiredBundleError',
    });
  });

  it('propagates ReplayBundleError untouched and leaves the stored roster alone', async () => {
    const bundle = makeBundle();
    importRoster(bundle);
    const file = makeFile(await serializeRoster(bundle, 'master', STORE_ID));

    await expect(importRosterFile({ file, master: 'master' })).rejects.toMatchObject({
      name: 'ReplayBundleError',
    });
    expect(getRoster()?.bundleId).toBe('b1');
  });
});

describe('rosterImportErrorMessageId', () => {
  it('maps each failure to its own message id', () => {
    expect(rosterImportErrorMessageId({ name: 'WrongPasswordError' })).toBe(
      'PROVISION.ERROR_WRONG_PASSWORD',
    );
    expect(rosterImportErrorMessageId({ name: 'CorruptFileError' })).toBe(
      'PROVISION.ERROR_CORRUPT_FILE',
    );
    expect(rosterImportErrorMessageId({ name: 'ExpiredBundleError' })).toBe(
      'PROVISION.ERROR_EXPIRED',
    );
    expect(rosterImportErrorMessageId({ name: 'ReplayBundleError' })).toBe(
      'PROVISION.ERROR_REPLAY',
    );
    expect(rosterImportErrorMessageId(new UnknownFileError())).toBe(
      'PROVISION.ERROR_UNKNOWN_FILE',
    );
  });

  it('falls back to the corrupt-file message for anything unrecognised', () => {
    expect(rosterImportErrorMessageId(null)).toBe('PROVISION.ERROR_CORRUPT_FILE');
    expect(rosterImportErrorMessageId(new Error('boom'))).toBe('PROVISION.ERROR_CORRUPT_FILE');
  });
});
