import { StorageKeys } from '~/shared/lib/storage/storage-keys';
import { encryptEntity } from '~/shared/lib/storage/entity-crypto';
import { readEntityOrThrow } from '~/shared/lib/storage/read-entity-or-throw';
import type { SendMessagePayload } from './messages-types';

const MESSAGES_QUEUE_ENTITY = 'messagesQueue';

export interface QueuedMessage {
  id: string;
  conversationId: string;
  ownerId: string;
  storeId: string;
  content: string;
  queuedAt: Date;
}

function generateId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }
  return `mqueue-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * MessagesOfflineService — per-store persistence of text messages the owner
 * sent while offline, drained oldest→newest on reconnect. Same storage shape
 * as the channel-rate offline service: encrypted plain-array wire format,
 * date revival on load and a `readEntityOrThrow` read seam.
 */
export class MessagesOfflineService {
  constructor(private readonly storeId: string) {}

  enqueue(payload: SendMessagePayload): QueuedMessage {
    const message: QueuedMessage = {
      id: generateId(),
      conversationId: payload.conversationId,
      ownerId: payload.ownerId,
      storeId: payload.storeId,
      content: payload.content,
      queuedAt: new Date(),
    };
    const queue = this.read();
    queue.push(message);
    this.write(queue);
    return message;
  }

  getQueue(): QueuedMessage[] {
    return this.read();
  }

  remove(id: string): void {
    if (typeof window === 'undefined') return;
    this.write(this.read().filter((message) => message.id !== id));
  }

  /**
   * Sends queued messages oldest→newest, removing each on success and
   * stopping at the first failure so order is preserved. A rejected `send`
   * counts as a failure and stops the drain, leaving the message queued.
   */
  async flush(
    send: (payload: SendMessagePayload) => Promise<boolean>,
  ): Promise<{ sent: number; failed: number }> {
    if (typeof window === 'undefined') return { sent: 0, failed: 0 };

    const queue = this.read();
    let sent = 0;
    for (const message of queue) {
      let succeeded = false;
      try {
        succeeded = await send({
          conversationId: message.conversationId,
          ownerId: message.ownerId,
          storeId: message.storeId,
          content: message.content,
        });
      } catch {
        succeeded = false;
      }
      if (!succeeded) {
        return { sent, failed: 1 };
      }
      sent += 1;
      this.remove(message.id);
    }
    return { sent, failed: 0 };
  }

  private read(): QueuedMessage[] {
    if (typeof window === 'undefined') return [];
    const stored = readEntityOrThrow(this.storageKey(), (json) =>
      json ? (JSON.parse(json) as QueuedMessage[]).map((message) => this.revive(message)) : null,
    );
    return stored ?? [];
  }

  private write(queue: QueuedMessage[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(this.storageKey(), encryptEntity(JSON.stringify(queue)));
  }

  private revive(message: QueuedMessage): QueuedMessage {
    const raw = message as unknown as { queuedAt: unknown };
    return {
      ...message,
      queuedAt: typeof raw.queuedAt === 'string' ? new Date(raw.queuedAt) : message.queuedAt,
    };
  }

  private storageKey(): string {
    return StorageKeys.entityKey(MESSAGES_QUEUE_ENTITY, this.storeId);
  }
}
