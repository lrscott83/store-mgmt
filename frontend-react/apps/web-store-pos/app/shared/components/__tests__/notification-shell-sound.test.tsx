import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';

const getNotificationsMock = vi.hoisted(() => vi.fn());
const markAsReadMock = vi.hoisted(() => vi.fn());
const markAllAsReadMock = vi.hoisted(() => vi.fn());

// The backend is not guaranteed to be running, so every HTTP entry point the
// shell can reach is mocked — the suite's block-real-http guard fails the run
// otherwise. Same approach as notification-shell.test.tsx.
vi.mock('~/shared/lib/notifications/notifications-http-service', () => ({
  notificationsHttpService: {
    getNotifications: getNotificationsMock,
    markAsRead: markAsReadMock,
    markAllAsRead: markAllAsReadMock,
  },
}));

const showToastErrorMock = vi.hoisted(() => vi.fn());
const showToastSuccessMock = vi.hoisted(() => vi.fn());
vi.mock('~/shared/lib/toast', () => ({
  showToastError: showToastErrorMock,
  showToastSuccess: showToastSuccessMock,
}));

const playNotificationSoundMock = vi.hoisted(() => vi.fn());
// The beep is asserted through the module's own export rather than by faking
// Web Audio again: this file is about WHEN the shell fires it, and
// notification-sound.test.ts already pins what the sound is.
vi.mock('~/shared/lib/notifications/notification-sound', () => ({
  playNotificationSound: playNotificationSoundMock,
}));

let mockUser: Record<string, unknown> | null = {
  id: 'sa',
  selectedStoreId: 's1',
  isSuperAdmin: true,
  isOwnerAdmin: false,
};
vi.mock('~/shared/lib/stores/auth-store', () => {
  const useAuthStore = vi.fn((selector?: (s: { user: unknown }) => unknown) => {
    const state = { user: mockUser };
    if (typeof selector === 'function') return selector(state);
    return state;
  });
  return { useAuthStore };
});

import { NotificationShell } from '../notification-shell';
import type { NotificationDto } from '~/shared/lib/notifications/notifications-types';

function success<T>(data: T) {
  return { data, succeeded: true, message: null, actionCode: 200, errors: [] };
}

function notification(overrides: Partial<NotificationDto> = {}): NotificationDto {
  return {
    id: 'n1',
    ownerName: 'Ana Gómez',
    ownerCellPhone: '+5491122334455',
    storeName: 'Ferretería del Sur',
    createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    isRead: false,
    readAt: null,
    ...overrides,
  };
}

function list(payload: { items?: NotificationDto[]; unreadCount?: number }) {
  return success({ items: payload.items ?? [], unreadCount: payload.unreadCount ?? 0 });
}

function renderShell() {
  return render(
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      <NotificationShell />
    </IntlProvider>,
  );
}

function openPanel() {
  fireEvent.click(screen.getByRole('button', { name: 'Notificaciones' }));
}

function closePanel() {
  fireEvent.click(screen.getByRole('button', { name: 'Notificaciones' }));
}

/** Installs a fake `Notification`; jsdom ships none, which is the "unsupported" case. */
const requestPermissionMock = vi.hoisted(() => vi.fn());

function installNotificationApi(permission: 'granted' | 'denied' | 'default') {
  class FakeNotification {
    static permission = permission;
    static requestPermission = requestPermissionMock;
    close = vi.fn();
    constructor(
      public title: string,
      public options?: NotificationOptions,
    ) {}
  }
  window.Notification = FakeNotification as unknown as typeof Notification;
}

describe('NotificationShell — arrival sound', () => {
  const originalNotification = window.Notification;

  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: 'sa', selectedStoreId: 's1', isSuperAdmin: true, isOwnerAdmin: false };
    requestPermissionMock.mockResolvedValue('granted');
    installNotificationApi('granted');
  });

  afterEach(() => {
    window.Notification = originalNotification;
  });

  it('beeps once when a new notification arrives', async () => {
    getNotificationsMock
      .mockResolvedValueOnce(list({ items: [], unreadCount: 0 }))
      .mockResolvedValue(list({ items: [notification({ id: 'n9' })], unreadCount: 1 }));

    renderShell();
    await waitFor(() => expect(getNotificationsMock).toHaveBeenCalledTimes(1));
    expect(playNotificationSoundMock).not.toHaveBeenCalled();

    openPanel();

    await waitFor(() => expect(playNotificationSoundMock).toHaveBeenCalledTimes(1));
  });

  it('does not beep for the initial baseline population, however unread it is', async () => {
    // Unread items already waiting when the page loads are NOT arrivals: popping
    // up — or beeping — for them is noise the user never asked for.
    getNotificationsMock.mockResolvedValue(
      list({ items: [notification({ id: 'a' }), notification({ id: 'b' })], unreadCount: 2 }),
    );

    renderShell();
    await waitFor(() => expect(getNotificationsMock).toHaveBeenCalled());
    openPanel();
    await waitFor(() => expect(getNotificationsMock).toHaveBeenCalledTimes(2));

    expect(playNotificationSoundMock).not.toHaveBeenCalled();
  });

  it('beeps again for each distinct arrival, but not for a refresh that repeats one', async () => {
    getNotificationsMock
      .mockResolvedValueOnce(list({ items: [], unreadCount: 0 }))
      .mockResolvedValue(list({ items: [notification({ id: 'n9' })], unreadCount: 1 }));

    renderShell();
    await waitFor(() => expect(getNotificationsMock).toHaveBeenCalledTimes(1));
    openPanel();
    await waitFor(() => expect(playNotificationSoundMock).toHaveBeenCalledTimes(1));

    // Same id again: a re-poll is not an arrival. The bell toggles, so closing
    // it first is what lets the next click refresh instead of just closing.
    closePanel();
    openPanel();
    await waitFor(() => expect(getNotificationsMock).toHaveBeenCalledTimes(3));
    expect(playNotificationSoundMock).toHaveBeenCalledTimes(1);

    // A genuinely new id on top of the previous one: one more beep.
    closePanel();
    getNotificationsMock.mockResolvedValue(
      list({ items: [notification({ id: 'n10' }), notification({ id: 'n9' })], unreadCount: 2 }),
    );
    openPanel();

    await waitFor(() => expect(playNotificationSoundMock).toHaveBeenCalledTimes(2));
  });

  it('beeps even with the OS permission denied, and keeps the bell working', async () => {
    // The sound is in-app and independent of the Notification API: a blocked
    // popup must not cost the user the audible cue as well. That the beep call
    // itself never rejects is `playNotificationSound`'s own contract, pinned in
    // notification-sound.test.ts — this file only owns WHEN the shell calls it.
    installNotificationApi('denied');
    getNotificationsMock
      .mockResolvedValueOnce(list({ items: [], unreadCount: 0 }))
      .mockResolvedValue(list({ items: [notification({ id: 'n9' })], unreadCount: 1 }));

    renderShell();
    await waitFor(() => expect(getNotificationsMock).toHaveBeenCalledTimes(1));
    openPanel();

    await waitFor(() => expect(playNotificationSoundMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('notification-badge')).toHaveTextContent('1'));
    expect(screen.getByTestId('notification-item-n9')).toBeInTheDocument();
  });

  it('never beeps for a non-SuperAdmin user', async () => {
    mockUser = { id: 'u1', selectedStoreId: 's1', isSuperAdmin: false, isOwnerAdmin: true };
    getNotificationsMock.mockResolvedValue(list({ items: [notification()], unreadCount: 1 }));

    renderShell();
    await waitFor(() => expect(getNotificationsMock).not.toHaveBeenCalled());

    expect(playNotificationSoundMock).not.toHaveBeenCalled();
  });
});

describe('NotificationShell — recovering a denied permission', () => {
  const originalNotification = window.Notification;

  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: 'sa', selectedStoreId: 's1', isSuperAdmin: true, isOwnerAdmin: false };
    getNotificationsMock.mockResolvedValue(list({ items: [], unreadCount: 0 }));
    requestPermissionMock.mockResolvedValue('granted');
  });

  afterEach(() => {
    window.Notification = originalNotification;
  });

  it('offers a recovery control only when the permission is denied, and re-requests on click', async () => {
    installNotificationApi('denied');

    renderShell();
    await waitFor(() => expect(getNotificationsMock).toHaveBeenCalled());
    openPanel();

    // The automatic prompt already gave up, so it is never asked again...
    expect(requestPermissionMock).not.toHaveBeenCalled();
    // ...but the panel exposes the one exit the page still has.
    expect(screen.getByTestId('notification-permission-recovery')).toBeInTheDocument();

    requestPermissionMock.mockResolvedValue('granted');
    fireEvent.click(screen.getByRole('button', { name: 'Volver a pedir permiso' }));

    await waitFor(() => expect(requestPermissionMock).toHaveBeenCalledTimes(1));
    // Granted: the control disappears and the outcome is confirmed.
    await waitFor(() =>
      expect(screen.queryByTestId('notification-permission-recovery')).not.toBeInTheDocument(),
    );
    expect(showToastSuccessMock).toHaveBeenCalledWith(
      'Se activaron las notificaciones del navegador.',
    );
  });

  it('keeps the control and explains itself when the browser refuses again', async () => {
    installNotificationApi('denied');
    requestPermissionMock.mockResolvedValue('denied');

    renderShell();
    await waitFor(() => expect(getNotificationsMock).toHaveBeenCalled());
    openPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Volver a pedir permiso' }));

    // Most browsers persist a block per origin and answer 'denied' without
    // prompting. A button that silently does nothing would look broken, so the
    // outcome is reported and the control stays for the next attempt.
    await waitFor(() =>
      expect(showToastErrorMock).toHaveBeenCalledWith(
        'El navegador sigue bloqueando las notificaciones. Habilítelas en los ajustes del sitio.',
      ),
    );
    expect(screen.getByTestId('notification-permission-recovery')).toBeInTheDocument();
  });

  it('does not throw when the browser rejects the re-request', async () => {
    installNotificationApi('denied');
    requestPermissionMock.mockRejectedValue(new Error('request blew up'));

    renderShell();
    await waitFor(() => expect(getNotificationsMock).toHaveBeenCalled());
    openPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Volver a pedir permiso' }));

    await waitFor(() => expect(screen.getByTestId('notification-badge')).toBeInTheDocument());
    expect(screen.getByTestId('notification-permission-recovery')).toBeInTheDocument();
  });

  it('shows no recovery control when the permission is granted', async () => {
    installNotificationApi('granted');

    renderShell();
    await waitFor(() => expect(getNotificationsMock).toHaveBeenCalled());
    openPanel();

    expect(screen.queryByTestId('notification-permission-recovery')).not.toBeInTheDocument();
  });

  it('shows no recovery control in a browser without the Notification API', async () => {
    window.Notification = undefined as unknown as typeof Notification;

    renderShell();
    await waitFor(() => expect(getNotificationsMock).toHaveBeenCalled());
    openPanel();

    // Nothing to recover: there is no permission to grant.
    expect(screen.queryByTestId('notification-permission-recovery')).not.toBeInTheDocument();
  });
});