import type { BaseResponseModel } from '@store-mgmt/domain';
import { apiClient } from '~/shared/lib/http/api-client';
import type { NotificationsListDto } from './notifications-types';

/**
 * Per-call knobs. Mirrors `MessagesRequestOptions`: the bell refreshes on a
 * timer, and a global loading overlay flashing on every cycle is the exact bug
 * the background flag exists to prevent.
 */
export interface NotificationsRequestOptions {
  background?: boolean;
}

/** Axios config that turns the global loading overlay off. */
const SKIP_LOADING = { skipLoading: true };

export const notificationsHttpService = {
  async getNotifications(
    options?: NotificationsRequestOptions,
  ): Promise<BaseResponseModel<NotificationsListDto>> {
    const url = '/v1/notifications';
    const response = options?.background
      ? await apiClient.get<BaseResponseModel<NotificationsListDto>>(url, SKIP_LOADING)
      : await apiClient.get<BaseResponseModel<NotificationsListDto>>(url);
    return response.data;
  },

  async markAsRead(
    notificationId: string,
    options?: NotificationsRequestOptions,
  ): Promise<BaseResponseModel<boolean>> {
    const url = `/v1/notifications/${notificationId}/read`;
    const response = options?.background
      ? await apiClient.post<BaseResponseModel<boolean>>(url, undefined, SKIP_LOADING)
      : await apiClient.post<BaseResponseModel<boolean>>(url);
    return response.data;
  },

  async markAllAsRead(): Promise<BaseResponseModel<boolean>> {
    const response = await apiClient.post<BaseResponseModel<boolean>>('/v1/notifications/mark-all-read');
    return response.data;
  },
};