import type { BaseResponseModel } from '@store-mgmt/domain';
import { apiClient } from '~/shared/lib/http/api-client';
import type { ConversationDto, MessageDto, SendMessagePayload } from './messages-types';

export const messagesHttpService = {
  async getConversations(): Promise<BaseResponseModel<ConversationDto[]>> {
    const response =
      await apiClient.get<BaseResponseModel<ConversationDto[]>>('/v1/messages/conversations');
    return response.data;
  },

  async getMessages(conversationId: string): Promise<BaseResponseModel<MessageDto[]>> {
    const response = await apiClient.get<BaseResponseModel<MessageDto[]>>(
      `/v1/messages/conversations/${conversationId}/messages`,
    );
    return response.data;
  },

  async sendMessage(payload: SendMessagePayload): Promise<BaseResponseModel<MessageDto>> {
    const response = await apiClient.post<BaseResponseModel<MessageDto>>('/v1/messages', payload);
    return response.data;
  },

  async markAsRead(messageId: string): Promise<BaseResponseModel<boolean>> {
    const response = await apiClient.post<BaseResponseModel<boolean>>(
      `/v1/messages/${messageId}/read`,
    );
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
