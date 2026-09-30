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

let mockUser: Record<string, unknown> | null = {
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

const NEW_CONVERSATION_ID = '00000000-0000-0000-0000-000000000000';

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

describe('MessageShell — header badge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: 'u1', selectedStoreId: 's1', isSuperAdmin: false, isOwnerAdmin: true };
  });

  it('shows the sum of unreadCount across conversations', async () => {
    getConversationsMock.mockResolvedValue(
      success([
        conversation({ id: 'c1', storeId: 's1', unreadCount: 2 }),
        conversation({ id: 'c2', storeId: 's2', unreadCount: 3 }),
      ]),
    );

    renderShell();

    await waitFor(() => expect(screen.getByTestId('message-badge')).toHaveTextContent('5'));
  });

  it('hides the badge when the total unread is 0', async () => {
    getConversationsMock.mockResolvedValue(success([conversation({ unreadCount: 0 })]));

    renderShell();

    await waitFor(() => expect(getConversationsMock).toHaveBeenCalled());
    expect(screen.queryByTestId('message-badge')).not.toBeInTheDocument();
  });

  it('renders nothing for a SuperAdmin user and issues no request', async () => {
    mockUser = { id: 'sa', selectedStoreId: 's1', isSuperAdmin: true };

    renderShell();

    await waitFor(() => expect(getConversationsMock).not.toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Mensajes' })).not.toBeInTheDocument();
  });
});

describe('MessageShell — panel conversation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: 'u1', selectedStoreId: 's1', isSuperAdmin: false, isOwnerAdmin: true };
  });

  it('lists the active store conversation oldest→newest and marks "mine" by senderId', async () => {
    getConversationsMock.mockResolvedValue(
      success([conversation({ id: 'c1', storeId: 's1', unreadCount: 0 })]),
    );
    getMessagesMock.mockResolvedValue(
      success([
        message({ id: 'm1', senderId: 'u1', content: 'Mío', readAt: null }),
        message({ id: 'm2', senderId: 'sa', content: 'Suyo', readAt: '2026-09-30T10:01:00Z' }),
      ]),
    );

    renderShell();
    await waitFor(() => expect(getConversationsMock).toHaveBeenCalled());
    openPanel();

    await waitFor(() => expect(screen.getByText('Mío')).toBeInTheDocument());
    expect(screen.getByTestId('message-m1')).toHaveAttribute('data-mine', 'true');
    expect(screen.getByTestId('message-m2')).toHaveAttribute('data-mine', 'false');
    expect(getMessagesMock).toHaveBeenCalledWith('c1');
  });

  it('marks unread incoming messages as read (never the user own unread ones)', async () => {
    getConversationsMock.mockResolvedValue(
      success([conversation({ id: 'c1', storeId: 's1', unreadCount: 2 })]),
    );
    getMessagesMock.mockResolvedValue(
      success([
        message({ id: 'mine', senderId: 'u1', readAt: null }),
        message({ id: 'theirs', senderId: 'sa', readAt: null }),
      ]),
    );
    markAsReadMock.mockResolvedValue(success(true));

    renderShell();
    await waitFor(() => expect(getConversationsMock).toHaveBeenCalled());
    openPanel();

    await waitFor(() => expect(markAsReadMock).toHaveBeenCalledWith('theirs'));
    expect(markAsReadMock).not.toHaveBeenCalledWith('mine');
  });
});

describe('MessageShell — send', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: 'u1', selectedStoreId: 's1', isSuperAdmin: false, isOwnerAdmin: true };
  });

  it('sends with the existing conversation id, then refreshes', async () => {
    getConversationsMock.mockResolvedValue(
      success([conversation({ id: 'c1', storeId: 's1', unreadCount: 0 })]),
    );
    getMessagesMock.mockResolvedValue(success([]));
    sendMessageMock.mockResolvedValue(success(message({ id: 'sent' })));

    renderShell();
    await waitFor(() => expect(getConversationsMock).toHaveBeenCalled());
    openPanel();

    const input = await screen.findByLabelText('Escriba un mensaje');
    fireEvent.change(input, { target: { value: 'Hola SA' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    await waitFor(() =>
      expect(sendMessageMock).toHaveBeenCalledWith({
        conversationId: 'c1',
        ownerId: 'u1',
        storeId: 's1',
        content: 'Hola SA',
      }),
    );
    await waitFor(() => expect(input).toHaveValue(''));
  });

  it('uses the all-zeros conversation id when the store has no conversation yet', async () => {
    getConversationsMock.mockResolvedValue(success([]));
    getMessagesMock.mockResolvedValue(success([]));
    sendMessageMock.mockResolvedValue(success(message({ id: 'sent' })));

    renderShell();
    await waitFor(() => expect(getConversationsMock).toHaveBeenCalled());
    openPanel();

    const input = await screen.findByLabelText('Escriba un mensaje');
    fireEvent.change(input, { target: { value: 'Primer mensaje' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    await waitFor(() =>
      expect(sendMessageMock).toHaveBeenCalledWith({
        conversationId: NEW_CONVERSATION_ID,
        ownerId: 'u1',
        storeId: 's1',
        content: 'Primer mensaje',
      }),
    );
  });
});

describe('MessageShell — errors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: 'u1', selectedStoreId: 's1', isSuperAdmin: false, isOwnerAdmin: true };
  });

  it('shows an i18n error toast and never the raw error message', async () => {
    getConversationsMock.mockRejectedValue(new Error('raw boom, do not leak me'));

    renderShell();

    await waitFor(() =>
      expect(showToastErrorMock).toHaveBeenCalledWith(
        'No se pudieron cargar los mensajes. Intente de nuevo.',
      ),
    );
    expect(screen.queryByText(/raw boom/)).not.toBeInTheDocument();
  });
});
