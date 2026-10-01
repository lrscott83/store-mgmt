import { useCallback, useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import { superAdminLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { messagesHttpService } from '~/shared/lib/messages/messages-http-service';
import type { ConversationDto, MessageDto } from '~/shared/lib/messages/messages-types';
import { storeHttpService } from '~/management/stores/lib/services/store-http-service';
import { showToastError, showToastSuccess } from '~/shared/lib/toast';
import { Modal } from '~/shared/components/ui/modal';

export const clientLoader = superAdminLoader;

const REFRESH_INTERVAL_MS = 15000;

interface StoreLabel {
  name: string;
  ownerName: string;
}

function formatMessageTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

export function AdminMessagesPage() {
  const intl = useIntl();
  const user = useAuthStore((s) => s.user);
  const userId = user?.id ?? '';
  const [conversations, setConversations] = useState<ConversationDto[]>([]);
  const [storeLabels, setStoreLabels] = useState<Map<string, StoreLabel>>(new Map());
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [broadcastContent, setBroadcastContent] = useState('');
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const selectedIdRef = useRef<string | null>(null);

  const loadMessages = useCallback(
    async (conversationId: string) => {
      try {
        const response = await messagesHttpService.getMessages(conversationId);
        if (!response.succeeded) return;
        setMessages(response.data);
        const unreadIncoming = response.data.filter(
          (message) => message.readAt === null && message.senderId !== userId,
        );
        if (unreadIncoming.length > 0) {
          await Promise.all(
            unreadIncoming.map((message) => messagesHttpService.markAsRead(message.id)),
          );
          const updated = await messagesHttpService.getConversations();
          if (updated.succeeded) setConversations(updated.data);
        }
      } catch {
        showToastError(intl.formatMessage({ id: 'MESSAGES.LOAD_ERROR' }));
      }
    },
    [userId, intl],
  );

  const refresh = useCallback(
    async (conversationId: string | null) => {
      try {
        const [conversationsResponse, storesResponse] = await Promise.all([
          messagesHttpService.getConversations(),
          storeHttpService.listStores(),
        ]);
        if (conversationsResponse.succeeded) setConversations(conversationsResponse.data);
        if (storesResponse.succeeded) {
          setStoreLabels(
            new Map(
              storesResponse.data.map((store) => [
                store.id,
                { name: store.name, ownerName: store.ownerName },
              ]),
            ),
          );
        }
        if (conversationId) await loadMessages(conversationId);
      } catch {
        showToastError(intl.formatMessage({ id: 'MESSAGES.LOAD_ERROR' }));
      }
    },
    [loadMessages, intl],
  );

  useEffect(() => {
    selectedIdRef.current = selectedConversationId;
  }, [selectedConversationId]);

  useEffect(() => {
    void refresh(null);
  }, [refresh]);

  useEffect(() => {
    if (selectedConversationId) {
      void loadMessages(selectedConversationId);
    } else {
      setMessages([]);
    }
  }, [selectedConversationId, loadMessages]);

  useEffect(() => {
    function handleFocus() {
      void refresh(selectedIdRef.current);
    }
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [refresh]);

  useEffect(() => {
    function handleOnline() {
      void refresh(selectedIdRef.current);
    }
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [refresh]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void refresh(selectedIdRef.current);
      }
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [refresh]);

  function labelFor(conversation: ConversationDto): StoreLabel {
    const label = storeLabels.get(conversation.storeId);
    return label ?? { name: conversation.storeId, ownerName: conversation.ownerId };
  }

  async function handleSend() {
    const content = inputValue.trim();
    const conversation = conversations.find((c) => c.id === selectedConversationId);
    if (!content || !conversation || isSending) return;
    setIsSending(true);
    try {
      const response = await messagesHttpService.sendMessage({
        conversationId: conversation.id,
        ownerId: conversation.ownerId,
        storeId: conversation.storeId,
        content,
      });
      if (!response.succeeded) {
        showToastError(intl.formatMessage({ id: 'MESSAGES.SEND_ERROR' }));
        return;
      }
      setInputValue('');
      await loadMessages(conversation.id);
    } catch {
      showToastError(intl.formatMessage({ id: 'MESSAGES.SEND_ERROR' }));
    } finally {
      setIsSending(false);
    }
  }

  async function handleBroadcast() {
    const content = broadcastContent.trim();
    if (!content || isBroadcasting) return;
    setIsBroadcasting(true);
    try {
      const response = await messagesHttpService.broadcastMessage(content);
      if (!response.succeeded) {
        showToastError(intl.formatMessage({ id: 'MESSAGES.BROADCAST_ERROR' }));
        return;
      }
      showToastSuccess(intl.formatMessage({ id: 'MESSAGES.BROADCAST_SUCCESS' }));
      setBroadcastContent('');
      setBroadcastOpen(false);
      await refresh(selectedIdRef.current);
    } catch {
      showToastError(intl.formatMessage({ id: 'MESSAGES.BROADCAST_ERROR' }));
    } finally {
      setIsBroadcasting(false);
    }
  }

  const selectedConversation =
    conversations.find((c) => c.id === selectedConversationId) ?? null;

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{intl.formatMessage({ id: 'MESSAGES.TITLE' })}</h1>
        <button
          type="button"
          data-testid="broadcast-open"
          onClick={() => setBroadcastOpen(true)}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover transition-colors"
        >
          {intl.formatMessage({ id: 'MESSAGES.BROADCAST' })}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-border bg-surface md:col-span-1">
          <div className="max-h-[70vh] overflow-y-auto p-2">
            {conversations.length === 0 ? (
              <p className="px-1 py-3 text-sm text-text-muted">
                {intl.formatMessage({ id: 'MESSAGES.LIST_EMPTY' })}
              </p>
            ) : (
              <ul data-testid="conversations-list" className="flex flex-col gap-1">
                {conversations.map((conversation) => {
                  const label = labelFor(conversation);
                  const isSelected = conversation.id === selectedConversationId;
                  return (
                    <li key={conversation.id}>
                      <button
                        type="button"
                        data-testid={`conversation-${conversation.id}`}
                        onClick={() => setSelectedConversationId(conversation.id)}
                        className={`w-full rounded-lg px-3 py-2 text-left transition-colors ${
                          isSelected ? 'bg-primary-light' : 'hover:bg-surface-hover'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium text-text">
                            {label.ownerName}
                          </span>
                          {conversation.unreadCount > 0 && (
                            <span
                              data-testid={`conversation-unread-${conversation.id}`}
                              className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold leading-none text-white"
                            >
                              {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
                            </span>
                          )}
                        </div>
                        <span className="block truncate text-xs text-text-muted">
                          {label.name}
                        </span>
                        {conversation.lastMessageContent && (
                          <span className="block truncate text-xs text-text-muted">
                            {truncate(conversation.lastMessageContent, 60)}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="flex flex-col rounded-xl border border-border bg-surface md:col-span-2">
          {!selectedConversation ? (
            <p className="px-4 py-6 text-sm text-text-muted">
              {intl.formatMessage({ id: 'MESSAGES.SELECT_CONVERSATION' })}
            </p>
          ) : (
            <>
              <div className="border-b border-border px-4 py-2">
                <h2 className="truncate text-sm font-semibold text-text">
                  {labelFor(selectedConversation).ownerName}
                </h2>
                <span className="block truncate text-xs text-text-muted">
                  {labelFor(selectedConversation).name}
                </span>
              </div>

              <div className="max-h-[60vh] flex-1 overflow-y-auto px-4 py-3">
                {messages.length === 0 ? (
                  <p className="text-sm text-text-muted">
                    {intl.formatMessage({ id: 'MESSAGES.EMPTY' })}
                  </p>
                ) : (
                  <ul data-testid="message-list" className="flex flex-col gap-2">
                    {messages.map((message) => {
                      const isMine = message.senderId === userId;
                      return (
                        <li
                          key={message.id}
                          data-testid={`message-${message.id}`}
                          data-mine={isMine ? 'true' : 'false'}
                          className={isMine ? 'flex justify-end' : 'flex justify-start'}
                        >
                          <div
                            className={
                              isMine
                                ? 'max-w-[80%] rounded-xl bg-primary px-3 py-1.5 text-xs text-white'
                                : 'max-w-[80%] rounded-xl border border-border bg-surface px-3 py-1.5 text-xs text-text'
                            }
                          >
                            <p className="whitespace-pre-wrap break-words">{message.content}</p>
                            <span className="mt-0.5 block text-right text-[10px] opacity-70">
                              {formatMessageTime(message.sentAt)}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="flex items-center gap-2 border-t border-border px-3 py-2">
                <input
                  type="text"
                  value={inputValue}
                  data-testid="message-input"
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleSend();
                  }}
                  aria-label={intl.formatMessage({ id: 'MESSAGES.INPUT_PLACEHOLDER' })}
                  placeholder={intl.formatMessage({ id: 'MESSAGES.INPUT_PLACEHOLDER' })}
                  className="flex-1 rounded-md border border-border px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  type="button"
                  data-testid="message-send"
                  onClick={handleSend}
                  disabled={isSending || inputValue.trim().length === 0}
                  className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary-hover transition-colors disabled:opacity-50"
                >
                  {intl.formatMessage({ id: 'MESSAGES.SEND' })}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <Modal
        open={broadcastOpen}
        onClose={() => setBroadcastOpen(false)}
        title={intl.formatMessage({ id: 'MESSAGES.BROADCAST_TITLE' })}
        testId="broadcast-modal"
      >
        <textarea
          value={broadcastContent}
          data-testid="broadcast-input"
          onChange={(e) => setBroadcastContent(e.target.value)}
          aria-label={intl.formatMessage({ id: 'MESSAGES.BROADCAST_PLACEHOLDER' })}
          placeholder={intl.formatMessage({ id: 'MESSAGES.BROADCAST_PLACEHOLDER' })}
          rows={4}
          className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            data-testid="broadcast-send"
            onClick={handleBroadcast}
            disabled={isBroadcasting || broadcastContent.trim().length === 0}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover transition-colors disabled:opacity-50"
          >
            {intl.formatMessage({ id: 'MESSAGES.BROADCAST_SEND' })}
          </button>
        </div>
      </Modal>
    </div>
  );
}

export default AdminMessagesPage;
