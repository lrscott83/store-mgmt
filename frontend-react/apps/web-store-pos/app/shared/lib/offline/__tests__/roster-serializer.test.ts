import { describe, it, expect } from 'vitest';
import {
  serializeRoster,
  deserializeRoster,
  readRosterEnvelope,
  WrongPasswordError,
  CorruptFileError,
} from '../roster-serializer';
import type { OfflineRosterBundle } from '../roster-types';

function makeBundle(): OfflineRosterBundle {
  return {
    bundleId: 'b1',
    issuedAt: 1000,
    expiresAt: 2_000_000_000_000,
    formatVersion: 1,
    storeId: 's1',
    users: [
      {
        id: 'u1',
        login: 'ana',
        fullName: 'Ana Pérez',
        isActive: true,
        roles: [],
        featureIds: [1, 2],
        storeModuleIds: [],
        isSuperAdmin: false,
        isOwnerAdmin: false,
        isReSeller: false,
        selectedStoreId: 's1',
        verifier: { hash: 'abc', salt: 'def', iterations: 210_000 },
      },
    ],
  };
}

// WU14 (regression coverage, not new behavior): the container's crypto
// (serializeRoster/deserializeRoster) has no notion of formatVersion — this
// is the same v1 fixture above with formatVersion:2 and the wrap fields
// populated, proving the container round-trips a v2 bundle identically.
function makeV2Bundle(): OfflineRosterBundle {
  return {
    ...makeBundle(),
    formatVersion: 2,
    users: [
      {
        ...makeBundle().users[0],
        wrappedDek: 'ct',
        wrapSalt: 'salt',
        wrapIv: 'iv',
      },
    ],
  };
}

describe('roster-serializer — bundle container round-trips losslessly', () => {
  it('deserializes to the exact original bundle with the same master + storeId', async () => {
    const bundle = makeBundle();
    const payload = await serializeRoster(bundle, 'm', 's1');
    const result = await deserializeRoster(payload, 'm', 's1');
    expect(result).toEqual(bundle);
  });

  it('deserializes a v2 bundle (with wrap fields) to the exact original, same as v1 (WU14 regression coverage)', async () => {
    const bundle = makeV2Bundle();
    const payload = await serializeRoster(bundle, 'm', 's1');
    const result = await deserializeRoster(payload, 'm', 's1');
    expect(result).toEqual(bundle);
  });

  it('raises WrongPasswordError when deserializing with an incorrect master', async () => {
    const bundle = makeBundle();
    const payload = await serializeRoster(bundle, 'm', 's1');
    await expect(deserializeRoster(payload, 'wrong', 's1')).rejects.toBeInstanceOf(WrongPasswordError);
  });

  it('raises CorruptFileError for a structurally invalid file', async () => {
    const garbage = new Uint8Array([1, 2, 3, 4, 5]);
    await expect(deserializeRoster(garbage, 'm', 's1')).rejects.toBeInstanceOf(CorruptFileError);
  });
});

// ---------------------------------------------------------------------------
// Plaintext envelope (roster-any-filename): the storeId the archive password
// needs travels INSIDE the zip as an unencrypted `meta.json` entry, so the
// file's name stops being load-bearing. Mirrors data-serializer-service v2's
// meta.json precedent.
// ---------------------------------------------------------------------------

describe('roster-serializer — plaintext meta.json envelope', () => {
  it('serializeRoster writes a readable meta.json envelope carrying the storeId', async () => {
    const bundle = makeBundle();
    const payload = await serializeRoster(bundle, 'm', 's1');

    const envelope = await readRosterEnvelope(payload);
    expect(envelope).not.toBeNull();
    expect(envelope!.storeId).toBe('s1');
  });

  it('the roster.json payload stays encrypted: the envelope cannot read it', async () => {
    const bundle = makeBundle();
    const payload = await serializeRoster(bundle, 'm', 's1');

    // The payload bytes must not contain the bundle's secrets in plaintext:
    // bundleId lives inside roster.json only.
    const text = new TextDecoder().decode(payload);
    expect(text).not.toContain('b1');
    expect(text).not.toContain('ana');
  });

  it('readRosterEnvelope returns null for a non-export zip (no meta.json entry)', async () => {
    const bundle = makeBundle();
    const payload = await serializeRoster(bundle, 'm', 's1');

    // Re-zip the roster.json entry alone, WITHOUT the envelope.
    const { ZipWriter, BlobWriter, TextReader, BlobReader, ZipReader, TextWriter } = await import(
      '@zip.js/zip.js'
    );
    const reader = new ZipReader(new BlobReader(new Blob([payload])));
    const entries = await reader.getEntries();
    const rosterEntry = entries.find((e) => !e.directory && e.filename === 'roster.json');
    if (!rosterEntry || rosterEntry.directory) {
      throw new Error('fixture setup: serialized archive is missing roster.json');
    }
    const rosterText = await rosterEntry.getData(new TextWriter(), { password: 'ms1' });
    await reader.close();

    const writer = new ZipWriter(new BlobWriter('application/zip'));
    await writer.add('roster.json', new TextReader(rosterText));
    const noEnvelope = new Uint8Array(await (await writer.close()).arrayBuffer());

    expect(await readRosterEnvelope(noEnvelope)).toBeNull();
  });

  it('readRosterEnvelope returns null for garbage bytes', async () => {
    expect(await readRosterEnvelope(new Uint8Array([1, 2, 3, 4, 5]))).toBeNull();
  });

  it('readRosterEnvelope returns null when meta.json is not valid JSON', async () => {
    const { ZipWriter, BlobWriter, TextReader } = await import('@zip.js/zip.js');
    const writer = new ZipWriter(new BlobWriter('application/zip'));
    await writer.add('meta.json', new TextReader('not json'));
    const bad = new Uint8Array(await (await writer.close()).arrayBuffer());

    expect(await readRosterEnvelope(bad)).toBeNull();
  });

  it('deserializeRoster still round-trips through the new two-entry shape', async () => {
    const bundle = makeBundle();
    const payload = await serializeRoster(bundle, 'm', 's1');
    const result = await deserializeRoster(payload, 'm', 's1');
    expect(result).toEqual(bundle);
  });
});
