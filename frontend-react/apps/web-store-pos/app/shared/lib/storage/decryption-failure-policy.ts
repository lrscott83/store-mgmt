import { showBlockingError } from '../blocking-alert';
import messages from '../i18n/es';
import { useAuthStore } from '../stores/auth-store';

// Note for anyone tidying imports: these three are static here, but
// `auth-store.ts` reaches BACK for `resetDecryptionFailureLatch` through a
// DYNAMIC import, and must keep doing so. This module importing `auth-store`
// is what makes the reverse edge a cycle, and `auth-store` is evaluated on
// every page load, so a static edge there would also drag sweetalert2 (via
// `blocking-alert` above) into every cold boot.

/**
 * Which of the two decryption failures happened, and therefore which truth the
 * user is owed:
 *   - `missing-key`: the bytes are intact, this device just cannot open them.
 *     Recoverable — an online login or a roster import brings the key back.
 *   - `damaged`: the bytes themselves did not authenticate or parse. Nothing
 *     the user can do restores them, so the message must not promise recovery.
 */
export type DecryptionFailureKind = 'missing-key' | 'damaged';

/**
 * Matched on `name`, never `instanceof`: these errors cross dynamic-import
 * boundaries in this codebase, so class identity is not guaranteed to be the
 * one this module closed over.
 *
 * Deliberately NOT a catch-all — an error this policy does not recognise is
 * `null`, and its caller leaves it alone. Relabelling an unrelated bug as
 * "your data cannot be read" would hide it and sign the user out for nothing.
 *
 * New failure types are added by mapping their `name` here; the two consumers
 * (`handleDecryptionFailure`, and the tests) need no change.
 */
export function classifyDecryptionFailure(error: unknown): DecryptionFailureKind | null {
  const name = (error as { name?: unknown } | null | undefined)?.name;
  if (name === 'MissingDataKeyError') return 'missing-key';
  // Task 5: a login that cannot unwrap this device's DEK (no device-key wrap,
  // or a roster wrap that does not open with the password just used) is the
  // same recoverable story as a missing key — an online login or a roster
  // import brings it back.
  if (name === 'DekUnwrapError') return 'missing-key';
  if (name === 'EntityUnreadableError') return 'damaged';
  return null;
}

// One dialog per failure, not one per rejected promise: a screen that loads two
// entities in parallel (categories and products, say) produces two rejections
// from a single cause, and the user must not be shown two dialogs and be
// signed out twice.
let announced = false;

/**
 * Cleared by a successful login — the one event that means "this device can
 * read again" — so a later failure is announced instead of being swallowed for
 * the lifetime of the tab.
 */
export function resetDecryptionFailureLatch(): void {
  announced = false;
}

/**
 * The app-wide response to a decryption failure: say what happened once, then
 * end the session. `logout()` lands the user on `/login`, which is where both
 * recovery routes live (sign in online, or import another roster) — and is
 * safe to call from `/login` itself, where it skips the redirect.
 *
 * Returns whether this error was ours. `true` covers the latched case too: the
 * second rejection of one cause IS handled, it just does not speak, and its
 * caller must still stop it from surfacing as an unhandled rejection.
 */
export function handleDecryptionFailure(error: unknown): boolean {
  const kind = classifyDecryptionFailure(error);
  if (kind === null) return false;
  if (announced) return true;
  announced = true;

  showBlockingError(
    messages['GENERAL.ERROR'],
    kind === 'missing-key'
      ? messages['ENCRYPTION.KEY_UNAVAILABLE']
      : messages['ENCRYPTION.DATA_DAMAGED'],
  );

  useAuthStore.getState().logout();
  return true;
}

/**
 * Installs the app-wide listener for decryption failures that arrive as
 * REJECTED PROMISES (design D5) — the fire-and-forget reads scattered across
 * the authenticated routes, which no `catch` is waiting on. Returns an
 * unsubscribe so the effect that installs it can tear it down.
 *
 * The other arrival shape — a throw during render or in a loader — is caught
 * by root.tsx's `ErrorBoundary`, which calls `handleDecryptionFailure`
 * directly. Two seams, one policy.
 */
export function registerDecryptionFailurePolicy(): () => void {
  const onRejection = (event: PromiseRejectionEvent) => {
    if (handleDecryptionFailure(event.reason)) event.preventDefault();
  };
  window.addEventListener('unhandledrejection', onRejection);
  return () => window.removeEventListener('unhandledrejection', onRejection);
}
