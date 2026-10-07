import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('~/shared/lib/http/api-client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}));

import { apiClient } from '~/shared/lib/http/api-client';
import { messagesHttpService } from '../messages-http-service';
import type { SendMessagePayload } from '../messages-types';

describe('messagesHttpService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getConversations calls GET /v1/messages/conversations and unwraps response.data', async () => {
    const conversations = [
      {
        id: 'c1',
        ownerId: 'u1',
        storeId: 's1',
        lastMessageAt: '2026-09-30T10:00:00Z',
        lastMessageContent: 'Hola',
        unreadCount: 2,
      },
    ];
    vi.mocked(apiClient.get).mockResolvedValue({ data: { data: conversations, succeeded: true } });

    const result = await messagesHttpService.getConversations();

    expect(apiClient.get).toHaveBeenCalledWith('/v1/messages/conversations');
    expect(result).toEqual({ data: conversations, succeeded: true });
  });

  it('getMessages calls GET /v1/messages/conversations/{id}/messages', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { data: [], succeeded: true } });

    await messagesHttpService.getMessages('c1');

    expect(apiClient.get).toHaveBeenCalledWith('/v1/messages/conversations/c1/messages');
  });

  it('sendMessage calls POST /v1/messages with the payload', async () => {
    const payload: SendMessagePayload = {
      conversationId: 'c1',
      ownerId: 'u1',
      storeId: 's1',
      content: 'Hola',
    };
    vi.mocked(apiClient.post).mockResolvedValue({ data: { data: { id: 'm1' }, succeeded: true } });

    await messagesHttpService.sendMessage(payload);

    expect(apiClient.post).toHaveBeenCalledWith('/v1/messages', payload);
  });

  it('sendMessage omits the config on a default (foreground) send', async () => {
    const payload: SendMessagePayload = {
      conversationId: 'c1',
      ownerId: 'u1',
      storeId: 's1',
      content: 'Hola',
    };
    vi.mocked(apiClient.post).mockResolvedValue({ data: { data: { id: 'm1' }, succeeded: true } });

    await messagesHttpService.sendMessage(payload);

    // Exactly one config-less argument pair: never a stray `undefined` config.
    expect(apiClient.post).toHaveBeenCalledWith('/v1/messages', payload);
  });

  it('markAsRead calls POST /v1/messages/{id}/read', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: { data: true, succeeded: true } });

    await messagesHttpService.markAsRead('m1');

    expect(apiClient.post).toHaveBeenCalledWith('/v1/messages/m1/read');
  });

  it('markAllAsRead calls POST /v1/messages/mark-all-read', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: { data: true, succeeded: true } });

    await messagesHttpService.markAllAsRead();

    expect(apiClient.post).toHaveBeenCalledWith('/v1/messages/mark-all-read');
  });

  // ODD T10 — a scheduled poll must not drive the global loading overlay.
  describe('background requests', () => {
    it('getConversations passes skipLoading when asked for a background fetch', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: { data: [], succeeded: true } });

      await messagesHttpService.getConversations({ background: true });

      expect(apiClient.get).toHaveBeenCalledWith('/v1/messages/conversations', {
        skipLoading: true,
      });
    });

    it('getMessages passes skipLoading when asked for a background fetch', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: { data: [], succeeded: true } });

      await messagesHttpService.getMessages('c1', { background: true });

      expect(apiClient.get).toHaveBeenCalledWith('/v1/messages/conversations/c1/messages', {
        skipLoading: true,
      });
    });

    it('markAsRead passes skipLoading as axios config, never as a body', async () => {
      vi.mocked(apiClient.post).mockResolvedValue({ data: { data: true, succeeded: true } });

      await messagesHttpService.markAsRead('m1', { background: true });

      expect(apiClient.post).toHaveBeenCalledWith('/v1/messages/m1/read', undefined, {
        skipLoading: true,
      });
    });

    it('sendMessage passes skipLoading when asked for a background send', async () => {
      const payload: SendMessagePayload = {
        conversationId: 'c1',
        ownerId: 'u1',
        storeId: 's1',
        content: 'Hola',
      };
      vi.mocked(apiClient.post).mockResolvedValue({
        data: { data: { id: 'm1' }, succeeded: true },
      });

      await messagesHttpService.sendMessage(payload, { background: true });

      expect(apiClient.post).toHaveBeenCalledWith('/v1/messages', payload, {
        skipLoading: true,
      });
    });

    it('keeps a foreground call at its original shape — no config object', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: { data: [], succeeded: true } });

      await messagesHttpService.getConversations();

      expect(apiClient.get).toHaveBeenCalledWith('/v1/messages/conversations');
    });
  });
});
