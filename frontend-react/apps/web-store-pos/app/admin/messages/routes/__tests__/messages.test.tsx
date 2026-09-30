import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { ConversationDto, MessageDto } from '~/shared/lib/messages/messages-types';
import type { Store, BaseResponseModel } from '@store-mgmt/domain';

vi.mock('~/auth/routes/loaders', () => ({
  superAdminLoader: vi.fn().mockResolvedValue(null),
}));

vi.mock('~/shared/lib/stores/auth-store', () => {
  const useAuthStore = vi.fn((selector?: (state: unknown) => unknown) => {
    const state = { user: { id: 'super-1' }, isAuthenticated: true };
    if (typeof selector === 'function') return selector(state);
    return state;
  });
  return { useAuthStore };
});

vi.mock('~/shared/lib/messages/messages-http-service', () => ({
  messagesHttpService: {
    getConversations: vi.fn(),
    getMessages: vi.fn(),
    sendMessage: vi.fn(),
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
    broadcastMessage: vi.fn(),
  },
}));

vi.mock('~/management/stores/lib/services/store-http-service', () => ({
  storeHttpService: {
    listStores: vi.fn(),
  },
}));

const mockShowToastError = vi.fn();
const mockShowToastSuccess = vi.fn();
vi.mock('~/shared/lib/toast', () => ({
  showToastError: (...args: unknown[]) => mockShowToastError(...args),
  showToastSuccess: (...args: unknown[]) => mockShowToastSuccess(...args),
}));

const conversationA: ConversationDto = {
  id: 'conv-a',
  ownerId: 'owner-a',
  storeId: 'store-a',
  lastMessageAt: '2026-01-01T10:00:00Z',
  lastMessageContent: 'Hola administrador',
  unreadCount: 3,
};

const conversationB: ConversationDto = {
  id: 'conv-b',
  ownerId: 'owner-b',
  storeId: 'store-b',
  lastMessageAt: '2026-01-01T09:00:00Z',
  lastMessageContent: null,
  unreadCount: 0,
};

const storeA = { id: 'store-a', name: 'Tienda A', ownerId: 'owner-a', ownerName: 'Ana Owner' } as Store;

function response<T>(data: T): BaseResponseModel<T> {
  return { succeeded: true, data, message: '', actionCode: 0, errors: [] };
}

beforeEach(async () => {
  vi.clearAllMocks();
  const { messagesHttpService } = await import('~/shared/lib/messages/messages-http-service');
  const { storeHttpService } = await import('~/management/stores/lib/services/store-http-service');
  vi.mocked(messagesHttpService.getConversations).mockResolvedValue(
    response<ConversationDto[]>([conversationA, conversationB]),
  );
  vi.mocked(messagesHttpService.getMessages).mockResolvedValue(response<MessageDto[]>([]));
  vi.mocked(messagesHttpService.sendMessage).mockResolvedValue(
    response<MessageDto>({
      id: 'm-new',
      conversationId: 'conv-a',
      senderId: 'super-1',
      senderType: 2,
      recipientId: 'owner-a',
      storeId: 'store-a',
      content: 'Hola admin',
      sentAt: '2026-01-01T11:00:00Z',
      readAt: null,
    }),
  );
  vi.mocked(messagesHttpService.markAsRead).mockResolvedValue(response(true));
  vi.mocked(messagesHttpService.broadcastMessage).mockResolvedValue(response(true));
  vi.mocked(storeHttpService.listStores).mockResolvedValue(response<Store[]>([storeA]));
});

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

async function renderPage() {
  const { AdminMessagesPage } = await import('../messages');
  render(
    <Wrapper>
      <AdminMessagesPage />
    </Wrapper>,
  );
}

describe('AdminMessagesPage — exports', () => {
  it('exports clientLoader and the page component', async () => {
    const mod = await import('../messages');
    expect(typeof mod.clientLoader).toBe('function');
    expect(typeof mod.AdminMessagesPage).toBe('function');
    expect(typeof mod.default).toBe('function');
  });
});

describe('AdminMessagesPage — conversation list', () => {
  it('joins owner + store names from listStores into each entry', async () => {
    await renderPage();

    expect(await screen.findByText('Ana Owner')).toBeInTheDocument();
    expect(screen.getByText('Tienda A')).toBeInTheDocument();
    expect(screen.getByText('Hola administrador')).toBeInTheDocument();
  });

  it('falls back to raw ids when a store is not found', async () => {
    await renderPage();

    expect(await screen.findByText('owner-b')).toBeInTheDocument();
    expect(screen.getByText('store-b')).toBeInTheDocument();
  });

  it('shows an unread badge only when unreadCount is greater than zero', async () => {
    await renderPage();

    expect(await screen.findByTestId('conversation-unread-conv-a')).toHaveTextContent('3');
    expect(screen.queryByTestId('conversation-unread-conv-b')).not.toBeInTheDocument();
  });
});

describe('AdminMessagesPage — sending', () => {
  it('sends to the selected conversation with its real ids', async () => {
    const { messagesHttpService } = await import('~/shared/lib/messages/messages-http-service');
    await renderPage();

    fireEvent.click(await screen.findByTestId('conversation-conv-a'));
    const input = await screen.findByTestId('message-input');
    fireEvent.change(input, { target: { value: 'Hola admin' } });
    fireEvent.click(screen.getByTestId('message-send'));

    await waitFor(() => {
      expect(messagesHttpService.sendMessage).toHaveBeenCalledWith({
        conversationId: 'conv-a',
        ownerId: 'owner-a',
        storeId: 'store-a',
        content: 'Hola admin',
      });
    });
  });
});

describe('AdminMessagesPage — broadcast', () => {
  it('sends the broadcast content and shows a success toast', async () => {
    const { messagesHttpService } = await import('~/shared/lib/messages/messages-http-service');
    await renderPage();

    fireEvent.click(await screen.findByTestId('broadcast-open'));
    fireEvent.change(await screen.findByTestId('broadcast-input'), {
      target: { value: 'Promocion de octubre' },
    });
    fireEvent.click(screen.getByTestId('broadcast-send'));

    await waitFor(() => {
      expect(messagesHttpService.broadcastMessage).toHaveBeenCalledWith('Promocion de octubre');
    });
    expect(mockShowToastSuccess).toHaveBeenCalled();
  });
});
