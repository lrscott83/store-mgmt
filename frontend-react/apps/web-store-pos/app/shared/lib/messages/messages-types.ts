export interface ConversationDto {
  id: string;
  ownerId: string;
  storeId: string;
  lastMessageAt: string;
  lastMessageContent: string | null;
  unreadCount: number;
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
