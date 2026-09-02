import { describe, it, expect, beforeEach } from 'vitest';
import {
  importRosterFile,
  rosterImportErrorMessageId,
  UnknownFileError,
} from '../roster-import';
import * as rosterImportModule from '../roster-import';
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
  it('has been removed — the envelope inside the archive replaced it', async () => {
    // roster-any-filename: the storeId now travels in the plaintext
    // meta.json envelope, so this module must no longer export the
    // filename regex.
    const m = await import('../roster-import');
    expect('deriveStoreIdFromFilename' in m).toBe(false);
    expect('deriveStoreIdFromFilename' in rosterImportModule).toBe(false);
  });
});

describe('importRosterFile', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('imports using the store id taken from the envelope, with any file name', async () => {
    const bundle = makeBundle();
    // The name is deliberately NOT the export name — the envelope inside
    // the archive is the only storeId source now.
    const file = makeFile(await serializeRoster(bundle, 'master', STORE_ID), 'activacion.smcabundle');

    await importRosterFile({ file, master: 'master' });

    expect(getRoster()?.bundleId).toBe('b1');
  });

  it('imports with the unmodified export filename too', async () => {
    const bundle = makeBundle();
    const file = makeFile(await serializeRoster(bundle, 'master', STORE_ID));

    await importRosterFile({ file, master: 'master' });

    expect(getRoster()?.bundleId).toBe('b1');
  });

  it('prefers an explicit store id over the envelope', async () => {
    // Serialized under EXPLICIT_ID while the envelope carries STORE_ID:
    // only the explicit argument can open it, so a pass proves precedence.
    const EXPLICIT_ID = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
    const bundle = makeBundle({ storeId: EXPLICIT_ID });
    const file = makeFile(await serializeRoster(bundle, 'master', EXPLICIT_ID), 'renamed.smcabundle');

    await importRosterFile({ file, master: 'master', storeId: EXPLICIT_ID });

    expect(getRoster()?.bundleId).toBe('b1');
  });

  it('falls back to the envelope when the explicit store id is blank', async () => {
    const bundle = makeBundle();
    const file = makeFile(await serializeRoster(bundle, 'master', STORE_ID), 'renamed.smcabundle');

    await importRosterFile({ file, master: 'master', storeId: '   ' });

    expect(getRoster()?.bundleId).toBe('b1');
  });

  it('throws UnknownFileError for a zip without the envelope instead of blaming the password', async () => {
    // A roster.json-only zip (no meta.json): a file that is NOT an export,
    // so the failure must be "unknown file", not "wrong password".
    const bundle = makeBundle();
    const payload = await serializeRoster(bundle, 'master', STORE_ID);
    const { ZipWriter, BlobWriter, TextReader, BlobReader, ZipReader, TextWriter } = await import(
      '@zip.js/zip.js'
    );
    const reader = new ZipReader(new BlobReader(new Blob([payload])));
    const entries = await reader.getEntries();
    const rosterEntry = entries.find((e) => !e.directory && e.filename === 'roster.json');
    if (!rosterEntry || rosterEntry.directory) {
      throw new Error('fixture setup: serialized archive is missing roster.json');
    }
    const rosterText = await rosterEntry.getData(new TextWriter(), {
      password: `master${STORE_ID}`,
    });
    await reader.close();
    const writer = new ZipWriter(new BlobWriter('application/zip'));
    await writer.add('roster.json', new TextReader(rosterText));
    const noEnvelope = new Uint8Array(await (await writer.close()).arrayBuffer());

    const file = makeFile(noEnvelope, 'activacion.smcabundle');

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

  it('propagates CorruptFileError untouched for an export missing its roster.json entry', async () => {
    // Envelope present (so the storeId resolves) but no roster.json inside:
    // this is a DAMAGED export, distinct from "not an export at all".
    const { ZipWriter, BlobWriter, TextReader } = await import('@zip.js/zip.js');
    const writer = new ZipWriter(new BlobWriter('application/zip'));
    await writer.add('meta.json', new TextReader(JSON.stringify({ storeId: STORE_ID })));
    const payload = new Uint8Array(await (await writer.close()).arrayBuffer());
    const file = makeFile(payload, 'activacion.smcabundle');

    await expect(importRosterFile({ file, master: 'master' })).rejects.toMatchObject({
      name: 'CorruptFileError',
    });
  });

  it('maps garbage bytes to UnknownFileError — not an activation file at all', async () => {
    const file = makeFile(new Uint8Array([1, 2, 3, 4, 5]));

    await expect(importRosterFile({ file, master: 'master' })).rejects.toThrow(UnknownFileError);
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
