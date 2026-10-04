import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';

const getNotificationsMock = vi.hoisted(() => vi.fn());
const markAsReadMock = vi.hoisted(() => vi.fn());
const markAllAsReadMock = vi.hoisted(() => vi.fn());

// The backend is not guaranteed to be running, so every HTTP entry point the
// shell can reach is mocked. This mirrors how message-shell.test.tsx mocks
// messages-http-service — and the suite's block-real-http guard would fail the
// run otherwise.
vi.mock('~/shared/lib/notifications/notifications-http-service', () => ({
  notificationsHttpService: {
    getNotifications: getNotificationsMock,
    markAsRead: markAsReadMock,
    markAllAsRead: markAllAsReadMock,
  },
}));

const showToastErrorMock = vi.hoisted(() => vi.fn());
vi.mock('~/shared/lib/toast', () => ({
  showToastError: showToastErrorMock,
  showToastSuccess: vi.fn(),
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

/**
 * Installs a fake `Notification`. jsdom ships none, which is exactly the
 * "unsupported browser" case the shell must survive; these tests cover the
 * granted and denied paths on top of it.
 */
const shownNotifications = vi.hoisted(() => [] as unknown[]);
const requestPermissionMock = vi.hoisted(() => vi.fn());

function installNotificationApi(permission: 'granted' | 'denied' | 'default') {
  class FakeNotification {
    static permission = permission;
    static requestPermission = requestPermissionMock;
    close = vi.fn();
    constructor(
      public title: string,
      public options?: NotificationOptions,
    ) {
      shownNotifications.push(this);
    }
  }
  window.Notification = FakeNotification as unknown as typeof Notification;
}

describe('NotificationShell — badge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: 'sa', selectedStoreId: 's1', isSuperAdmin: true, isOwnerAdmin: false };
    getNotificationsMock.mockResolvedValue(list({ items: [], unreadCount: 0 }));
  });

  it('renders the badge at 0 by default, before any data arrives', () => {
    getNotificationsMock.mockReturnValue(new Promise(() => {}));

    renderShell();

    expect(screen.getByTestId('notification-badge')).toHaveTextContent('0');
  });

  it('caps the badge at 99+', async () => {
    getNotificationsMock.mockResolvedValue(list({ items: [], unreadCount: 250 }));

    renderShell();

    await waitFor(() => expect(screen.getByTestId('notification-badge')).toHaveTextContent('99+'));
  });

  it('renders nothing for a non-SuperAdmin user and issues no request', async () => {
    mockUser = { id: 'u1', selectedStoreId: 's1', isSuperAdmin: false, isOwnerAdmin: true };

    renderShell();

    await waitFor(() => expect(getNotificationsMock).not.toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Notificaciones' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('notification-badge')).not.toBeInTheDocument();
  });
});

describe('NotificationShell — list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: 'sa', selectedStoreId: 's1', isSuperAdmin: true, isOwnerAdmin: false };
    getNotificationsMock.mockResolvedValue(
      list({ items: [notification()], unreadCount: 1 }),
    );
  });

  it('lists owner name, phone and store name for the SuperAdmin', async () => {
    renderShell();
    await waitFor(() => expect(getNotificationsMock).toHaveBeenCalled());
    openPanel();

    await waitFor(() => expect(screen.getByText('Ana Gómez')).toBeInTheDocument());
    expect(screen.getByText('+5491122334455')).toBeInTheDocument();
    expect(screen.getByText('Ferretería del Sur')).toBeInTheDocument();
  });

  it('marks a single notification as read and refreshes', async () => {
    markAsReadMock.mockResolvedValue(success(true));

    renderShell();
    await waitFor(() => expect(getNotificationsMock).toHaveBeenCalled());
    openPanel();
    await waitFor(() => expect(screen.getByTestId('notification-item-n1')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('notification-item-n1'));

    await waitFor(() => expect(markAsReadMock).toHaveBeenCalledWith('n1'));
    expect(getNotificationsMock.mock.calls.length).toBeGreaterThan(1);
  });

  it('marks all as read from the panel header', async () => {
    markAllAsReadMock.mockResolvedValue(success(true));

    renderShell();
    await waitFor(() => expect(getNotificationsMock).toHaveBeenCalled());
    openPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Marcar todas como leídas' }));

    await waitFor(() => expect(markAllAsReadMock).toHaveBeenCalled());
  });

  it('shows an i18n error toast and never the raw error text', async () => {
    getNotificationsMock.mockRejectedValue(new Error('raw boom, do not leak me'));

    renderShell();

    await waitFor(() =>
      expect(showToastErrorMock).toHaveBeenCalledWith(
        'No se pudieron cargar las notificaciones. Intente de nuevo.',
      ),
    );
    expect(screen.queryByText(/raw boom/)).not.toBeInTheDocument();
  });
});

describe('NotificationShell — browser notification permission', () => {
  const originalNotification = window.Notification;

  beforeEach(() => {
    vi.clearAllMocks();
    shownNotifications.length = 0;
    requestPermissionMock.mockResolvedValue('granted');
    mockUser = { id: 'sa', selectedStoreId: 's1', isSuperAdmin: true, isOwnerAdmin: false };
  });

  afterEach(() => {
    window.Notification = originalNotification;
  });

  it('fires an OS notification with the three data points when a new one arrives and permission is granted', async () => {
    installNotificationApi('granted');
    // First fetch is the baseline (nothing pops up); the panel open brings the
    // genuinely new registration.
    getNotificationsMock
      .mockResolvedValueOnce(list({ items: [], unreadCount: 0 }))
      .mockResolvedValue(list({ items: [notification({ id: 'n9' })], unreadCount: 1 }));

    renderShell();
    await waitFor(() => expect(getNotificationsMock).toHaveBeenCalledTimes(1));
    openPanel();

    await waitFor(() => expect(shownNotifications).toHaveLength(1));
    const shown = shownNotifications[0] as { title: string; options?: NotificationOptions };
    expect(shown.title).toBe('Nuevo propietario registrado');
    expect(shown.options?.body).toContain('Ana Gómez');
    expect(shown.options?.body).toContain('+5491122334455');
    expect(shown.options?.body).toContain('Ferretería del Sur');
  });

  it('never prompts and never pops up when permission is denied', async () => {
    installNotificationApi('denied');
    getNotificationsMock
      .mockResolvedValueOnce(list({ items: [], unreadCount: 0 }))
      .mockResolvedValue(list({ items: [notification({ id: 'n9' })], unreadCount: 1 }));

    renderShell();
    await waitFor(() => expect(getNotificationsMock).toHaveBeenCalledTimes(1));
    openPanel();
    await waitFor(() => expect(getNotificationsMock).toHaveBeenCalledTimes(2));

    expect(requestPermissionMock).not.toHaveBeenCalled();
    expect(shownNotifications).toHaveLength(0);
  });

  it('survives a browser without the Notification API and never prompts', async () => {
    // jsdom ships no Notification: the feature-detected no-op path.
    window.Notification = undefined as unknown as typeof Notification;
    getNotificationsMock
      .mockResolvedValueOnce(list({ items: [], unreadCount: 0 }))
      .mockResolvedValue(list({ items: [notification({ id: 'n9' })], unreadCount: 1 }));

    renderShell();
    await waitFor(() => expect(getNotificationsMock).toHaveBeenCalledTimes(1));
    openPanel();

    // The in-app bell still works; only the OS popup is unavailable.
    await waitFor(() => expect(screen.getByTestId('notification-badge')).toHaveTextContent('1'));
    expect(screen.getByTestId('notification-item-n9')).toBeInTheDocument();
    expect(requestPermissionMock).not.toHaveBeenCalled();
  });

  it('does not throw when the browser rejects the permission request', async () => {
    installNotificationApi('default');
    requestPermissionMock.mockRejectedValue(new Error('permission call blew up'));

    renderShell();

    await waitFor(() => expect(getNotificationsMock).toHaveBeenCalled());
    expect(screen.getByTestId('notification-badge')).toBeInTheDocument();
  });
});