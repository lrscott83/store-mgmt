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

/**
 * T10 — incremental background polling. An idle conversation widens its poll
 * interval up to five minutes, and the ladder snaps back to its fastest step the
 * moment a message actually moves (incoming or outgoing). The realtime push
 * (T9.3) is the fast path; this is the fallback that also covers a hub that
 * never connects.
 */
const POLL_LADDER_MS = [10_000, 20_000, 50_000, 100_000, 180_000, 300_000] as const;

/**
 * The ladder's activity signal: `lastMessageAt` moves exactly when a message is
 * added, incoming or outgoing. Deliberately NOT `unreadCount`, which also moves
 * when the open panel marks messages read — that is not new activity and must
 * not reset the backoff.
 */
function conversationsActivitySignature(conversations: readonly ConversationDto[]): string {
  return conversations
    .map((conversation) => `${conversation.id}:${conversation.lastMessageAt}`)
    .join('|');
}

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
  const shellRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isOpenRef = useRef(false);
  const wasOnlineRef = useRef(isOnline);

  const userId = user?.id ?? '';
  const storeId = user?.selectedStoreId ?? '';
  const offlineService = useMemo(() => new MessagesOfflineService(storeId), [storeId]);
  const [pending, setPending] = useState<QueuedMessage[]>([]);
  const isFlushingRef = useRef(false);
  const initialFlushRef = useRef<string | null>(null);
  /** Last seen conversation activity signature, for the poll ladder (T10). */
  const activitySignatureRef = useRef('');
  /** Re-arms the poll ladder at its fastest step. Assigned by the poll effect. */
  const resetPollRef = useRef<(immediate: boolean) => void>(() => {});
  /** The thread's scroll box: the visible box every read receipt is measured against. */
  const listRef = useRef<HTMLDivElement>(null);
  /** Rendered `<li>` per message id, so visibility can be measured per message. */
  const itemRefs = useRef(new Map<string, HTMLLIElement>());
  /**
   * Ids already sent a receipt. The local `messages` state keeps its original
   * `readAt === null` forever, so without this every scroll would re-POST the
   * same messages the server already marked read.
   */
  const receiptedRef = useRef<Set<string>>(new Set());
  const activeConversation = conversations.find((c) => c.storeId === storeId) ?? null;
  const totalUnread = conversations.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0);

  function setPanelOpen(open: boolean) {
    isOpenRef.current = open;
    setIsOpen(open);
  }

  useClickOutside(shellRef, () => setPanelOpen(false));

  /**
   * Fetches the conversation list (and the open thread) and reports whether
   * anything actually moved — that boolean drives the poll ladder.
   *
   * EVERY call is background: a chat widget mounted in the global header must
   * never drive the loading overlay or surface an error toast, whether it runs
   * on a timer or because the user tapped the icon. Offline is an expected
   * state, not an error.
   */
  const refresh = useCallback(
    async (withMessages: boolean): Promise<boolean> => {
      if (!user || !isOwnerAdmin(user)) return false;
      try {
        const conversationsResponse = await messagesHttpService.getConversations({
          background: true,
        });
        if (!conversationsResponse.succeeded) return false;
        const nextConversations = conversationsResponse.data;
        setConversations(nextConversations);

        const signature = conversationsActivitySignature(nextConversations);
        // The first fetch only establishes the baseline; it is not activity.
        const changed =
          activitySignatureRef.current !== '' && signature !== activitySignatureRef.current;
        activitySignatureRef.current = signature;

        if (!withMessages) return changed;
        const active = nextConversations.find((c) => c.storeId === user.selectedStoreId);
        if (!active) {
          setMessages([]);
          return changed;
        }

        const messagesResponse = await messagesHttpService.getMessages(active.id, {
          background: true,
        });
        if (!messagesResponse.succeeded) return changed;
        // Read receipts are NOT issued here — see `markVisibleIncomingAsRead`.
        // Listing a thread is not reading it: this thread mounts every message
        // inside a `max-h-64` scroll box, so most of what this returns was never
        // on screen, and stamping them all dropped the badge to 0 for messages
        // the user had not seen.
        setMessages(messagesResponse.data);
        return changed;
      } catch {
        // Background: a failed poll is silent. The next cycle retries.
        return false;
      }
    },
    [user],
  );

  /**
   * A read receipt asserts the user SAW the message, so it follows the eye, not
   * the fetcher: only incoming messages whose rendered rect sits inside the
   * visible box are receipted. Everything else stays unread and keeps counting
   * in the badge, which is the number this gadget exists to report.
   *
   * In jsdom every rect is 0x0, so "inside the box" is true for all of them and
   * the shell tests keep exercising this path end to end.
   */
  const markVisibleIncomingAsRead = useCallback(() => {
    if (!user || !isOwnerAdmin(user) || !isOpenRef.current) return;
    const container = listRef.current;
    if (!container) return;
    const box = container.getBoundingClientRect();
    const visible = messages
      .filter((message) => message.readAt === null && message.senderId !== user.id)
      .filter((message) => {
        const element = itemRefs.current.get(message.id);
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        return rect.top >= box.top && rect.bottom <= box.bottom;
      })
      .map((message) => message.id)
      .filter((id) => !receiptedRef.current.has(id));
    if (visible.length === 0) return;

    // Claim them before awaiting: a scroll mid-flight must not double-POST.
    visible.forEach((id) => receiptedRef.current.add(id));
    void Promise.all(visible.map((id) => messagesHttpService.markAsRead(id, { background: true })))
      .then((results) => {
        // A refused receipt has to stay retryable, or the message is stranded
        // unread with nothing left that could re-trigger it.
        results.forEach((result, index) => {
          if (!result.succeeded) receiptedRef.current.delete(visible[index]);
        });
        return messagesHttpService.getConversations({ background: true });
      })
      .then((updated) => {
        if (updated.succeeded) setConversations(updated.data);
      })
      .catch(() => {
        visible.forEach((id) => receiptedRef.current.delete(id));
      });
  }, [messages, user]);

  // After paint, and again on every scroll inside the thread box. rAF-throttled:
  // scroll fires per frame and each pass measures every incoming row.
  useEffect(() => {
    if (!isOpen) return;
    const frame = requestAnimationFrame(markVisibleIncomingAsRead);
    const container = listRef.current;
    let scrollFrame = 0;
    const handleScroll = () => {
      if (scrollFrame !== 0) return;
      scrollFrame = requestAnimationFrame(() => {
        scrollFrame = 0;
        markVisibleIncomingAsRead();
      });
    };
    container?.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      if (scrollFrame !== 0) cancelAnimationFrame(scrollFrame);
      container?.removeEventListener('scroll', handleScroll);
    };
  }, [isOpen, messages, markVisibleIncomingAsRead]);

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
        const response = await messagesHttpService.sendMessage(payload, { background: true });
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
    // The message is NOT lost: it is queued and flushed on reconnect. Say so,
    // or the user assumes the send silently failed.
    showToastError(intl.formatMessage({ id: 'MESSAGES.OFFLINE_QUEUED' }));
  }

  // Offline-first: the icon is always mounted, but the chat never touches the
  // network without a connection. That is what keeps the offline E2E's
  // zero-request invariant intact while the header still shows the chat.
  useEffect(() => {
    if (!isOnline) return;
    void refresh(false);
  }, [isOnline, refresh]);

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
    // Returning to the window is foreground too, even when the tab never hid.
    // Re-arming the ladder covers "the timer was lost while we were away".
    function handleFocus() {
      resetPollRef.current(true);
    }
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [user]);

  // T10 — incremental polling. setTimeout, not setInterval: the next delay is a
  // function of what the last poll found. `resetPollRef` is how the rest of the
  // component (a send, a realtime push, the tab coming back) snaps the ladder
  // back to its fastest step.
  useEffect(() => {
    if (!user || !isOwnerAdmin(user)) return;
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
        // Hidden: don't poll, and don't widen — leaving the tab is not idleness.
        // visibilitychange re-arms at the fastest step and polls immediately.
        timer = setTimeout(loop, POLL_LADDER_MS[POLL_LADDER_MS.length - 1]);
        return;
      }
      const changed = await refresh(isOpenRef.current);
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

    // Foreground: never assume the timer survived a backgrounded tab.
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
  }, [user, isOnline, refresh]);

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
    // A pushed message is activity too, so the fallback poll re-arms fast. A
    // read receipt is not a new message and leaves the ladder alone.
    const pullNewMessage = () => {
      void refresh(isOpenRef.current);
      resetPollRef.current(false);
    };
    connection.on(RECEIVE_MESSAGE_EVENT, pullNewMessage);
    connection.on(MESSAGE_READ_EVENT, pull);
    void connection.start().catch(() => undefined);
    return () => {
      connection.off(RECEIVE_MESSAGE_EVENT, pullNewMessage);
      connection.off(MESSAGE_READ_EVENT, pull);
      void connection.stop().catch(() => undefined);
    };
  }, [user, isOnline, refresh]);

  function handleToggle() {
    const next = !isOpen;
    setPanelOpen(next);
    // Offline there is nothing to fetch; the queued messages are already local.
    if (next && isOnline) void refresh(true);
  }

  async function handleSend() {
    const content = inputValue.trim();
    if (!content || !user || !isOwnerAdmin(user)) return;
    const payload: SendMessagePayload = {
      conversationId: activeConversation?.id ?? NEW_CONVERSATION_ID,
      ownerId: user.id,
      storeId: user.selectedStoreId,
      content,
    };
    // Clear immediately: the composer never blocks on the network, and there is
    // no global loading state for a send.
    setInputValue('');
    if (!isOnline) {
      enqueueMessage(payload);
      return;
    }
    try {
      const response = await messagesHttpService.sendMessage(payload, { background: true });
      if (!response.succeeded) {
        // A server rejection is not a network failure: keep the text so the user
        // can retry instead of losing it.
        setInputValue(content);
        showToastError(intl.formatMessage({ id: 'MESSAGES.SEND_ERROR' }));
        return;
      }
      await refresh(true);
      // An outgoing message is activity: the fallback poll goes back to 10s.
      resetPollRef.current(false);
    } catch (error) {
      if (isNetworkFailure(error)) {
        enqueueMessage(payload);
        return;
      }
      setInputValue(content);
      showToastError(intl.formatMessage({ id: 'MESSAGES.SEND_ERROR' }));
    }
  }

  // T3 — the composer grows with its content. Reset to `auto` first so the box
  // can shrink when text is deleted; then adopt the content height. Runs on
  // every value change and when the panel opens (the ref is unmounted while
  // closed, so a late panel needs a fresh measurement).
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [inputValue, isOpen]);

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
      {/*
        Trigger mirrors CartShell's trigger EXACTLY — `rounded-lg p-2`, a
        colored glyph, a pale tint of that same color on hover — with the
        brand purple swapped for the chat identity's WhatsApp green (user
        request 2026-10-02). The two gadgets sit side by side in the header,
        so before this the chat trigger borrowed the cart's `bg-primary-light`
        hover and the two looked like the same control in two states. The
        unread badge gets the same treatment for the same reason — it was
        `bg-primary`, i.e. literally the cart badge's purple.

        `text-whatsapp` / `hover:bg-whatsapp-light` are theme tokens
        (web-common/styles.css); the literal `#25D366` used to be repeated in
        three files, which is how a brand color ends up drifting.
      */}
      <button
        type="button"
        onClick={handleToggle}
        className="relative rounded-lg p-2 text-whatsapp hover:bg-whatsapp-light transition-colors"
        aria-label={intl.formatMessage({ id: 'MESSAGES.TITLE' })}
      >
        <ChatIcon />
        {/*
          Attention dot (user request 2026-10-02): with the count always
          rendered, "3" and "0" are easy to read past, so a >0 total gets a
          red dot that grows and fades out over `animate-ping` — the pulse is
          what actually pulls the eye, not the number. Anchored top-LEFT so it
          never collides with the count badge, which owns the top-right
          corner. `aria-hidden` because the number beside it already carries
          the same fact for assistive tech, and `motion-reduce` stops the loop
          for users who asked the OS to calm animations down.
        */}
        {totalUnread > 0 && (
          <span
            data-testid="message-unread-dot"
            aria-hidden="true"
            className="absolute left-0 top-0 h-2.5 w-2.5 rounded-full bg-danger animate-ping motion-reduce:animate-none"
          />
        )}
        {/*
          The count is ALWAYS shown, zero included: a badge that appears and
          disappears with the total makes the icon itself look "inactive"
          between bursts, and a slot that reflows as the number grows shifts
          the icon under the cursor.

          The BACKGROUND is the chat's WhatsApp green in EVERY case, zero
          included (user request 2026-10-04). The `totalUnread > 0 ? green :
          bg-text-muted` branch painted rgb(140 140 140) at zero, which read as
          a disabled control instead of a quiet one — and because
          `totalUnread` sits at zero for most of the session (see the mark-as-
          read blast in `refresh`), the badge looked gray almost always. The
          gadget's identity IS the icon's color, so the two never diverge.

          No opacity variant: the cart badge paints a solid `bg-primary` with
          no dimmed state (cart-shell.tsx:663), so there is nothing to mirror.
        */}
        <span
          data-testid="message-badge"
          className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-whatsapp px-1 text-xs font-bold text-white"
        >
          {totalUnread > 99 ? '99+' : totalUnread}
        </span>
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-2 w-auto rounded-xl border border-border bg-surface shadow-card z-50 sm:left-auto sm:right-0 sm:w-96">
          <div className="border-b border-border px-3 py-2">
            <h3 className="text-sm font-semibold text-text">
              {intl.formatMessage({ id: 'MESSAGES.TITLE' })}
            </h3>
          </div>

          <div className="max-h-64 overflow-y-auto px-2 py-2" ref={listRef}>
            {displayMessages.length === 0 ? (
              <p className="px-1 py-3 text-xs text-text-muted">
                {intl.formatMessage({ id: 'MESSAGES.EMPTY' })}
              </p>
            ) : (
              <ul className="flex flex-col gap-2" data-testid="message-list">
                {displayMessages.map((message) => (
                  <li
                    key={message.key}
                    ref={(element) => {
                      if (element) itemRefs.current.set(message.key, element);
                      else itemRefs.current.delete(message.key);
                    }}
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

          <div className="flex items-end gap-2 border-t border-border px-2 py-2">
            <textarea
              ref={inputRef}
              rows={2}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              aria-label={intl.formatMessage({ id: 'MESSAGES.INPUT_PLACEHOLDER' })}
              placeholder={intl.formatMessage({ id: 'MESSAGES.INPUT_PLACEHOLDER' })}
              className="max-h-32 flex-1 resize-none overflow-y-auto rounded-md border border-border px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={inputValue.trim().length === 0}
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
