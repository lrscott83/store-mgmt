import { useRef, useState, useEffect, useCallback } from 'react';
import { useIntl } from 'react-intl';
import type { IntlShape } from 'react-intl';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { isSuperAdmin } from '~/shared/lib/auth/authorization-service';
import { useClickOutside } from '~/shared/lib/hooks/use-click-outside';
import { useOnlineStatus } from '~/shared/lib/hooks/use-online-status';
import { showToastError } from '~/shared/lib/toast';
import { notificationsHttpService } from '~/shared/lib/notifications/notifications-http-service';
import {
  getNotificationPermission,
  requestNotificationPermission,
  showSystemNotification,
} from '~/shared/lib/notifications/notification-permission';
import type { NotificationDto } from '~/shared/lib/notifications/notifications-types';

/**
 * Adaptive background polling, NOT `setInterval` — the same decision and the
 * same reasoning as `MessageShell`'s ladder (ODD T10): the next delay must be a
 * function of what the last poll found, which a fixed interval cannot express.
 * Offline and a hidden tab both pause rather than widen (leaving the tab is not
 * idleness), and `visibilitychange`/`focus` re-arm at the fastest step so a
 * timer lost to backgrounding can never go unnoticed.
 *
 * There is no SignalR hub here on purpose: the feature needs an in-app bell, and
 * a second hub would grow the realtime surface without the requirement asking
 * for it. The ladder is the whole delivery mechanism.
 */
const POLL_LADDER_MS = [15_000, 30_000, 60_000, 120_000, 300_000] as const;

/**
 * Activity is the set of UNREAD ids. That is the ladder's signal and the popup's
 * trigger in one value: a new registration adds an id (activity, and a popup), a
 * read receipt removes one (the user acted, so re-arming fast is correct, and
 * it must NOT fire a popup because nothing arrived).
 */
function unreadSignature(items: readonly NotificationDto[]): string {
  return items
    .filter((item) => !item.isRead)
    .map((item) => item.id)
    .sort()
    .join('|');
}

/**
 * Relative for the last week, absolute beyond it — "hace 3 días" stops being
 * useful after a week, and an old registration should read as a date, not as a
 * vague "hace 3 meses" that hides which month it was.
 */
function formatNotificationWhen(intl: IntlShape, value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000);
  const absoluteMinutes = Math.abs(minutes);
  if (absoluteMinutes < 60) return intl.formatRelativeTime(minutes, 'minute');
  if (absoluteMinutes < 60 * 24) return intl.formatRelativeTime(Math.round(minutes / 60), 'hour');
  if (absoluteMinutes < 60 * 24 * 7) {
    return intl.formatRelativeTime(Math.round(minutes / (60 * 24)), 'day');
  }
  return `${intl.formatDate(date, { year: 'numeric', month: 'short', day: '2-digit' })} ${intl.formatTime(date, { hour: '2-digit', minute: '2-digit' })}`;
}

export function NotificationShell() {
  const intl = useIntl();
  const user = useAuthStore((s) => s.user);
  const isOnline = useOnlineStatus();
  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState<readonly NotificationDto[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const shellRef = useRef<HTMLDivElement>(null);
  const isOpenRef = useRef(false);
  /** Baseline of unread ids, compared to detect arrivals. */
  const unreadSignatureRef = useRef('');
  /**
   * Whether a baseline has ever landed. This CANNOT be inferred from the
   * signature being empty: an empty signature legitimately means "the bell is
   * empty", and the very first registration after that must still fire its
   * popup. Conflating the two silently swallowed exactly that notification.
   */
  const hasBaselineRef = useRef(false);
  /** Re-arms the poll ladder at its fastest step. Assigned by the poll effect. */
  const resetPollRef = useRef<(immediate: boolean) => void>(() => {});

  function setPanelOpen(open: boolean) {
    isOpenRef.current = open;
    setIsOpen(open);
  }

  useClickOutside(shellRef, () => setPanelOpen(false));

  /**
   * Fetches the bell and reports whether the unread set actually moved — that
   * boolean drives the ladder.
   *
   * A BACKGROUND call drives no loading overlay and reports no error toast: it
   * runs on a timer, so a spinner or a toast every cycle is a visible bug. A
   * user-initiated call keeps both.
   */
  const refresh = useCallback(
    async (options?: { background?: boolean }): Promise<boolean> => {
      if (!user || !isSuperAdmin(user)) return false;
      const background = options?.background === true;
      try {
        // Only the background branch adds the option; a foreground call keeps
        // passing exactly the arguments it always has.
        const response = background
          ? await notificationsHttpService.getNotifications({ background: true })
          : await notificationsHttpService.getNotifications();
        if (!response.succeeded) return false;

        const nextItems = response.data.items ?? [];
        setItems(nextItems);
        setUnreadCount(response.data.unreadCount ?? 0);

        const signature = unreadSignature(nextItems);
        const previous = unreadSignatureRef.current;
        unreadSignatureRef.current = signature;
        // The first fetch only establishes the baseline. Popping up a system
        // notification for every unread item the user already missed while the
        // page loaded is noise, not notification.
        if (!hasBaselineRef.current) {
          hasBaselineRef.current = true;
          return false;
        }

        const previousIds = new Set(previous.length > 0 ? previous.split('|') : []);
        const fresh = nextItems.filter((item) => !item.isRead && !previousIds.has(item.id));
        if (fresh.length > 0) fireSystemPopup(intl, fresh[0]);
        return signature !== previous;
      } catch {
        if (!background) showToastError(intl.formatMessage({ id: 'NOTIFICATIONS.LOAD_ERROR' }));
        return false;
      }
    },
    [user, intl],
  );

  async function handleMarkAsRead(id: string) {
    if (!user || !isSuperAdmin(user)) return;
    try {
      const response = await notificationsHttpService.markAsRead(id);
      if (!response.succeeded) {
        showToastError(intl.formatMessage({ id: 'NOTIFICATIONS.MARK_ERROR' }));
        return;
      }
      await refresh();
    } catch {
      showToastError(intl.formatMessage({ id: 'NOTIFICATIONS.MARK_ERROR' }));
    }
  }

  async function handleMarkAllAsRead() {
    if (!user || !isSuperAdmin(user)) return;
    try {
      const response = await notificationsHttpService.markAllAsRead();
      if (!response.succeeded) {
        showToastError(intl.formatMessage({ id: 'NOTIFICATIONS.MARK_ERROR' }));
        return;
      }
      await refresh();
    } catch {
      showToastError(intl.formatMessage({ id: 'NOTIFICATIONS.MARK_ERROR' }));
    }
  }

  // Offline-first: the icon is always mounted, but the bell never touches the
  // network without a connection — same invariant as the chat's header icon.
  useEffect(() => {
    if (!isOnline) return;
    void refresh();
  }, [isOnline, refresh]);

  // Ask for the OS popup once. Feature-detected inside the helper, so this is a
  // no-op on the server and in browsers without the Notification API, and it
  // never re-asks after a denial.
  useEffect(() => {
    if (!user || !isSuperAdmin(user)) return;
    void requestNotificationPermission();
  }, [user]);

  useEffect(() => {
    if (!user || !isSuperAdmin(user)) return;
    // Returning to the window is foreground too, even when the tab never hid.
    function handleFocus() {
      resetPollRef.current(true);
    }
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [user]);

  useEffect(() => {
    if (!user || !isSuperAdmin(user)) return;
    let cancelled = false;
    let step = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const loop = async () => {
      if (cancelled) return;
      if (!isOnline) {
        // No connection: never poll. The online transition re-arms the ladder.
        timer = setTimeout(loop, POLL_LADDER_MS[POLL_LADDER_MS.length - 1]);
        return;
      }
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        // Hidden: don't poll, and don't widen — leaving the tab is not idleness.
        timer = setTimeout(loop, POLL_LADDER_MS[POLL_LADDER_MS.length - 1]);
        return;
      }
      const changed = await refresh({ background: true });
      if (cancelled) return;
      step = changed ? 0 : Math.min(step + 1, POLL_LADDER_MS.length - 1);
      timer = setTimeout(loop, POLL_LADDER_MS[step]);
    };

    resetPollRef.current = (immediate) => {
      if (cancelled) return;
      step = 0;
      if (timer !== undefined) clearTimeout(timer);
      if (immediate) void loop();
      else timer = setTimeout(loop, POLL_LADDER_MS[0]);
    };

    // Foreground: never assume the timer survived a backgrounded tab.
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') resetPollRef.current(true);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    timer = setTimeout(loop, POLL_LADDER_MS[0]);

    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
      resetPollRef.current = () => {};
    };
  }, [user, isOnline, refresh]);

  function handleToggle() {
    const next = !isOpen;
    setPanelOpen(next);
    if (next && isOnline) void refresh();
  }

  // Self-gate: mounted unconditionally by the navbar, but the bell and ALL of
  // its network work belong to the SuperAdmin alone. Every effect above repeats
  // the same guard so nothing leaks before this return.
  if (!user || !isSuperAdmin(user)) return null;

  return (
    <div className="static sm:relative" ref={shellRef}>
      <button
        type="button"
        onClick={handleToggle}
        className="relative rounded-lg p-2 text-gray-500 hover:bg-gray-100 transition-colors"
        aria-label={intl.formatMessage({ id: 'NOTIFICATIONS.TITLE' })}
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0a3 3 0 11-6 0m6 0H9"
          />
        </svg>
        {/*
          The count is ALWAYS shown, zero included, exactly like the chat badge:
          a badge that appears and disappears with the total makes the icon
          itself look inactive between bursts, and a slot that reflows as the
          number grows shifts the icon under the cursor. At 0 it is muted so it
          never competes for attention.
        */}
        <span
          data-testid="notification-badge"
          className={`absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-xs font-bold text-white ${
            unreadCount > 0 ? 'bg-primary' : 'bg-text-muted'
          }`}
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-2 w-auto rounded-xl border border-border bg-surface shadow-card z-50 sm:left-auto sm:right-0 sm:w-96">
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
            <h3 className="text-sm font-semibold text-text">
              {intl.formatMessage({ id: 'NOTIFICATIONS.TITLE' })}
            </h3>
            <button
              type="button"
              onClick={() => void handleMarkAllAsRead()}
              className="rounded-md px-2 py-1 text-xs font-semibold text-primary hover:bg-primary-light transition-colors"
            >
              {intl.formatMessage({ id: 'NOTIFICATIONS.MARK_ALL' })}
            </button>
          </div>

          <div className="max-h-72 overflow-y-auto px-2 py-2">
            {items.length === 0 ? (
              <p className="px-1 py-3 text-xs text-text-muted">
                {intl.formatMessage({ id: 'NOTIFICATIONS.EMPTY' })}
              </p>
            ) : (
              <ul className="flex flex-col gap-1" data-testid="notification-list">
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => void handleMarkAsRead(item.id)}
                      data-testid={`notification-item-${item.id}`}
                      data-read={item.isRead ? 'true' : 'false'}
                      className={`w-full rounded-lg border px-2 py-1.5 text-left transition-colors ${
                        item.isRead
                          ? 'border-transparent hover:bg-surface-hover'
                          : 'border-border bg-primary-light'
                      }`}
                    >
                      <span className="block text-xs font-semibold text-text">{item.ownerName}</span>
                      <span className="block text-[11px] text-text-muted">{item.ownerCellPhone}</span>
                      <span className="block text-[11px] text-text-muted">{item.storeName}</span>
                      <span className="mt-0.5 block text-[10px] opacity-70">
                        {formatNotificationWhen(intl, item.createdAt)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Shows ONE OS notification for a newly arrived registration. Only the newest
 * is shown on purpose: three owners registering at once must not fire three
 * stacked popups, and the badge already carries the count.
 *
 * Every path is guarded — a popup that throws must never break the header.
 */
function fireSystemPopup(intl: IntlShape, item: NotificationDto): void {
  try {
    if (getNotificationPermission() !== 'granted') return;
    showSystemNotification(intl.formatMessage({ id: 'NOTIFICATIONS.SYSTEM_TITLE' }), {
      body: intl.formatMessage(
        { id: 'NOTIFICATIONS.SYSTEM_BODY' },
        {
          ownerName: item.ownerName,
          cellPhone: item.ownerCellPhone,
          storeName: item.storeName,
        },
      ),
      tag: `notification-${item.id}`,
    });
  } catch {
    // Swallowed on purpose: the in-app bell already delivered the notice.
  }
}