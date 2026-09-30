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
});
