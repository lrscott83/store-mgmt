import type { BaseResponseModel } from '@store-mgmt/domain';
import { apiClient } from '~/shared/lib/http/api-client';
import type { ConversationDto, MessageDto, SendMessagePayload } from './messages-types';

/**
 * Per-call knobs.
 */
export interface MessagesRequestOptions {
  /**
   * A background poll must not drive the global loading overlay. The chat
   * refreshes on a timer, and flashing the overlay on every cycle is a visible
   * bug — this is exactly what it exists to fix (ODD T10). Maps to api-client's
   * `skipLoading`, the same opt-out the store-usage tracker's telemetry uses.
   *
   * A user-initiated call (open the panel, send) leaves it unset on purpose, so
   * its feedback is kept.
   */
  background?: boolean;
}

/** Axios config that turns the global loading overlay off. */
const SKIP_LOADING = { skipLoading: true };

export const messagesHttpService = {
  async getConversations(
    options?: MessagesRequestOptions,
  ): Promise<BaseResponseModel<ConversationDto[]>> {
    const url = '/v1/messages/conversations';
    // The non-background branch keeps passing exactly the arguments it always
    // has: the existing assertions pin `get(url)` with no config object.
    const response = options?.background
      ? await apiClient.get<BaseResponseModel<ConversationDto[]>>(url, SKIP_LOADING)
      : await apiClient.get<BaseResponseModel<ConversationDto[]>>(url);
    return response.data;
  },

  async getMessages(
    conversationId: string,
    options?: MessagesRequestOptions,
  ): Promise<BaseResponseModel<MessageDto[]>> {
    const url = `/v1/messages/conversations/${conversationId}/messages`;
    const response = options?.background
      ? await apiClient.get<BaseResponseModel<MessageDto[]>>(url, SKIP_LOADING)
      : await apiClient.get<BaseResponseModel<MessageDto[]>>(url);
    return response.data;
  },

  async sendMessage(payload: SendMessagePayload): Promise<BaseResponseModel<MessageDto>> {
    const response = await apiClient.post<BaseResponseModel<MessageDto>>('/v1/messages', payload);
    return response.data;
  },

  async markAsRead(
    messageId: string,
    options?: MessagesRequestOptions,
  ): Promise<BaseResponseModel<boolean>> {
    const url = `/v1/messages/${messageId}/read`;
    // `undefined` body + config: axios' post(url, data, config) shape. The
    // non-background branch stays `post(url)` — one argument, as pinned.
    const response = options?.background
      ? await apiClient.post<BaseResponseModel<boolean>>(url, undefined, SKIP_LOADING)
      : await apiClient.post<BaseResponseModel<boolean>>(url);
    return response.data;
  },

  async markAllAsRead(): Promise<BaseResponseModel<boolean>> {
    const response = await apiClient.post<BaseResponseModel<boolean>>('/v1/messages/mark-all-read');
    return response.data;
  },

  async broadcastMessage(content: string): Promise<BaseResponseModel<boolean>> {
    const response = await apiClient.post<BaseResponseModel<boolean>>('/v1/messages/broadcast', {
      content,
    });
    return response.data;
  },
};
