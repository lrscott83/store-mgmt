import { beforeEach, describe, expect, it } from 'vitest';
import { MessagesOfflineService } from '../messages-offline-service';
import type { QueuedMessage } from '../messages-offline-service';
import type { SendMessagePayload } from '../messages-types';

const storeId = 's1';
const storageKey = `lizoft.store-messagesQueue-${storeId}`;

function payload(overrides: Partial<SendMessagePayload> = {}): SendMessagePayload {
  return {
    conversationId: 'c1',
    ownerId: 'u1',
    storeId,
    content: 'Hola',
    ...overrides,
  };
}

describe('MessagesOfflineService', () => {
  let service: MessagesOfflineService;

  beforeEach(() => {
    localStorage.clear();
    service = new MessagesOfflineService(storeId);
  });

  describe('enqueue / getQueue / remove', () => {
    it('enqueues a message with a client id, queuedAt Date and the payload fields', () => {
      const queued = service.enqueue(payload({ content: 'Primero' }));

      expect(queued.id).toBeTruthy();
      expect(queued.conversationId).toBe('c1');
      expect(queued.ownerId).toBe('u1');
      expect(queued.storeId).toBe(storeId);
      expect(queued.content).toBe('Primero');
      expect(queued.queuedAt).toBeInstanceOf(Date);

      const queue = service.getQueue();
      expect(queue).toHaveLength(1);
      expect(queue[0].id).toBe(queued.id);
    });

    it('generates a distinct id per enqueued message', () => {
      const first = service.enqueue(payload({ content: 'a' }));
      const second = service.enqueue(payload({ content: 'b' }));

      expect(first.id).not.toBe(second.id);
      expect(service.getQueue()).toHaveLength(2);
    });

    it('removes a queued message by id and leaves the rest', () => {
      const first = service.enqueue(payload({ content: 'a' }));
      const second = service.enqueue(payload({ content: 'b' }));

      service.remove(first.id);

      const queue = service.getQueue();
      expect(queue).toHaveLength(1);
      expect(queue[0].id).toBe(second.id);
    });

    it('removing an unknown id writes nothing', () => {
      service.enqueue(payload());
      const rawBefore = localStorage.getItem(storageKey);

      service.remove('does-not-exist');

      expect(localStorage.getItem(storageKey)).toBe(rawBefore);
    });
  });

  describe('persistence and date revival', () => {
    it('persists so a fresh instance reads the queue back', () => {
      service.enqueue(payload({ content: 'Persistido' }));

      const fresh = new MessagesOfflineService(storeId);
      const queue = fresh.getQueue();
      expect(queue).toHaveLength(1);
      expect(queue[0].content).toBe('Persistido');
    });

    it('revives queuedAt to a Date on load', () => {
      const queued = service.enqueue(payload());

      const fresh = new MessagesOfflineService(storeId);
      expect(fresh.getQueue()[0].queuedAt).toBeInstanceOf(Date);
      expect(fresh.getQueue()[0].queuedAt.getTime()).toBe(queued.queuedAt.getTime());
    });

    it('auto-reads an absent key as an empty queue without writing', () => {
      expect(service.getQueue()).toEqual([]);
      expect(localStorage.getItem(storageKey)).toBeNull();
    });

    it('does not leak the queue across stores', () => {
      service.enqueue(payload());

      const otherStore = new MessagesOfflineService('s2');
      expect(otherStore.getQueue()).toEqual([]);
    });
  });

  describe('flush', () => {
    it('sends oldest→newest and removes each on success', async () => {
      service.enqueue(payload({ content: 'first' }));
      service.enqueue(payload({ content: 'second' }));
      service.enqueue(payload({ content: 'third' }));

      const sent: string[] = [];
      const result = await service.flush(async (queued) => {
        sent.push(queued.content);
        return true;
      });

      expect(sent).toEqual(['first', 'second', 'third']);
      expect(result).toEqual({ sent: 3, failed: 0 });
      expect(service.getQueue()).toEqual([]);
    });

    it('stopping on the first failure preserves order and keeps the rest queued', async () => {
      service.enqueue(payload({ content: 'first' }));
      service.enqueue(payload({ content: 'second' }));
      service.enqueue(payload({ content: 'third' }));

      const attempted: string[] = [];
      const result = await service.flush(async (queued) => {
        attempted.push(queued.content);
        return queued.content !== 'second';
      });

      expect(attempted).toEqual(['first', 'second']);
      expect(result).toEqual({ sent: 1, failed: 1 });
      expect(service.getQueue().map((message) => message.content)).toEqual(['second', 'third']);
    });

    it('a thrown send counts as failed and stops the drain', async () => {
      service.enqueue(payload({ content: 'first' }));
      service.enqueue(payload({ content: 'second' }));
      service.enqueue(payload({ content: 'third' }));

      const attempted: string[] = [];
      const result = await service.flush(async (queued) => {
        attempted.push(queued.content);
        if (queued.content === 'second') throw new Error('offline');
        return true;
      });

      expect(attempted).toEqual(['first', 'second']);
      expect(result).toEqual({ sent: 1, failed: 1 });
      expect(service.getQueue().map((message) => message.content)).toEqual(['second', 'third']);
    });

    it('flushing an empty queue is a no-op', async () => {
      const result = await service.flush(async () => true);

      expect(result).toEqual({ sent: 0, failed: 0 });
    });

    it('forwards the full payload of each queued message to the sender', async () => {
      service.enqueue(payload({ conversationId: 'c9', ownerId: 'u9', content: 'X' }));

      const received: SendMessagePayload[] = [];
      await service.flush(async (queued) => {
        received.push(queued);
        return true;
      });

      expect(received[0]).toEqual({
        conversationId: 'c9',
        ownerId: 'u9',
        storeId,
        content: 'X',
      });
    });
  });

  describe('getStorageMessagesQueueJson', () => {
    it('returns the queue as plain JSON with ISO-string dates', () => {
      const queued = service.enqueue(payload({ content: 'Exportame' }));

      const raw = service.getStorageMessagesQueueJson();
      const parsed = JSON.parse(raw) as QueuedMessage[];

      expect(parsed).toHaveLength(1);
      expect(parsed[0].id).toBe(queued.id);
      expect(parsed[0].content).toBe('Exportame');
      expect(typeof parsed[0].queuedAt).toBe('string');
      expect(parsed[0].queuedAt).toBe(queued.queuedAt.toISOString());
    });

    it('returns [] for an empty queue', () => {
      expect(JSON.parse(service.getStorageMessagesQueueJson())).toEqual([]);
    });
  });

  describe('addImportedQueuedMessage', () => {
    function imported(overrides: Partial<QueuedMessage> = {}): QueuedMessage {
      return {
        id: 'imported-1',
        conversationId: 'c1',
        ownerId: 'u1',
        storeId,
        content: 'Restaurado',
        queuedAt: '2026-10-01T10:00:00.000Z' as unknown as Date,
        ...overrides,
      };
    }

    it('appends an imported message and revives its queuedAt string to a Date', () => {
      const result = service.addImportedQueuedMessage(imported());

      expect(result.succeeded).toBe(true);
      const queue = service.getQueue();
      expect(queue).toHaveLength(1);
      expect(queue[0].id).toBe('imported-1');
      expect(queue[0].content).toBe('Restaurado');
      expect(queue[0].queuedAt).toBeInstanceOf(Date);
      expect(queue[0].queuedAt.getTime()).toBe(
        new Date('2026-10-01T10:00:00.000Z').getTime(),
      );
    });

    it('skips a message whose id is already queued (append-only)', () => {
      service.addImportedQueuedMessage(imported({ content: 'first' }));
      const result = service.addImportedQueuedMessage(imported({ content: 'second' }));

      expect(result.succeeded).toBe(true);
      const queue = service.getQueue();
      expect(queue).toHaveLength(1);
      expect(queue[0].content).toBe('first');
    });

    it('rejects an empty content with a failed Result and writes nothing', () => {
      const result = service.addImportedQueuedMessage(imported({ content: '' }));

      expect(result.succeeded).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(service.getQueue()).toEqual([]);
      expect(localStorage.getItem(storageKey)).toBeNull();
    });

    it('assigns a generated id when the imported message has none', () => {
      const result = service.addImportedQueuedMessage(
        imported({ id: '' as unknown as string }),
      );

      expect(result.succeeded).toBe(true);
      const queue = service.getQueue();
      expect(queue).toHaveLength(1);
      expect(queue[0].id).toBeTruthy();
    });

    it('persists so a fresh instance reads the imported message back', () => {
      service.addImportedQueuedMessage(imported());

      const fresh = new MessagesOfflineService(storeId);
      expect(fresh.getQueue()).toHaveLength(1);
      expect(fresh.getQueue()[0].content).toBe('Restaurado');
    });
  });
});
