import { deserializeRoster, readRosterEnvelope } from './roster-serializer';
import { importRoster } from './roster-store';

/**
 * The storeId the archive password needs travels INSIDE the zip, in the
 * plaintext `meta.json` envelope (`roster-serializer.ts`), so the import
 * works under ANY file name — the export's `roster-<storeId>.smcabundle`
 * name is a convention, not a contract.
 */

/** The archive carries no readable activation envelope — not an export. */
export class UnknownFileError extends Error {
  constructor(message = 'The archive carries no activation envelope') {
    super(message);
    this.name = 'UnknownFileError';
  }
}

/**
 * The ONE import path, shared by the login dialog and `/auth/provision` so a
 * failure can never mean two different things in two places.
 *
 * `storeId` is optional: the route passes its typed field, the dialog passes
 * nothing and gets the envelope's. A blank or whitespace-only value counts as
 * absent — `provision.tsx`'s field starts as `''` and is not required, and
 * falling back to the envelope beats failing as "wrong password".
 *
 * Throws `UnknownFileError`, or propagates `WrongPasswordError`,
 * `CorruptFileError`, `ExpiredBundleError` and `ReplayBundleError` untouched.
 */
export async function importRosterFile(args: {
  file: File;
  master: string;
  storeId?: string;
}): Promise<void> {
  const { file, master } = args;
  const explicit = args.storeId?.trim();
  const payload = new Uint8Array(await file.arrayBuffer());

  const storeId = explicit ? explicit : (await readRosterEnvelope(payload))?.storeId;
  if (storeId === null || storeId === undefined || storeId === '') {
    throw new UnknownFileError();
  }

  const bundle = await deserializeRoster(payload, master, storeId);
  importRoster(bundle);
}

/**
 * Dispatches by `err.name`, never `instanceof` — the shape `provision.tsx`
 * already used, and the only one that survives the module being reached
 * through a dynamic `import()`.
 */
export function rosterImportErrorMessageId(err: unknown): string {
  switch ((err as { name?: string } | null)?.name) {
    case 'WrongPasswordError':
      return 'PROVISION.ERROR_WRONG_PASSWORD';
    case 'CorruptFileError':
      return 'PROVISION.ERROR_CORRUPT_FILE';
    case 'ExpiredBundleError':
      return 'PROVISION.ERROR_EXPIRED';
    case 'ReplayBundleError':
      return 'PROVISION.ERROR_REPLAY';
    case 'UnknownFileError':
      return 'PROVISION.ERROR_UNKNOWN_FILE';
    default:
      return 'PROVISION.ERROR_CORRUPT_FILE';
  }
}
