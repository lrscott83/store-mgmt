import { decryptEntity } from './entity-crypto';

/**
 * A stored entity exists but cannot be turned back into a value: its ciphertext
 * failed to authenticate, or its plaintext failed to parse. Distinct from
 * `MissingDataKeyError`, which means the bytes are fine and the key is not here
 * — that one is recoverable, this one is not, and the two owe the user
 * different messages (design D5).
 */
export class EntityUnreadableError extends Error {
  readonly name = 'EntityUnreadableError';
  constructor(
    readonly storageKey: string,
    readonly reason: unknown,
  ) {
    super(`Stored entity at "${storageKey}" could not be read`);
    Object.setPrototypeOf(this, EntityUnreadableError.prototype);
  }
}

/**
 * The three-state read at the storage boundary (design D4):
 *   - key absent            -> `null`; the caller may auto-initialise, because
 *                              "no data" is a genuinely new store.
 *   - key present, readable -> the parsed value (or `null` if `parse` vetoes,
 *                              e.g. the empty-map sentinel `'{}'`).
 *   - key present, unreadable -> THROWS. Never returns, and never writes.
 *
 * The last state is the whole point. The six entity read paths used to catch it
 * and write an empty value over the unreadable one, turning an intact store into
 * an empty one. Since every mutation reads before it writes, throwing here also
 * stops the mutation — no separate write guard is needed.
 *
 * `MissingDataKeyError` passes through unchanged; everything else becomes
 * `EntityUnreadableError`, so callers upstream can tell "recoverable" from
 * "damaged" without string-matching.
 */
export function readEntityOrThrow<T>(
  storageKey: string,
  parse: (plaintext: string) => T | null,
): T | null {
  const stored = localStorage.getItem(storageKey);
  if (stored === null) return null;

  let plaintext: string | null;
  try {
    plaintext = decryptEntity(stored);
  } catch (err) {
    // Matched on `name`, not `instanceof`: entity-crypto is reachable through
    // more than one module instance in tests, so class identity is not
    // guaranteed (same precedent as auth-store's SessionRejectedError note).
    if ((err as { name?: string })?.name === 'MissingDataKeyError') throw err;
    throw new EntityUnreadableError(storageKey, err);
  }

  if (plaintext === null) return null;

  try {
    return parse(plaintext);
  } catch (err) {
    throw new EntityUnreadableError(storageKey, err);
  }
}
