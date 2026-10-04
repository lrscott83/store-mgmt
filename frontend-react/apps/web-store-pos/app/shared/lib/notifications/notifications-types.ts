/**
 * Wire shapes of the SuperAdmin's bell, read from the backend:
 * `Application/Features/Notifications/Queries/GetNotifications/GetNotificationsQuery.cs`
 * (`NotificationsListDto` / `NotificationDto`) behind `NotificationsController`.
 *
 * `isRead` is shipped as an explicit boolean by the backend (not a nullable
 * `readAt`), so the client never has to reimplement the null-check.
 */
export interface NotificationDto {
  id: string;
  ownerName: string;
  ownerCellPhone: string;
  storeName: string;
  createdAt: string;
  isRead: boolean;
  readAt: string | null;
}

export interface NotificationsListDto {
  items: readonly NotificationDto[];
  unreadCount: number;
}