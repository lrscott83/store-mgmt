export interface ConversationDto {
  id: string;
  ownerId: string;
  storeId: string;
  lastMessageAt: string;
  lastMessageContent: string | null;
  unreadCount: number;
  /**
   * When the OWNER last wrote, `null`/absent when they never have. Unlike
   * `lastMessageAt` this does not move when the SuperAdmin replies, so it is the
   * honest "who is waiting on me" signal for the inbox ordering. Optional so
   * cached/partial payloads and test fixtures without it remain valid.
   */
  lastOwnerMessageAt?: string | null;
}

export interface MessageDto {
  id: string;
  conversationId: string;
  senderId: string;
  senderType: number;
  recipientId: string;
  storeId: string;
  content: string;
  sentAt: string;
  readAt: string | null;
}

export interface SendMessagePayload {
  conversationId: string;
  ownerId: string;
  storeId: string;
  content: string;
}
