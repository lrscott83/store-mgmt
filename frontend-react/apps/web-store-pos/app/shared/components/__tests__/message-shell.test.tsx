import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { MemoryRouter } from 'react-router';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import esMessages from '~/shared/lib/i18n/es';
import type { ConversationDto, MessageDto } from '~/shared/lib/messages/messages-types';

const getConversationsMock = vi.hoisted(() => vi.fn());
const getMessagesMock = vi.hoisted(() => vi.fn());
const sendMessageMock = vi.hoisted(() => vi.fn());
const markAsReadMock = vi.hoisted(() => vi.fn());
const markAllAsReadMock = vi.hoisted(() => vi.fn());

// T9.3 — the connection is created by the shell itself, so a hoisted factory lets
// a test assert the SuperAdmin path OPENS it (the badge's realtime push) rather
// than only that the REST + poll-fallback path works.
const connectionStartMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const connectionStopMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const createConnectionMock = vi.hoisted(() =>
  vi.fn(() => ({
    on: vi.fn(),
    off: vi.fn(),
    start: connectionStartMock,
    stop: connectionStopMock,
  })),
);

// T9.3 — the realtime hub is additive: these tests exercise the REST +
// interval-fallback path, so the connection is stubbed. Without this the shell
// would attempt a real SignalR negotiate POST, which the suite's
// block-real-http guard (vitest.setup.ts) correctly flags as an unmocked request.
vi.mock('~/shared/lib/messages/messages-realtime-service', () => ({
  RECEIVE_MESSAGE_EVENT: 'ReceiveMessage',
  MESSAGE_READ_EVENT: 'MessageRead',
  resolveMessagesHubUrl: () => '/hubs/messages',
  createMessagesRealtimeConnection: createConnectionMock,
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

// Locates packages/web-common/styles.css by walking UP from the cwd instead
// of counting `../` (breaks when this file moves) or building a file: URL
// from import.meta.url (not a file: URL under Vitest) or importing the CSS
// with `?raw` (the package's "exports" map resolves the query away and hands
// back an empty string). Works whether Vitest is invoked from the app, the
// package, or the workspace root.
function readWebCommonStyles(): string {
  let dir = process.cwd();
  for (;;) {
    const candidate = resolve(dir, 'packages/web-common/styles.css');
    if (existsSync(candidate)) return readFileSync(candidate, 'utf8');
    const parent = dirname(dir);
    if (parent === dir) throw new Error('packages/web-common/styles.css not found above cwd');
    dir = parent;
  }
}

function renderShell() {
  // MemoryRouter because the SuperAdmin trigger is a <Link> to the inbox page;
  // the owner path renders a plain button and is unaffected by the context.
  return render(
    <MemoryRouter>
      <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
        <MessageShell />
      </IntlProvider>
    </MemoryRouter>,
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

  // Invertido por el pedido del 2026-10-02: el contador se muestra SIEMPRE,
  // cero incluido, para que el icono no parezca inactivo entre ráfagas. Lo que
  // se esconde con 0 es el punto rojo de atención, no el número.
  it('shows 0 in the badge and no attention dot when the total unread is 0', async () => {
    getConversationsMock.mockResolvedValue(success([conversation({ unreadCount: 0 })]));

    renderShell();

    await waitFor(() => expect(getConversationsMock).toHaveBeenCalled());
    expect(screen.getByTestId('message-badge')).toHaveTextContent('0');
    expect(screen.queryByTestId('message-unread-dot')).not.toBeInTheDocument();
  });

  it('shows the icon with the unread counter for a SuperAdmin user', async () => {
    mockUser = { id: 'sa', selectedStoreId: '', isSuperAdmin: true, isOwnerAdmin: false };
    getConversationsMock.mockResolvedValue(
      success([
        conversation({ id: 'c1', storeId: 's1', unreadCount: 4 }),
        conversation({ id: 'c2', storeId: 's2', unreadCount: 1 }),
      ]),
    );

    renderShell();

    // The SuperAdmin sees the same gadget with the sum over ALL its
    // conversations — the backend already returns the whole list for this role.
    await waitFor(() => expect(screen.getByTestId('message-badge')).toHaveTextContent('5'));
    expect(screen.queryByTestId('message-unread-dot')).toBeInTheDocument();
  });

  it('links the SuperAdmin trigger to the inbox page and opens no panel', async () => {
    mockUser = { id: 'sa', selectedStoreId: '', isSuperAdmin: true, isOwnerAdmin: false };
    getConversationsMock.mockResolvedValue(success([conversation({ unreadCount: 1 })]));

    renderShell();

    const link = await screen.findByRole('link', { name: 'Mensajes' });
    expect(link).toHaveAttribute('href', '/admin/messages');
    expect(screen.queryByRole('button', { name: 'Mensajes' })).not.toBeInTheDocument();

    fireEvent.click(link);
    // No popup thread: the SuperAdmin's inbox is the page itself.
    expect(screen.queryByTestId('message-list')).not.toBeInTheDocument();
  });
});

describe('MessageShell — realtime connection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getConversationsMock.mockResolvedValue(success([]));
  });

  // The hub pushes to the RECIPIENT's per-user group and an owner→SuperAdmin
  // message names the SuperAdmin as recipient, so gating the connection on
  // OwnerAdmin alone meant the badge only moved when the poll ladder came
  // around. Both roles that see the gadget must open it.
  it('opens the realtime connection for a SuperAdmin so its badge updates on push', async () => {
    mockUser = { id: 'sa', selectedStoreId: '', isSuperAdmin: true, isOwnerAdmin: false };

    renderShell();

    await waitFor(() => expect(getConversationsMock).toHaveBeenCalled());
    await waitFor(() => expect(createConnectionMock).toHaveBeenCalled());
    await waitFor(() => expect(connectionStartMock).toHaveBeenCalled());

    // The owner path still opens it — the guard is a widening, not a swap.
    mockUser = { id: 'u1', selectedStoreId: 's1', isSuperAdmin: false, isOwnerAdmin: true };
    renderShell();

    await waitFor(() => expect(connectionStartMock).toHaveBeenCalledTimes(2));
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
    expect(getMessagesMock).toHaveBeenCalledWith('c1', { background: true });
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

    await waitFor(() =>
      expect(markAsReadMock).toHaveBeenCalledWith('theirs', { background: true }),
    );
    expect(markAsReadMock).not.toHaveBeenCalledWith('mine', { background: true });
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
      expect(sendMessageMock).toHaveBeenCalledWith(
        {
          conversationId: 'c1',
          ownerId: 'u1',
          storeId: 's1',
          content: 'Hola SA',
        },
        { background: true },
      ),
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
      expect(sendMessageMock).toHaveBeenCalledWith(
        {
          conversationId: NEW_CONVERSATION_ID,
          ownerId: 'u1',
          storeId: 's1',
          content: 'Primer mensaje',
        },
        { background: true },
      ),
    );
  });
});

describe('MessageShell — errors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: 'u1', selectedStoreId: 's1', isSuperAdmin: false, isOwnerAdmin: true };
  });

  it('does not toast on a load error and never renders the raw error message', async () => {
    getConversationsMock.mockRejectedValue(new Error('raw boom, do not leak me'));

    renderShell();

    await waitFor(() => expect(getConversationsMock).toHaveBeenCalled());
    // Let the rejected promise settle before asserting the silent failure.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(showToastErrorMock).not.toHaveBeenCalled();
    expect(screen.queryByText(/raw boom/)).not.toBeInTheDocument();
  });
});

describe('MessageShell — composer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: 'u1', selectedStoreId: 's1', isSuperAdmin: false, isOwnerAdmin: true };
    getConversationsMock.mockResolvedValue(success([]));
    getMessagesMock.mockResolvedValue(success([]));
  });

  // T3 — the composer is an auto-growing textarea, two rows minimum, so a long
  // message is always readable instead of scrolling a single line.
  it('renders the composer as a TEXTAREA with two rows', async () => {
    renderShell();
    await waitFor(() => expect(getConversationsMock).toHaveBeenCalled());
    openPanel();

    const composer = await screen.findByLabelText('Escriba un mensaje');
    expect(composer.tagName).toBe('TEXTAREA');
    expect(composer).toHaveAttribute('rows', '2');
  });
});

describe('MessageShell — trigger color identity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: 'u1', selectedStoreId: 's1', isSuperAdmin: false, isOwnerAdmin: true };
    getConversationsMock.mockResolvedValue(success([]));
  });

  // The cart gadget (CartShell) is `text-text-muted hover:bg-primary-light`,
  // so before this the chat trigger was the SAME control wearing the cart's
  // lavender hover — the user reported it as "the shopping cart's color" and
  // asked for the icon's own green instead (2026-10-02). This test exists to
  // make that regression loud: it pins the hover, which is the part a
  // redesign is most likely to silently revert to the shared brand token.
  it('hovers in the chat green, never in the cart lavender', () => {
    renderShell();

    const trigger = screen.getByRole('button', { name: 'Mensajes' });
    expect(trigger).toHaveClass('text-whatsapp');
    expect(trigger).toHaveClass('hover:bg-whatsapp-light');
    expect(trigger.className).not.toContain('primary');
  });

  // Guards the token itself, not just its use: if `--color-whatsapp` ever
  // disappears from web-common/styles.css, `bg-whatsapp`/`text-whatsapp`
  // stop resolving in the real build while these class-name assertions keep
  // passing (jsdom never loads Tailwind's output). So the value is pinned
  // here against the stylesheet rather than trusted.
  it('keeps the theme token pinned to WhatsApp green, distinct from success', () => {
    const css = readWebCommonStyles();
    expect(css).toContain('--color-whatsapp: rgb(37 211 102)');
    expect(css).toContain('--color-whatsapp-light:');
    // Not collapsed into --color-success, which is a different green.
    expect(css).not.toMatch(/--color-whatsapp:\s*rgb\(82 196 26\)/);
  });
});
