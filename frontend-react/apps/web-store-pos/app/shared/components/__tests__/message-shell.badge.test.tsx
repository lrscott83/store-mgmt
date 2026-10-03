import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { ConversationDto } from '~/shared/lib/messages/messages-types';
import { MessageShell } from '../message-shell';

const getConversationsMock = vi.hoisted(() => vi.fn());
const getMessagesMock = vi.hoisted(() => vi.fn());
const sendMessageMock = vi.hoisted(() => vi.fn());
const markAsReadMock = vi.hoisted(() => vi.fn());
const markAllAsReadMock = vi.hoisted(() => vi.fn());

// Same stub as message-shell.test.tsx: the realtime hub is additive and these
// tests exercise the REST path only. Without it the shell would issue a real
// SignalR negotiate POST, which vitest.setup.ts flags as an unmocked request.
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

vi.mock('~/shared/lib/toast', () => ({
  showToastError: vi.fn(),
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

function renderShell() {
  return render(
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      <MessageShell />
    </IntlProvider>,
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Badge del header de Mensajes (user request 2026-10-02):
//   · el contador se muestra SIEMPRE, incluso en 0;
//   · cuando el total es > 0, un punto rojo pulsante sobre el icono llama la
//     atención, porque con el número siempre visible "3" y "0" se leen igual
//     de un vistazo.
// ═══════════════════════════════════════════════════════════════════════════

describe('MessageShell — el contador se muestra siempre', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: 'u1', selectedStoreId: 's1', isSuperAdmin: false, isOwnerAdmin: true };
  });

  it('muestra "0" cuando no hay nada sin leer', async () => {
    getConversationsMock.mockResolvedValue(success([conversation({ unreadCount: 0 })]));

    renderShell();

    await waitFor(() => expect(screen.getByTestId('message-badge')).toHaveTextContent('0'));
  });

  it('muestra el total sin leer cuando es mayor que cero', async () => {
    getConversationsMock.mockResolvedValue(
      success([
        conversation({ id: 'c1', storeId: 's1', unreadCount: 2 }),
        conversation({ id: 'c2', storeId: 's2', unreadCount: 3 }),
      ]),
    );

    renderShell();

    await waitFor(() => expect(screen.getByTestId('message-badge')).toHaveTextContent('5'));
  });

  it('el contador en 0 es discreto para no competir con el punto rojo', async () => {
    getConversationsMock.mockResolvedValue(success([conversation({ unreadCount: 0 })]));

    renderShell();

    await waitFor(() => expect(screen.getByTestId('message-badge')).toBeInTheDocument());
    expect(screen.getByTestId('message-badge').className).toContain('bg-text-muted');
  });

  it('el contador con unread > 0 usa el verde del icono, no el del carrito', async () => {
    getConversationsMock.mockResolvedValue(success([conversation({ unreadCount: 4 })]));

    renderShell();

    await waitFor(() => expect(screen.getByTestId('message-badge')).toHaveTextContent('4'));
    // `bg-whatsapp` (theme token), NO `bg-primary`: el gadget de mensajes y
    // el del carrito conviven en el header y antes ambos pintaban el morado
    // de marca, lo que los hacía legibles como el mismo control.
    const className = screen.getByTestId('message-badge').className;
    expect(className).toContain('bg-whatsapp');
    expect(className).not.toContain('bg-primary');
  });

  it('el badge se acota a "99+" y sigue ocupando el ancho del texto', async () => {
    getConversationsMock.mockResolvedValue(success([conversation({ unreadCount: 150 })]));

    renderShell();

    await waitFor(() => expect(screen.getByTestId('message-badge')).toHaveTextContent('99+'));
    // min-w + padding: un "99+" de tres caracteres no debe recortarse ni
    // desbordar el círculo.
    expect(screen.getByTestId('message-badge').className).toContain('min-w-4');
  });
});

describe('MessageShell — punto rojo pulsante sobre el icono', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: 'u1', selectedStoreId: 's1', isSuperAdmin: false, isOwnerAdmin: true };
  });

  it('NO aparece con el total en 0', async () => {
    getConversationsMock.mockResolvedValue(success([conversation({ unreadCount: 0 })]));

    renderShell();

    await waitFor(() => expect(screen.getByTestId('message-badge')).toBeInTheDocument());
    expect(screen.queryByTestId('message-unread-dot')).not.toBeInTheDocument();
  });

  it('aparece con unread > 0 y late (animate-ping) en rojo', async () => {
    getConversationsMock.mockResolvedValue(success([conversation({ unreadCount: 1 })]));

    renderShell();

    const dot = await screen.findByTestId('message-unread-dot');
    expect(dot.className).toContain('bg-danger');
    expect(dot.className).toContain('animate-ping');
  });

  it('el punto no se solapa con el contador: uno arriba-izquierda, otro arriba-derecha', async () => {
    getConversationsMock.mockResolvedValue(success([conversation({ unreadCount: 7 })]));

    renderShell();

    const dot = await screen.findByTestId('message-unread-dot');
    const badge = screen.getByTestId('message-badge');
    expect(dot.className).toContain('left-0');
    expect(badge.className).toContain('-right-1');
  });

  it('respeta motion-reduce y se marca aria-hidden (decorativo)', async () => {
    // El número ya informa a la tecnología asistiva: el punto es adorno puro.
    getConversationsMock.mockResolvedValue(success([conversation({ unreadCount: 2 })]));

    renderShell();

    const dot = await screen.findByTestId('message-unread-dot');
    expect(dot).toHaveAttribute('aria-hidden', 'true');
    expect(dot.className).toContain('motion-reduce:animate-none');
  });

  it('el punto se va cuando el total vuelve a 0 tras marcar como leído', async () => {
    getConversationsMock.mockResolvedValue(success([conversation({ unreadCount: 3 })]));
    getMessagesMock.mockResolvedValue(success([]));
    markAllAsReadMock.mockResolvedValue(success(true));

    renderShell();

    expect(await screen.findByTestId('message-unread-dot')).toBeInTheDocument();

    // El panel marca lo leído y la conversación vuelve sin pendientes.
    getConversationsMock.mockResolvedValue(success([conversation({ unreadCount: 0 })]));
    fireEvent.click(screen.getByRole('button', { name: 'Mensajes' }));

    await waitFor(() => expect(screen.queryByTestId('message-unread-dot')).not.toBeInTheDocument());
    expect(screen.getByTestId('message-badge')).toHaveTextContent('0');
  });
});
