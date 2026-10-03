/**
 * Browser-notification permission, feature-detected and SSR-safe.
 *
 * This app renders on the server, so NOTHING here may touch `window` or
 * `Notification` at module scope — every access is lazy and guarded.
 *
 * The OS prompt is the most intrusive thing this feature does, so it is asked
 * AT MOST ONCE per session and never after the user has already denied it:
 * re-prompting a denied permission is browser-refused noise with no possible
 * outcome. Every entry point is total — a rejecting or throwing browser API
 * degrades to the in-app bell, never to a broken header.
 */

export type NotificationPermissionState = 'unsupported' | 'default' | 'granted' | 'denied';

export interface SystemNotificationInput {
  body: string;
  tag?: string;
}

/**
 * One ask per module lifetime. `permission === 'denied'` is checked separately
 * in `requestNotificationPermission` because it must hold even after a reload
 * of this module (browsers persist 'denied' per origin).
 */
let hasRequestedPermission = false;

/**
 * Resolves the `Notification` constructor or null when it does not exist —
 * server render, or a browser without the Notification API.
 */
function getNotificationConstructor(): typeof Notification | null {
  if (typeof window === 'undefined') return null;
  return typeof window.Notification === 'function' ? window.Notification : null;
}

/** Current permission, or 'unsupported' when the API is missing. Never throws. */
export function getNotificationPermission(): NotificationPermissionState {
  try {
    const ctor = getNotificationConstructor();
    if (!ctor) return 'unsupported';
    return ctor.permission;
  } catch {
    return 'unsupported';
  }
}

/**
 * Asks for permission once. Returns the resulting state without prompting when:
 * - the API is missing (SSR / unsupported browser),
 * - the answer is already 'granted',
 * - the answer is already 'denied' (browsers refuse re-prompts anyway),
 * - this module already asked.
 */
export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  try {
    const ctor = getNotificationConstructor();
    if (!ctor) return 'unsupported';
    if (ctor.permission !== 'default') return ctor.permission;
    if (hasRequestedPermission) return ctor.permission;
    hasRequestedPermission = true;
    return await ctor.requestPermission();
  } catch {
    // A browser that refuses the request (or throws on it) is not an error the
    // user needs to see: the in-app bell already delivered the notice.
    return 'denied';
  }
}

/**
 * Fires an OS notification when permission is granted. Returns whether it was
 * actually shown, and never throws — a shell must not break over a popup.
 */
export function showSystemNotification(title: string, input: SystemNotificationInput): boolean {
  try {
    const ctor = getNotificationConstructor();
    if (!ctor || ctor.permission !== 'granted') return false;
    // Auto-dismiss: without this the popup lingers until the user clicks it away.
    const notification = new ctor(title, { body: input.body, tag: input.tag });
    setTimeout(() => {
      try {
        notification.close();
      } catch {
        // Already closed by the user, or a browser without a working close().
      }
    }, 10_000);
    return true;
  } catch {
    return false;
  }
}