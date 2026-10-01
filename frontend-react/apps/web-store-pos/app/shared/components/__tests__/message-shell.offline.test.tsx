import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { ConversationDto, MessageDto } from '~/shared/lib/messages/messages-types';

const getConversationsMock = vi.hoisted(() => vi.fn());
const getMessagesMock = vi.hoisted(() => vi.fn());
const sendMessageMock = vi.hoisted(() => vi.fn());
const markAsReadMock = vi.hoisted(() => vi.fn());
const markAllAsReadMock = vi.hoisted(() => vi.fn());

// T9.3 — the realtime hub is additive: these tests exercise the offline queue
// and the REST + interval-fallback path, so the connection is stubbed. Without
// this the shell would attempt a real SignalR negotiate POST, which the suite's
// block-real-http guard (vitest.setup.ts) correctly flags as an unmocked request.
vi.mock('~/shared/lib/messages/messages-realtime-service', () => ({
  RECEIVE_MESSAGE_EVENT: 'ReceiveMessage',
  MESSAGE_READ_EVENT: 'MessageRead',
  resolveMessagesHubUrl: () => '/hubs/messages',
  createMessagesRealtimeConnection: () => ({
    on: vi.fn(),
    off: vi.fn(),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('~/shared/lib/messages/messages-http-service', () => ({
  messagesHttpService: {
    getConversations: getConversationsMock,
    getMessages: getMessagesMock,
    sendMessage: sendMessageMock,
    markAsRead: markAsReadMock,
    markAllAsRead: markAllAsReadMock,
  },
}));

const showToastErrorMock = vi.hoisted(() => vi.fn());
vi.mock('~/shared/lib/toast', () => ({
  showToastError: showToastErrorMock,
  showToastSuccess: vi.fn(),
}));

const onlineState = vi.hoisted(() => ({ value: true }));
vi.mock('~/shared/lib/hooks/use-online-status', () => ({
  useOnlineStatus: () => onlineState.value,
}));

const mockUser = {
  id: 'u1',
  selectedStoreId: 's1',
  isSuperAdmin: false,
  isOwnerAdmin: true,
};
vi.mock('~/shared/lib/stores/auth-store', () => {
  const useAuthStore = vi.fn((selector?: (s: { user: unknown }) => unknown) => {
    const state = { user: mockUser };
    if (typeof selector === 'function') return selector(state);
    return state;
  });
  return { useAuthStore };
});

import { MessageShell } from '../message-shell';

const STORAGE_KEY = 'lizoft.store-messagesQueue-s1';

function success<T>(data: T) {
  return { data, succeeded: true, message: null, actionCode: 200, errors: [] };
}

function conversation(overrides: Partial<ConversationDto> = {}): ConversationDto {
  return {
    id: 'c1',
    ownerId: 'u1',
    storeId: 's1',
    lastMessageAt: '2026-09-30T10:00:00Z',
    lastMessageContent: 'Hola',
    unreadCount: 0,
    ...overrides,
  };
}

function message(overrides: Partial<MessageDto> = {}): MessageDto {
  return {
    id: 'm1',
    conversationId: 'c1',
    senderId: 'u1',
    senderType: 1,
    recipientId: 'sa',
    storeId: 's1',
    content: 'Hola',
    sentAt: '2026-09-30T10:00:00Z',
    readAt: null,
    ...overrides,
  };
}

function renderShell() {
  return render(
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      <MessageShell />
    </IntlProvider>,
  );
}

function openPanel() {
  fireEvent.click(screen.getByRole('button', { name: 'Mensajes' }));
}

describe('MessageShell — offline queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    onlineState.value = true;
    getConversationsMock.mockResolvedValue(success([conversation()]));
    getMessagesMock.mockResolvedValue(success([]));
  });

  it('queues the message locally while offline, clears the input and shows it as pending', async () => {
    onlineState.value = false;

    renderShell();
    // Offline the chat must not touch the network at all — that is what keeps the
    // offline E2E's zero-request invariant intact — while the header still shows
    // the chat button (it is always mounted now).
    expect(await screen.findByRole('button', { name: 'Mensajes' })).toBeInTheDocument();
    expect(getConversationsMock).not.toHaveBeenCalled();
    openPanel();

    const input = await screen.findByLabelText('Escriba un mensaje');
    fireEvent.change(input, { target: { value: 'Hola sin conexión' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    await waitFor(() => expect(input).toHaveValue(''));
    expect(sendMessageMock).not.toHaveBeenCalled();
    // The queued message is announced, never dropped in silence.
    await waitFor(() =>
      expect(showToastErrorMock).toHaveBeenCalledWith(esMessages['MESSAGES.OFFLINE_QUEUED']),
    );

    const pendingItem = screen.getByText('Hola sin conexión').closest('li');
    expect(pendingItem).toHaveAttribute('data-pending', 'true');
    expect(pendingItem).toHaveAttribute('data-mine', 'true');
    expect(screen.getByText('Pendiente')).toBeInTheDocument();

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as Array<{
      content: string;
    }>;
    expect(stored.map((entry) => entry.content)).toContain('Hola sin conexión');
  });

  it('queues the message when an online send fails with a network error', async () => {
    sendMessageMock.mockRejectedValue(
      Object.assign(new Error('network'), { isNetworkError: true }),
    );

    renderShell();
    await waitFor(() => expect(getConversationsMock).toHaveBeenCalled());
    openPanel();

    const input = await screen.findByLabelText('Escriba un mensaje');
    fireEvent.change(input, { target: { value: 'Se cayó la red' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    await waitFor(() => expect(screen.getByText('Se cayó la red')).toBeInTheDocument());
    // A send that could not reach the server is announced as queued, not dropped.
    expect(showToastErrorMock).toHaveBeenCalledWith(esMessages['MESSAGES.OFFLINE_QUEUED']);
    const pendingItem = screen.getByText('Se cayó la red').closest('li');
    expect(pendingItem).toHaveAttribute('data-pending', 'true');
  });

  it('flushes a queue left from a previous session on mount and removes it', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        {
          id: 'q1',
          conversationId: 'c1',
          ownerId: 'u1',
          storeId: 's1',
          content: 'Mensaje atrasado',
          queuedAt: '2026-09-30T09:00:00.000Z',
        },
      ]),
    );
    sendMessageMock.mockResolvedValue(success(message({ id: 'sent' })));

    renderShell();

    await waitFor(() =>
      expect(sendMessageMock).toHaveBeenCalledWith({
        conversationId: 'c1',
        ownerId: 'u1',
        storeId: 's1',
        content: 'Mensaje atrasado',
      }),
    );
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as unknown[];
      expect(stored).toHaveLength(0);
    });
  });
});
