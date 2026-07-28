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
 * Serializes a roster bundle into a single-entry (`roster.json`)
 * AES-encrypted zip, matching `offline-roster-bundle`'s "Bundle container
 * round-trips losslessly" requirement.
 */
export async function serializeRoster(
  bundle: OfflineRosterBundle,
  master: string,
  storeId: string,
): Promise<Uint8Array> {
  const zipWriter = new ZipWriter(new BlobWriter('application/zip'), {
    password: derivePassword(master, storeId),
  });
  await zipWriter.add(ROSTER_ENTRY_NAME, new TextReader(JSON.stringify(bundle)));
  const blob = await zipWriter.close();
  return new Uint8Array(await blob.arrayBuffer());
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
  const zipReader = new ZipReader(new BlobReader(blob), {
    password: derivePassword(master, storeId),
  });

  let entries: Awaited<ReturnType<typeof zipReader.getEntries>>;
  try {
    entries = await zipReader.getEntries();
  } catch {
    throw new CorruptFileError('ZIP extraction failed');
  }

  const entry = entries.find((e) => e.filename === ROSTER_ENTRY_NAME && !e.directory && e.getData);
  if (!entry || !entry.getData) {
    await zipReader.close();
    throw new CorruptFileError(`Missing ${ROSTER_ENTRY_NAME} entry`);
  }

  let text: string;
  try {
    text = await entry.getData(new TextWriter());
  } catch (err) {
    await zipReader.close();
    if (err instanceof Error && err.message === 'Invalid password') {
      throw new WrongPasswordError();
    }
    throw new WrongPasswordError('Decryption failed');
  }
  await zipReader.close();

  try {
    return JSON.parse(text) as OfflineRosterBundle;
  } catch {
    throw new CorruptFileError(`Invalid JSON in ${ROSTER_ENTRY_NAME}`);
  }
}
