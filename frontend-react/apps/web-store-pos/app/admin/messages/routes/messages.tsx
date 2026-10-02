import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import type { Owner, Store } from '@store-mgmt/domain';
import { superAdminLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { useOnlineStatus } from '~/shared/lib/hooks/use-online-status';
import { messagesHttpService } from '~/shared/lib/messages/messages-http-service';
import type { ConversationDto, MessageDto } from '~/shared/lib/messages/messages-types';
import { ownerHttpService } from '~/admin/owners/lib/services/owner-http-service';
import { storeHttpService } from '~/management/stores/lib/services/store-http-service';
import { showToastError, showToastSuccess } from '~/shared/lib/toast';
import { Modal } from '~/shared/components/ui/modal';

export const clientLoader = superAdminLoader;

const NEW_CONVERSATION_ID = '00000000-0000-0000-0000-000000000000';

/**
 * T10 — incremental background polling, mirrored from the owner chat shell. An
 * idle thread widens its poll interval up to five minutes, and the ladder snaps
 * back to its fastest step the moment a thread actually moves.
 */
const POLL_LADDER_MS = [10_000, 20_000, 50_000, 100_000, 180_000, 300_000] as const;

/**
 * A store is free when it is not approved OR its plan is the free tier. The
 * backend collapses both into planType "Gratis", but approved is kept explicit
 * because listStores also returns disapproved stores.
 */
function isFreeStore(store: Store): boolean {
  return !store.approved || store.planType === 'Gratis';
}

function conversationsActivitySignature(conversations: readonly ConversationDto[]): string {
  return conversations
    .map((conversation) => `${conversation.id}:${conversation.lastMessageAt}`)
    .join('|');
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
  const isOnline = useOnlineStatus();
  const [owners, setOwners] = useState<Owner[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [conversations, setConversations] = useState<ConversationDto[]>([]);
  const [selectedOwnerId, setSelectedOwnerId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [broadcastContent, setBroadcastContent] = useState('');
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  /** The selected owner, kept in a ref for the callbacks the poll ladder runs. */
  const selectedOwnerRef = useRef<Owner | null>(null);
  /** Last seen conversation activity signature, for the poll ladder (T10). */
  const activitySignatureRef = useRef('');
  /** Re-arms the poll ladder at its fastest step. Assigned by the poll effect. */
  const resetPollRef = useRef<(immediate: boolean) => void>(() => {});

  const storeLabels = useMemo(
    () => new Map(stores.map((store) => [store.id, store.name])),
    [stores],
  );

  const selectedOwner = owners.find((owner) => owner.id === selectedOwnerId) ?? null;

  const selectedConversation = selectedOwner
    ? (conversations.find((conversation) => conversation.ownerId === selectedOwner.userId) ?? null)
    : null;

  /**
   * The store a conversation for this owner belongs to: the existing
   * conversation's store, else the owner's first non-free active store, else
   * the first active store, else the first store at all.
   */
  function preferredStoreId(owner: Owner): string | null {
    const conversation = conversations.find((c) => c.ownerId === owner.userId);
    if (conversation?.storeId) return conversation.storeId;
    const ownerStores = stores.filter((store) => store.ownerId === owner.id);
    const nonFreeActive = ownerStores.find((store) => store.isActive && !isFreeStore(store));
    if (nonFreeActive) return nonFreeActive.id;
    const active = ownerStores.find((store) => store.isActive);
    if (active) return active.id;
    return ownerStores[0]?.id ?? null;
  }

  const selectedStoreId = selectedConversation?.storeId
    ? selectedConversation.storeId
    : selectedOwner
      ? preferredStoreId(selectedOwner)
      : null;

  const sortedOwners = useMemo(() => {
    const hasNonFreeStore = (owner: Owner) =>
      stores.some((store) => store.ownerId === owner.id && !isFreeStore(store));
    return [...owners].sort((a, b) => {
      const rankA = hasNonFreeStore(a) ? 0 : 1;
      const rankB = hasNonFreeStore(b) ? 0 : 1;
      if (rankA !== rankB) return rankA - rankB;
      return a.fullName.localeCompare(b.fullName);
    });
  }, [owners, stores]);

  useEffect(() => {
    selectedOwnerRef.current = selectedOwner;
  }, [selectedOwner]);

  /**
   * Owners + stores are the slowly moving directory, so they load on mount and
   * on focus / online — never on every poll (listStores is heavy).
   */
  const loadDirectory = useCallback(async () => {
    try {
      const [ownersResponse, storesResponse] = await Promise.all([
        ownerHttpService.listOwners(),
        storeHttpService.listStores(),
      ]);
      if (ownersResponse.succeeded) {
        setOwners(ownersResponse.data.filter((owner) => owner.isActive));
      }
      if (storesResponse.succeeded) setStores(storesResponse.data);
    } catch {
      showToastError(intl.formatMessage({ id: 'MESSAGES.LOAD_ERROR' }));
    }
  }, [intl]);

  const loadMessages = useCallback(
    async (conversationId: string, options?: { background?: boolean }) => {
      const background = options?.background === true;
      try {
        const response = background
          ? await messagesHttpService.getMessages(conversationId, { background: true })
          : await messagesHttpService.getMessages(conversationId);
        if (!response.succeeded) return;
        setMessages(response.data);
        const unreadIncoming = response.data.filter(
          (message) => message.readAt === null && message.senderId !== userId,
        );
        if (unreadIncoming.length > 0) {
          await Promise.all(
            unreadIncoming.map((message) =>
              background
                ? messagesHttpService.markAsRead(message.id, { background: true })
                : messagesHttpService.markAsRead(message.id),
            ),
          );
          const updated = background
            ? await messagesHttpService.getConversations({ background: true })
            : await messagesHttpService.getConversations();
          if (updated.succeeded) setConversations(updated.data);
        }
      } catch {
        if (!background) showToastError(intl.formatMessage({ id: 'MESSAGES.LOAD_ERROR' }));
      }
    },
    [userId, intl],
  );

  /**
   * Fetches the conversation list and reports whether anything actually moved —
   * that boolean drives the poll ladder. Also refreshes the open thread when the
   * selected owner has one. A background call is silent: no loading overlay and
   * no error toast on a timer.
   */
  const refreshThreads = useCallback(
    async (background: boolean): Promise<boolean> => {
      try {
        const response = background
          ? await messagesHttpService.getConversations({ background: true })
          : await messagesHttpService.getConversations();
        if (!response.succeeded) return false;
        const nextConversations = response.data;
        setConversations(nextConversations);

        const signature = conversationsActivitySignature(nextConversations);
        const changed =
          activitySignatureRef.current !== '' && signature !== activitySignatureRef.current;
        activitySignatureRef.current = signature;

        const owner = selectedOwnerRef.current;
        if (owner) {
          const conversation = nextConversations.find((c) => c.ownerId === owner.userId);
          if (conversation) {
            await loadMessages(conversation.id, background ? { background: true } : undefined);
          }
        }
        return changed;
      } catch {
        if (!background) showToastError(intl.formatMessage({ id: 'MESSAGES.LOAD_ERROR' }));
        return false;
      }
    },
    [loadMessages, intl],
  );

  useEffect(() => {
    void loadDirectory();
  }, [loadDirectory]);

  useEffect(() => {
    void refreshThreads(false);
  }, [refreshThreads]);

  const selectedConversationId = selectedConversation?.id ?? null;

  useEffect(() => {
    if (selectedConversationId) void loadMessages(selectedConversationId);
    else setMessages([]);
  }, [selectedConversationId, loadMessages]);

  // Returning to the window or regaining a connection is foreground: reload the
  // directory and re-arm the ladder at its fastest step.
  useEffect(() => {
    function handleFocus() {
      void loadDirectory();
      resetPollRef.current(true);
    }
    function handleOnline() {
      void loadDirectory();
      resetPollRef.current(true);
    }
    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleOnline);
    };
  }, [loadDirectory]);

  // T10 — incremental polling. setTimeout, not setInterval: the next delay is a
  // function of what the last poll found. `resetPollRef` is how the rest of the
  // component (a send, a focus, the tab coming back) snaps the ladder back.
  useEffect(() => {
    let cancelled = false;
    let step = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const loop = async () => {
      if (cancelled) return;
      if (!isOnline) {
        // No connection: never poll. The online transition re-arms the ladder.
        timer = setTimeout(loop, POLL_LADDER_MS[POLL_LADDER_MS.length - 1]);
        return;
      }
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        // Hidden: don't poll and don't widen — leaving the tab is not idleness.
        timer = setTimeout(loop, POLL_LADDER_MS[POLL_LADDER_MS.length - 1]);
        return;
      }
      const changed = await refreshThreads(true);
      if (cancelled) return;
      step = changed ? 0 : Math.min(step + 1, POLL_LADDER_MS.length - 1);
      timer = setTimeout(loop, POLL_LADDER_MS[step]);
    };

    resetPollRef.current = (immediate) => {
      if (cancelled) return;
      step = 0;
      if (timer !== undefined) clearTimeout(timer);
      if (immediate) void loop();
      else timer = setTimeout(loop, POLL_LADDER_MS[0]);
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') resetPollRef.current(true);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    timer = setTimeout(loop, POLL_LADDER_MS[0]);

    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
      resetPollRef.current = () => {};
    };
  }, [isOnline, refreshThreads]);

  async function handleSend() {
    const content = inputValue.trim();
    if (!content || !selectedOwner || isSending) return;
    const storeId =
      selectedConversation?.storeId ?? preferredStoreId(selectedOwner);
    if (!storeId) {
      showToastError(intl.formatMessage({ id: 'MESSAGES.NO_STORE' }));
      return;
    }
    setIsSending(true);
    try {
      const response = await messagesHttpService.sendMessage({
        conversationId: selectedConversation?.id ?? NEW_CONVERSATION_ID,
        ownerId: selectedOwner.userId,
        storeId,
        content,
      });
      if (!response.succeeded) {
        showToastError(intl.formatMessage({ id: 'MESSAGES.SEND_ERROR' }));
        return;
      }
      setInputValue('');
      await refreshThreads(false);
      // An outgoing message is activity: the fallback poll goes back to 10s.
      resetPollRef.current(false);
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
      await refreshThreads(false);
      resetPollRef.current(false);
    } catch {
      showToastError(intl.formatMessage({ id: 'MESSAGES.BROADCAST_ERROR' }));
    } finally {
      setIsBroadcasting(false);
    }
  }

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
            {sortedOwners.length === 0 ? (
              <p className="px-1 py-3 text-sm text-text-muted">
                {intl.formatMessage({ id: 'MESSAGES.LIST_EMPTY' })}
              </p>
            ) : (
              <ul data-testid="owners-list" className="flex flex-col gap-1">
                {sortedOwners.map((owner) => {
                  const conversation =
                    conversations.find((c) => c.ownerId === owner.userId) ?? null;
                  const storeId = conversation?.storeId ?? preferredStoreId(owner);
                  const storeName = storeId
                    ? (storeLabels.get(storeId) ?? intl.formatMessage({ id: 'MESSAGES.NO_STORE' }))
                    : intl.formatMessage({ id: 'MESSAGES.NO_STORE' });
                  const isSelected = owner.id === selectedOwnerId;
                  return (
                    <li key={owner.id}>
                      <button
                        type="button"
                        data-testid={`owner-${owner.id}`}
                        onClick={() => setSelectedOwnerId(owner.id)}
                        className={`w-full rounded-lg px-3 py-2 text-left transition-colors ${
                          isSelected ? 'bg-primary-light' : 'hover:bg-surface-hover'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium text-text">
                            {owner.fullName}
                          </span>
                          {conversation && conversation.unreadCount > 0 && (
                            <span
                              data-testid={`owner-unread-${owner.id}`}
                              className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold leading-none text-white"
                            >
                              {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
                            </span>
                          )}
                        </div>
                        <span className="block truncate text-xs text-text-muted">{storeName}</span>
                        {conversation?.lastMessageContent && (
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
          {!selectedOwner ? (
            <p className="px-4 py-6 text-sm text-text-muted">
              {intl.formatMessage({ id: 'MESSAGES.SELECT_CONVERSATION' })}
            </p>
          ) : (
            <>
              <div className="border-b border-border px-4 py-2">
                <h2 className="truncate text-sm font-semibold text-text">{selectedOwner.fullName}</h2>
                <span className="block truncate text-xs text-text-muted">
                  {selectedStoreId
                    ? (storeLabels.get(selectedStoreId) ??
                      intl.formatMessage({ id: 'MESSAGES.NO_STORE' }))
                    : intl.formatMessage({ id: 'MESSAGES.NO_STORE' })}
                </span>
              </div>

              <div className="max-h-[60vh] flex-1 overflow-y-auto px-4 py-3">
                {messages.length === 0 ? (
                  <p className="text-sm text-text-muted">
                    {intl.formatMessage({
                      id: selectedConversation ? 'MESSAGES.EMPTY' : 'MESSAGES.NO_CONVERSATION',
                    })}
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
                  disabled={!selectedStoreId}
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
                  disabled={isSending || inputValue.trim().length === 0 || !selectedStoreId}
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
