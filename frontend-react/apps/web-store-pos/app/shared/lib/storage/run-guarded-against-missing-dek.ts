import { MissingDataKeyError } from './entity-crypto';
import { showBlockingError } from '../blocking-alert';

/**
 * Wraps an async call that is typed to never reject but can, in practice, throw
 * `MissingDataKeyError` when encryption is provisioned and no data key is in memory
 * (`entity-crypto.ts`'s `decryptEntity`/`encryptEntity`). Surfaces that one failure mode as a
 * blocking error instead of an unhandled promise rejection; any other error re-throws
 * unchanged, so an unrelated bug is never silently relabeled "reload the page".
 */
export async function runGuardedAgainstMissingDek(
  fn: () => Promise<void>,
  title: string,
  message: string,
): Promise<void> {
  try {
    await fn();
  } catch (err) {
    if (!(err instanceof MissingDataKeyError)) throw err;
    showBlockingError(title, message);
  }
}
