import { deserializeRoster } from './roster-serializer';
import { importRoster } from './roster-store';

/**
 * The export writes `roster-<storeId>.smcabundle`
 * (`management/users/components/roster-export-panel.tsx:56`), so the store id
 * the archive password needs already travels in the filename.
 *
 * The GUID shape is REQUIRED, not a convenience. A loose `(.+)` would happily
 * accept a renamed file, hand the wrong id to `deserializeRoster`, and surface
 * the result as `WrongPasswordError` — telling the user their correct password
 * is wrong. Refusing to guess is what makes `UnknownFileError` possible.
 */
const ROSTER_FILENAME_PATTERN =
  /^roster-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.smcabundle$/i;

/** The filename carries no recoverable store id (renamed, or not an export at all). */
export class UnknownFileError extends Error {
  constructor(message = 'The filename carries no store id') {
    super(message);
    this.name = 'UnknownFileError';
  }
}

export function deriveStoreIdFromFilename(filename: string): string | null {
  return ROSTER_FILENAME_PATTERN.exec(filename)?.[1] ?? null;
}

/**
 * The ONE import path, shared by the login dialog and `/auth/provision` so a
 * failure can never mean two different things in two places.
 *
 * `storeId` is optional: the route passes its typed field, the dialog passes
 * nothing and gets the filename derivation. A blank or whitespace-only value
 * counts as absent — `provision.tsx`'s field starts as `''` and is not
 * required, and falling back to the filename beats failing as "wrong password".
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
  const storeId = explicit ? explicit : deriveStoreIdFromFilename(file.name);
  if (storeId === null) {
    throw new UnknownFileError();
  }

  const payload = new Uint8Array(await file.arrayBuffer());
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
