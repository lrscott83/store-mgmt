import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { useIntl } from 'react-intl';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { isOwnerAdmin } from '~/shared/lib/auth/authorization-service';
import { useClickOutside } from '~/shared/lib/hooks/use-click-outside';
import { useOnlineStatus } from '~/shared/lib/hooks/use-online-status';
import { showToastError } from '~/shared/lib/toast';
import { ChatIcon } from '~/shared/components/ui/icons';
import { messagesHttpService } from '~/shared/lib/messages/messages-http-service';
import { MessagesOfflineService } from '~/shared/lib/messages/messages-offline-service';
import {
  MESSAGE_READ_EVENT,
  RECEIVE_MESSAGE_EVENT,
  createMessagesRealtimeConnection,
  resolveMessagesHubUrl,
} from '~/shared/lib/messages/messages-realtime-service';
import type { QueuedMessage } from '~/shared/lib/messages/messages-offline-service';
import type {
  ConversationDto,
  MessageDto,
  SendMessagePayload,
} from '~/shared/lib/messages/messages-types';

const NEW_CONVERSATION_ID = '00000000-0000-0000-0000-000000000000';
const REFRESH_INTERVAL_MS = 15000;

function isNetworkFailure(error: unknown): boolean {
  return (error as { isNetworkError?: boolean } | null)?.isNetworkError === true;
}

function formatMessageTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
}

export function MessageShell() {
  const intl = useIntl();
  const user = useAuthStore((s) => s.user);
  const isOnline = useOnlineStatus();
  const [isOpen, setIsOpen] = useState(false);
  const [conversations, setConversations] = useState<ConversationDto[]>([]);
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const isOpenRef = useRef(false);
  const wasOnlineRef = useRef(isOnline);

  const userId = user?.id ?? '';
  const storeId = user?.selectedStoreId ?? '';
  const offlineService = useMemo(() => new MessagesOfflineService(storeId), [storeId]);
  const [pending, setPending] = useState<QueuedMessage[]>([]);
  const isFlushingRef = useRef(false);
  const initialFlushRef = useRef<string | null>(null);
  const activeConversation = conversations.find((c) => c.storeId === storeId) ?? null;
  const totalUnread = conversations.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0);

  function setPanelOpen(open: boolean) {
    isOpenRef.current = open;
    setIsOpen(open);
  }

  useClickOutside(shellRef, () => setPanelOpen(false));

  const refresh = useCallback(
    async (withMessages: boolean) => {
      if (!user || !isOwnerAdmin(user)) return;
      try {
        const conversationsResponse = await messagesHttpService.getConversations();
        if (!conversationsResponse.succeeded) return;
        const nextConversations = conversationsResponse.data;
        setConversations(nextConversations);

        if (!withMessages) return;
        const active = nextConversations.find((c) => c.storeId === user.selectedStoreId);
        if (!active) {
          setMessages([]);
          return;
        }

        const messagesResponse = await messagesHttpService.getMessages(active.id);
        if (!messagesResponse.succeeded) return;
        const nextMessages = messagesResponse.data;
        setMessages(nextMessages);

        const unreadIncoming = nextMessages.filter(
          (message) => message.readAt === null && message.senderId !== user.id,
        );
        if (unreadIncoming.length > 0) {
          await Promise.all(
            unreadIncoming.map((message) => messagesHttpService.markAsRead(message.id)),
          );
          const updatedResponse = await messagesHttpService.getConversations();
          if (updatedResponse.succeeded) setConversations(updatedResponse.data);
        }
      } catch {
        showToastError(intl.formatMessage({ id: 'MESSAGES.LOAD_ERROR' }));
      }
    },
    [user, intl],
  );

  const readPending = useCallback((): QueuedMessage[] => {
    try {
      return offlineService.getQueue();
    } catch {
      // A locked or damaged queue must never break the header; retried on reconnect.
      return [];
    }
  }, [offlineService]);

  const flushQueue = useCallback(async () => {
    if (isFlushingRef.current) return;
    isFlushingRef.current = true;
    try {
      const result = await offlineService.flush(async (payload) => {
        const response = await messagesHttpService.sendMessage(payload);
        return response.succeeded;
      });
      setPending(readPending());
      if (result.sent > 0) await refresh(true);
    } catch {
      // Queue read failed; a failed drain already keeps the queue intact for the next retry.
    } finally {
      isFlushingRef.current = false;
    }
  }, [offlineService, readPending, refresh]);

  function enqueueMessage(payload: SendMessagePayload): void {
    let queued: QueuedMessage;
    try {
      queued = offlineService.enqueue(payload);
    } catch {
      showToastError(intl.formatMessage({ id: 'MESSAGES.SEND_ERROR' }));
      return;
    }
    setPending((current) => [...current, queued]);
    setInputValue('');
  }

  useEffect(() => {
    void refresh(false);
  }, [refresh]);

  useEffect(() => {
    if (!user || !isOwnerAdmin(user)) return;
    setPending(readPending());
  }, [user, readPending]);

  useEffect(() => {
    if (!isOnline || !user || !isOwnerAdmin(user)) return;
    if (initialFlushRef.current === storeId) return;
    initialFlushRef.current = storeId;
    void flushQueue();
  }, [isOnline, user, storeId, flushQueue]);

  useEffect(() => {
    const wasOnline = wasOnlineRef.current;
    wasOnlineRef.current = isOnline;
    if (!isOnline || wasOnline || !user || !isOwnerAdmin(user)) return;
    void flushQueue();
    void refresh(isOpenRef.current);
  }, [isOnline, user, flushQueue, refresh]);

  useEffect(() => {
    if (!user || !isOwnerAdmin(user)) return;
    function handleFocus() {
      void refresh(isOpenRef.current);
    }
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [user, refresh]);

  useEffect(() => {
    if (!user || !isOwnerAdmin(user)) return;
    const intervalId = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void refresh(isOpenRef.current);
      }
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [user, refresh]);

  // T9.3 — real-time push (SignalR). The hub delivers a new message or a read
  // receipt as it happens, so the panel and the unread badge update without
  // waiting for the poll above. That interval stays as the FALLBACK: if the
  // connection never opens (no WebSocket, a blocked upgrade, a dead hub) or
  // later drops, everything still refreshes on its own. A failed `start()` is
  // therefore swallowed on purpose — it is not an error the user must see.
  useEffect(() => {
    if (!user || !isOwnerAdmin(user) || !isOnline) return;
    const connection = createMessagesRealtimeConnection(
      resolveMessagesHubUrl(import.meta.env['API_URL'] as string | undefined, window.location.origin),
    );
    const pull = () => void refresh(isOpenRef.current);
    connection.on(RECEIVE_MESSAGE_EVENT, pull);
    connection.on(MESSAGE_READ_EVENT, pull);
    void connection.start().catch(() => undefined);
    return () => {
      connection.off(RECEIVE_MESSAGE_EVENT, pull);
      connection.off(MESSAGE_READ_EVENT, pull);
      void connection.stop().catch(() => undefined);
    };
  }, [user, isOnline, refresh]);

  function handleToggle() {
    const next = !isOpen;
    setPanelOpen(next);
    if (next) void refresh(true);
  }

  async function handleSend() {
    const content = inputValue.trim();
    if (!content || isSending || !user || !isOwnerAdmin(user)) return;
    const payload: SendMessagePayload = {
      conversationId: activeConversation?.id ?? NEW_CONVERSATION_ID,
      ownerId: user.id,
      storeId: user.selectedStoreId,
      content,
    };
    if (!isOnline) {
      enqueueMessage(payload);
      return;
    }
    setIsSending(true);
    try {
      const response = await messagesHttpService.sendMessage(payload);
      if (!response.succeeded) {
        showToastError(intl.formatMessage({ id: 'MESSAGES.SEND_ERROR' }));
        return;
      }
      setInputValue('');
      await refresh(true);
    } catch (error) {
      if (isNetworkFailure(error)) {
        enqueueMessage(payload);
        return;
      }
      showToastError(intl.formatMessage({ id: 'MESSAGES.SEND_ERROR' }));
    } finally {
      setIsSending(false);
    }
  }

  const displayMessages = [
    ...messages.map((message) => ({
      key: message.id,
      testId: `message-${message.id}`,
      content: message.content,
      isMine: message.senderId === userId,
      time: formatMessageTime(message.sentAt),
      pending: false,
      timestamp: new Date(message.sentAt).getTime(),
    })),
    ...pending.map((message) => ({
      key: `pending-${message.id}`,
      testId: `pending-message-${message.id}`,
      content: message.content,
      isMine: true,
      time: '',
      pending: true,
      timestamp: message.queuedAt.getTime(),
    })),
  ].sort((a, b) => a.timestamp - b.timestamp);

  if (!user || !isOwnerAdmin(user)) return null;

  return (
    <div className="static sm:relative" ref={shellRef}>
      <button
        type="button"
        onClick={handleToggle}
        className="relative rounded-lg p-2 text-text-muted hover:bg-primary-light transition-colors"
        aria-label={intl.formatMessage({ id: 'MESSAGES.TITLE' })}
      >
        <ChatIcon />
        {totalUnread > 0 && (
          <span
            data-testid="message-badge"
            className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-xs font-bold text-white"
          >
            {totalUnread > 99 ? '99+' : totalUnread}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-2 w-auto rounded-xl border border-border bg-surface shadow-card z-50 sm:left-auto sm:right-0 sm:w-96">
          <div className="border-b border-border px-3 py-2">
            <h3 className="text-sm font-semibold text-text">
              {intl.formatMessage({ id: 'MESSAGES.TITLE' })}
            </h3>
          </div>

          <div className="max-h-64 overflow-y-auto px-2 py-2">
            {displayMessages.length === 0 ? (
              <p className="px-1 py-3 text-xs text-text-muted">
                {intl.formatMessage({ id: 'MESSAGES.EMPTY' })}
              </p>
            ) : (
              <ul className="flex flex-col gap-2" data-testid="message-list">
                {displayMessages.map((message) => (
                  <li
                    key={message.key}
                    data-testid={message.testId}
                    data-mine={message.isMine ? 'true' : 'false'}
                    data-pending={message.pending ? 'true' : 'false'}
                    className={message.isMine ? 'flex justify-end' : 'flex justify-start'}
                  >
                    <div
                      className={
                        message.pending
                          ? 'max-w-[80%] rounded-xl border border-dashed border-border bg-surface px-3 py-1.5 text-xs text-text opacity-60'
                          : message.isMine
                            ? 'max-w-[80%] rounded-xl bg-primary px-3 py-1.5 text-xs text-white'
                            : 'max-w-[80%] rounded-xl border border-border bg-surface px-3 py-1.5 text-xs text-text'
                      }
                    >
                      <p className="whitespace-pre-wrap break-words">{message.content}</p>
                      <span className="mt-0.5 block text-right text-[10px] opacity-70">
                        {message.pending
                          ? intl.formatMessage({ id: 'MESSAGES.PENDING' })
                          : message.time}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex items-center gap-2 border-t border-border px-2 py-2">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSend();
              }}
              aria-label={intl.formatMessage({ id: 'MESSAGES.INPUT_PLACEHOLDER' })}
              placeholder={intl.formatMessage({ id: 'MESSAGES.INPUT_PLACEHOLDER' })}
              className="flex-1 rounded-md border border-border px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={isSending || inputValue.trim().length === 0}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-hover transition-colors disabled:opacity-50"
            >
              {intl.formatMessage({ id: 'MESSAGES.SEND' })}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
