import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { ConversationDto, MessageDto } from '~/shared/lib/messages/messages-types';
import type { Owner, Store, BaseResponseModel } from '@store-mgmt/domain';

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

vi.mock('~/admin/owners/lib/services/owner-http-service', () => ({
  ownerHttpService: {
    listOwners: vi.fn(),
  },
}));

const mockShowToastError = vi.fn();
const mockShowToastSuccess = vi.fn();
vi.mock('~/shared/lib/toast', () => ({
  showToastError: (...args: unknown[]) => mockShowToastError(...args),
  showToastSuccess: (...args: unknown[]) => mockShowToastSuccess(...args),
}));

// Owner A — active, a non-free store and an existing conversation.
const ownerA = {
  id: 'owner-a',
  userId: 'user-a',
  fullName: 'Ana Owner',
  isActive: true,
} as Owner;

// Owner B — active, only a free store, no conversation.
const ownerB = {
  id: 'owner-b',
  userId: 'user-b',
  fullName: 'Bea Owner',
  isActive: true,
} as Owner;

// Owner C — active, a non-free store and NO conversation.
const ownerC = {
  id: 'owner-c',
  userId: 'user-c',
  fullName: 'Carla Owner',
  isActive: true,
} as Owner;

// Owner D — inactive: must never render.
const ownerD = {
  id: 'owner-d',
  userId: 'user-d',
  fullName: 'Dora Owner',
  isActive: false,
} as Owner;

const storeA = {
  id: 'store-a',
  name: 'Tienda A',
  ownerId: 'owner-a',
  ownerName: 'Ana Owner',
  approved: true,
  planType: 'Pago',
  isActive: true,
} as Store;

const storeB = {
  id: 'store-b',
  name: 'Tienda B',
  ownerId: 'owner-b',
  ownerName: 'Bea Owner',
  approved: true,
  planType: 'Gratis',
  isActive: true,
} as Store;

const storeC = {
  id: 'store-c',
  name: 'Tienda C',
  ownerId: 'owner-c',
  ownerName: 'Carla Owner',
  approved: true,
  planType: 'Superior',
  isActive: true,
} as Store;

const conversationA: ConversationDto = {
  id: 'conv-a',
  ownerId: 'user-a',
  storeId: 'store-a',
  lastMessageAt: '2026-01-01T10:00:00Z',
  lastMessageContent: 'Hola administrador',
  unreadCount: 3,
};

function response<T>(data: T): BaseResponseModel<T> {
  return { succeeded: true, data, message: '', actionCode: 0, errors: [] };
}

beforeEach(async () => {
  vi.clearAllMocks();
  const { messagesHttpService } = await import('~/shared/lib/messages/messages-http-service');
  const { storeHttpService } = await import('~/management/stores/lib/services/store-http-service');
  const { ownerHttpService } = await import('~/admin/owners/lib/services/owner-http-service');
  vi.mocked(messagesHttpService.getConversations).mockResolvedValue(
    response<ConversationDto[]>([conversationA]),
  );
  vi.mocked(messagesHttpService.getMessages).mockResolvedValue(response<MessageDto[]>([]));
  vi.mocked(messagesHttpService.sendMessage).mockResolvedValue(
    response<MessageDto>({
      id: 'm-new',
      conversationId: 'conv-a',
      senderId: 'super-1',
      senderType: 2,
      recipientId: 'user-a',
      storeId: 'store-a',
      content: 'Hola admin',
      sentAt: '2026-01-01T11:00:00Z',
      readAt: null,
    }),
  );
  vi.mocked(messagesHttpService.markAsRead).mockResolvedValue(response(true));
  vi.mocked(messagesHttpService.broadcastMessage).mockResolvedValue(response(true));
  vi.mocked(storeHttpService.listStores).mockResolvedValue(
    response<Store[]>([storeA, storeB, storeC]),
  );
  vi.mocked(ownerHttpService.listOwners).mockResolvedValue(
    response<Owner[]>([ownerA, ownerB, ownerC, ownerD]),
  );
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

describe('AdminMessagesPage — owner list', () => {
  it('renders every active owner and no inactive ones', async () => {
    await renderPage();

    expect(await screen.findByText('Ana Owner')).toBeInTheDocument();
    expect(screen.getByText('Bea Owner')).toBeInTheDocument();
    expect(screen.getByText('Carla Owner')).toBeInTheDocument();
    expect(screen.queryByText('Dora Owner')).not.toBeInTheDocument();
  });

  it('joins store names and shows the conversation preview + unread badge', async () => {
    await renderPage();

    expect(await screen.findByText('Ana Owner')).toBeInTheDocument();
    expect(screen.getByText('Tienda A')).toBeInTheDocument();
    expect(screen.getByText('Hola administrador')).toBeInTheDocument();
    expect(screen.getByTestId('owner-unread-owner-a')).toHaveTextContent('3');
  });

  it('falls back to the NO_STORE label when an owner has no store', async () => {
    const { ownerHttpService } = await import('~/admin/owners/lib/services/owner-http-service');
    vi.mocked(ownerHttpService.listOwners).mockResolvedValue(
      response<Owner[]>([
        { id: 'owner-x', userId: 'user-x', fullName: 'Xena Owner', isActive: true } as Owner,
      ]),
    );
    await renderPage();

    expect(await screen.findByText('Xena Owner')).toBeInTheDocument();
    expect(screen.getByText('Sin tienda')).toBeInTheDocument();
  });
});

describe('AdminMessagesPage — sending', () => {
  it('sends to the selected conversation with its real ids', async () => {
    const { messagesHttpService } = await import('~/shared/lib/messages/messages-http-service');
    await renderPage();

    fireEvent.click(await screen.findByTestId('owner-owner-a'));
    const input = await screen.findByTestId('message-input');
    fireEvent.change(input, { target: { value: 'Hola admin' } });
    fireEvent.click(screen.getByTestId('message-send'));

    await waitFor(() => {
      expect(messagesHttpService.sendMessage).toHaveBeenCalledWith(
        {
          conversationId: 'conv-a',
          ownerId: 'user-a',
          storeId: 'store-a',
          content: 'Hola admin',
        },
        { background: true },
      );
    });
  });

  it('starts a new conversation for an owner without one', async () => {
    const { messagesHttpService } = await import('~/shared/lib/messages/messages-http-service');
    await renderPage();

    fireEvent.click(await screen.findByTestId('owner-owner-c'));
    const input = await screen.findByTestId('message-input');
    fireEvent.change(input, { target: { value: 'Bienvenida' } });
    fireEvent.click(screen.getByTestId('message-send'));

    await waitFor(() => {
      expect(messagesHttpService.sendMessage).toHaveBeenCalledWith(
        {
          conversationId: '00000000-0000-0000-0000-000000000000',
          ownerId: 'user-c',
          storeId: 'store-c',
          content: 'Bienvenida',
        },
        { background: true },
      );
    });
  });
});

describe('AdminMessagesPage — thread scroll', () => {
  it('brings an owner reply into view by jumping the thread to the bottom', async () => {
    const { messagesHttpService } = await import('~/shared/lib/messages/messages-http-service');
    // The thread is read empty when it is opened, then the owner replies. Both
    // land through `loadMessages`, which is the path the poll ladder and the
    // realtime push share.
    const incoming: MessageDto = {
      id: 'm-owner-1',
      conversationId: 'conv-a',
      senderId: 'user-a',
      senderType: 2,
      recipientId: 'super-1',
      storeId: 'store-a',
      content: 'Hola, necesito ayuda',
      sentAt: '2026-01-01T12:00:00Z',
      readAt: null,
    };
    vi.mocked(messagesHttpService.getMessages)
      .mockResolvedValueOnce(response<MessageDto[]>([]))
      .mockResolvedValue(response<MessageDto[]>([incoming]));

    await renderPage();
    fireEvent.click(await screen.findByTestId('owner-owner-a'));
    const thread = await screen.findByTestId('message-thread');

    // jsdom has no layout: pin the scroll box so the jump is measurable at all.
    Object.defineProperty(thread, 'scrollHeight', { value: 480, configurable: true });
    Object.defineProperty(thread, 'scrollTop', { value: 0, writable: true, configurable: true });

    // Returning to the window re-arms the ladder, so the next poll happens now.
    fireEvent(window, new Event('focus'));

    await waitFor(() => {
      expect(screen.getByTestId('message-m-owner-1')).toBeInTheDocument();
    });
    expect(thread.scrollTop).toBe(480);
  });

  it('leaves the view alone when a poll re-reads the same rows', async () => {
    const { messagesHttpService } = await import('~/shared/lib/messages/messages-http-service');
    const incoming: MessageDto = {
      id: 'm-owner-1',
      conversationId: 'conv-a',
      senderId: 'user-a',
      senderType: 2,
      recipientId: 'super-1',
      storeId: 'store-a',
      content: 'Hola, necesito ayuda',
      sentAt: '2026-01-01T12:00:00Z',
      readAt: null,
    };
    vi.mocked(messagesHttpService.getMessages).mockResolvedValue(response<MessageDto[]>([incoming]));

    await renderPage();
    fireEvent.click(await screen.findByTestId('owner-owner-a'));
    const thread = await screen.findByTestId('message-thread');
    await waitFor(() => {
      expect(screen.getByTestId('message-m-owner-1')).toBeInTheDocument();
    });

    // The operator scrolls up to read history, and a poll re-reads the same rows:
    // the identical newest message must not yank the panel back down.
    Object.defineProperty(thread, 'scrollHeight', { value: 480, configurable: true });
    Object.defineProperty(thread, 'scrollTop', { value: 120, writable: true, configurable: true });
    fireEvent(window, new Event('focus'));

    await waitFor(() => {
      expect(vi.mocked(messagesHttpService.getMessages).mock.calls.length).toBeGreaterThan(1);
    });
    expect(thread.scrollTop).toBe(120);
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
