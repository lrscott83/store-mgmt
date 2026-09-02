import {
  BlobReader,
  BlobWriter,
  TextReader,
  TextWriter,
  ZipReader,
  ZipWriter,
  configure,
} from '@zip.js/zip.js';
import type { OfflineRosterBundle } from './roster-types';

// ---------------------------------------------------------------------------
// zip.js runtime configuration
// ---------------------------------------------------------------------------
//
// This is a top-level side effect, but this module is NOT `roster-store.ts`
// (design D1 explicitly quarantines the purity constraint to that one file) —
// `roster-serializer.ts` is only ever reached from `provision.tsx`'s static
// import graph or the admin export panel, never on every unprovisioned
// login. Matches `data-serializer-service.ts:30`'s same rationale: disables
// Web Worker offload (unavailable under Vitest/jsdom), no effect on the
// produced ZIP bytes/format.
configure({ useWebWorkers: false });

const ROSTER_ENTRY_NAME = 'roster.json';
const ROSTER_META_ENTRY_NAME = 'meta.json';

/**
 * Plaintext envelope entry (roster-any-filename): the storeId the archive
 * password needs travels INSIDE the zip, unencrypted, so the file's name is
 * no longer load-bearing. Mirrors `data-serializer-service.ts`'s v2
 * `meta.json` precedent — never contains entity data, only routing facts.
 */
export interface RosterEnvelope {
  storeId: string;
}

export class WrongPasswordError extends Error {
  readonly name = 'WrongPasswordError';
  constructor(message = 'Wrong password or corrupted file') {
    super(message);
    Object.setPrototypeOf(this, WrongPasswordError.prototype);
  }
}

export class CorruptFileError extends Error {
  readonly name = 'CorruptFileError';
  constructor(message = 'File is corrupt or has an unsupported format') {
    super(message);
    Object.setPrototypeOf(this, CorruptFileError.prototype);
  }
}

function derivePassword(master: string, storeId: string): string {
  // Spec offline-roster-bundle: password is the concatenation `${master}${storeId}`
  // (master first) — NOT Angular sync's `password + storeId` convention by
  // coincidence, but the same concatenation shape.
  return `${master}${storeId}`;
}

/**
 * Serializes a roster bundle into a two-entry AES-encrypted zip: the
 * unencrypted `meta.json` envelope first, then the `roster.json` payload
 * encrypted under `${master}${storeId}` — matching `offline-roster-bundle`'s
 * "Bundle container round-trips losslessly" requirement.
 */
export async function serializeRoster(
  bundle: OfflineRosterBundle,
  master: string,
  storeId: string,
): Promise<Uint8Array> {
  // Writer-level password, NO rawPassword per entry: the envelope entry is
  // added through its OWN password-less writer, then merged is unnecessary —
  // zip.js applies the writer password only to entries added with it, so we
  // create the archive in one pass using rawPassword on the payload entry
  // only (same technique data-serializer-service.ts:291-311 uses).
  const zipWriter = new ZipWriter(new BlobWriter('application/zip'));
  const envelope: RosterEnvelope = { storeId };
  await zipWriter.add(ROSTER_META_ENTRY_NAME, new TextReader(JSON.stringify(envelope)));
  await zipWriter.add(ROSTER_ENTRY_NAME, new TextReader(JSON.stringify(bundle)), {
    password: derivePassword(master, storeId),
  });
  const blob = await zipWriter.close();
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Reads the plaintext `meta.json` envelope — the storeId source for the
 * import path. Returns null for anything that is not an export carrying a
 * well-formed envelope (garbage bytes, a zip without meta.json, invalid
 * JSON, or a missing/non-string storeId): null means "not an activation
 * file", never "wrong password".
 */
export async function readRosterEnvelope(payload: Uint8Array): Promise<RosterEnvelope | null> {
  let entries: Awaited<ReturnType<typeof ZipReader.prototype.getEntries>>;
  try {
    const zipReader = new ZipReader(new BlobReader(new Blob([payload])));
    entries = await zipReader.getEntries();
    await zipReader.close();
  } catch {
    return null;
  }

  let text: string | undefined;
  for (const entry of entries) {
    if (entry.directory || entry.filename !== ROSTER_META_ENTRY_NAME || !entry.getData) continue;
    try {
      text = await entry.getData(new TextWriter());
    } catch {
      return null;
    }
    break;
  }
  if (text === undefined) return null;

  try {
    const parsed = JSON.parse(text) as Partial<RosterEnvelope>;
    if (typeof parsed.storeId !== 'string' || !parsed.storeId) return null;
    return { storeId: parsed.storeId };
  } catch {
    return null;
  }
}

/**
 * Deserializes a roster bundle container. Throws `WrongPasswordError` for an
 * incorrect master password and `CorruptFileError` for a structurally
 * invalid file — mirroring `data-serializer-service.ts:36-50`'s error
 * pattern (`readonly name` + `Object.setPrototypeOf`).
 */
export async function deserializeRoster(
  payload: Uint8Array,
  master: string,
  storeId: string,
): Promise<OfflineRosterBundle> {
  const blob = new Blob([payload]);
  // No reader-level password on purpose (data-serializer-service.ts:327-330
  // technique): the meta.json envelope entry is plaintext, the roster.json
  // payload carries its own per-entry password.
  const zipReader = new ZipReader(new BlobReader(blob));

  let entries: Awaited<ReturnType<typeof zipReader.getEntries>>;
  try {
    entries = await zipReader.getEntries();
  } catch {
    throw new CorruptFileError('ZIP extraction failed');
  }

  // Mirrors `data-serializer-service.ts:219`'s narrowing idiom: within the
  // `||`, evaluating `!entry.getData` narrows `entry` to `FileEntry` (the
  // only union member whose `directory` literal is `false`), so this loop —
  // unlike an `Array.prototype.find` predicate, whose narrowing doesn't
  // propagate to the returned value — keeps `entry.getData` well-typed.
  let text: string | undefined;
  for (const entry of entries) {
    if (entry.directory || entry.filename !== ROSTER_ENTRY_NAME || !entry.getData) continue;
    try {
      text = await entry.getData(new TextWriter(), {
        password: derivePassword(master, storeId),
      });
    } catch (err) {
      await zipReader.close();
      if (err instanceof Error && err.message === 'Invalid password') {
        throw new WrongPasswordError();
      }
      throw new WrongPasswordError('Decryption failed');
    }
    break;
  }

  if (text === undefined) {
    await zipReader.close();
    throw new CorruptFileError(`Missing ${ROSTER_ENTRY_NAME} entry`);
  }
  await zipReader.close();

  try {
    return JSON.parse(text) as OfflineRosterBundle;
  } catch {
    throw new CorruptFileError(`Invalid JSON in ${ROSTER_ENTRY_NAME}`);
  }
}
