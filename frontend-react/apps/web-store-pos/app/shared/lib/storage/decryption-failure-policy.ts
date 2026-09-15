import { showBlockingError, showDamagedDataRecoveryDialog } from '../blocking-alert';
import messages from '../i18n/es';
import { useAuthStore } from '../stores/auth-store';
// STATIC, and unavoidably so — a deliberate departure from the plan's
// "invoke it through a dynamic import" note (§4, Fase 1). The capture has to
// be SYNCHRONOUS and has to happen BEFORE `logout()`: `logout()` calls
// `clearDek()`, so anything loaded later than that could only see raw
// ciphertext, and `import()` can never hand back a module in time to run
// before the next statement. The cost is one extra module in the cold-boot
// graph (@noble/ciphers via entity-crypto; sweetalert2 is already here through
// `blocking-alert`); the alternative is losing the readable entities this flow
// exists to save.
import {
  collectRecoveryBundle,
  offerRecoveryAfterDamage,
  type RecoveryBundle,
} from './damaged-data-recovery';

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
 * The two kinds no longer end the same way once the session is closed. A
 * missing key is recoverable, so the popup stays the single-button statement
 * it always was. Damaged bytes are not recoverable by any login, so that popup
 * also offers the only two things left to do: take a copy of what is still
 * readable, or leave the data alone. See `announceDamagedData`.
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

  if (kind === 'damaged') {
    announceDamagedData();
    return true;
  }

  showBlockingError(messages['GENERAL.ERROR'], messages['ENCRYPTION.KEY_UNAVAILABLE']);

  useAuthStore.getState().logout();
  return true;
}

/**
 * The `damaged` branch: the truth, plus a way out.
 *
 * ORDER IS LOAD-BEARING, and it is why this is not inlined above:
 *   1. `storeId` is read from the store BEFORE `logout()`, which clears the
 *      user (`user: null`) and with it the answer to "which store's data?".
 *   2. the bundle is captured BEFORE `logout()` as well, and this is the
 *      critical one: the damage is detected while the DEK is still in memory,
 *      and `logout()` calls `clearDek()`. Capturing after the logout would keep
 *      only the raw ciphertext and lose every entity that is still readable —
 *      precisely the data this flow exists to save.
 *   3. the session still ends immediately and exactly once (the standing rule:
 *      a device that cannot open its data does not get in). The popup is shown
 *      afterwards; SweetAlert owns its own DOM node, so it outlives the
 *      navigation to `/login`.
 *   4. only a user who asks for recovery — and then confirms a SECOND time —
 *      ever reaches the wipe.
 */
function announceDamagedData(): void {
  const storeId = useAuthStore.getState().user?.selectedStoreId;

  let bundle: RecoveryBundle | null = null;
  if (storeId) {
    try {
      bundle = collectRecoveryBundle(storeId);
    } catch {
      // Defensive, and deliberately not fatal: a capture that throws must not
      // swallow the sign-out or turn a damaged store into a second, different
      // failure. With no bundle there is simply nothing to offer, and the user
      // gets the popup this app has always shown.
      bundle = null;
    }
  }

  useAuthStore.getState().logout();

  if (bundle === null) {
    // No store to recover (a user without a store, or a capture that failed):
    // the single-button popup, unchanged.
    showBlockingError(messages['GENERAL.ERROR'], messages['ENCRYPTION.DATA_DAMAGED']);
    return;
  }

  void showDamagedDataRecoveryDialog(
    messages['GENERAL.ERROR'],
    messages['ENCRYPTION.DATA_DAMAGED'],
    {
      confirmButtonText: messages['ENCRYPTION.RECOVERY_ACTION'],
      cancelButtonText: messages['ENCRYPTION.RECOVERY_DISMISS'],
    },
  ).then((wantsRecovery) => {
    // "Ahora no" (and the backdrop, and Escape) land here as `false`: nothing
    // is deleted, which is what the popup text itself promised.
    if (wantsRecovery) void runRecovery(bundle);
  });
}

/**
 * The recovery the user just asked for. The bundle is already in hand, so
 * nothing here depends on the DEK that `logout()` just cleared — the file is
 * written from data captured while the key was still in memory.
 *
 * A failure is swallowed: the session is closed, the dialog is gone and the
 * user is on `/login`, so there is no surface left to report through — and
 * nothing was deleted, which is what the popup promised. The one thing this
 * deliberately does NOT do is delete on a partial failure path: the wipe is
 * the last step of `offerRecoveryAfterDamage`, never reached from here.
 */
async function runRecovery(bundle: RecoveryBundle): Promise<void> {
  try {
    await offerRecoveryAfterDamage(bundle);
  } catch {
    // See the doc comment above.
  }
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
