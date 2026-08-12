import { MissingDataKeyError } from './entity-crypto';
import { showBlockingError } from '../blocking-alert';

/**
 * Wraps an async call that is typed to never reject but can, in practice, throw
 * `MissingDataKeyError` when encryption is provisioned and no data key is in memory
 * (`entity-crypto.ts`'s `decryptEntity`/`encryptEntity`). Surfaces that one failure mode as a
 * blocking error instead of an unhandled promise rejection; any other error re-throws
 * unchanged, so an unrelated bug is never silently relabeled "reload the page".
 *
 * `fn` reports its own outcome by returning `true`/`false` (e.g. a domain-level failure it
 * already surfaced itself) — the wrapper resolves that same boolean straight through. Only a
 * caught `MissingDataKeyError` forces the result to `false`, after showing its own message.
 * This lets a caller write `const ok = await runGuardedAgainstMissingDek(...); if (!ok) return;`
 * instead of hoisting a mutable flag that `fn` assigns as an out-parameter.
 */
export async function runGuardedAgainstMissingDek(
  fn: () => Promise<boolean>,
  title: string,
  message: string,
): Promise<boolean> {
  try {
    return await fn();
  } catch (err) {
    if (!(err instanceof MissingDataKeyError)) throw err;
    showBlockingError(title, message);
    return false;
  }
}
