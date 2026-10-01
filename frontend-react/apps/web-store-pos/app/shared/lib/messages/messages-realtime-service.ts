import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr';
import type { HubConnection } from '@microsoft/signalr';
import { StorageService } from '~/shared/lib/auth/storage-service';
import type { MessageDto } from './messages-types';

/**
 * owner-messaging (ODD T9.3) — the client half of the SignalR push wired in T9.1.
 *
 * Real-time is an ENHANCEMENT, never a requirement: the header keeps its
 * interval refresh as the fallback, so this connection is allowed to fail. A
 * browser without WebSocket support, a blocked upgrade or a hub that is down all
 * degrade to polling silently — that is the intended behaviour, not a bug.
 */

/** `Program.cs` maps the hub at /hubs/messages (MapHub<MessageHub>). */
const HUB_PATH = '/hubs/messages';

/** Server event names — must match `SignalRMessagePushService`. */
export const RECEIVE_MESSAGE_EVENT = 'ReceiveMessage';
export const MESSAGE_READ_EVENT = 'MessageRead';

/** Payload of `MessageRead` — a read receipt for one message. */
export interface MessageReadEvent {
  conversationId: string;
  messageId: string;
}

/**
 * Resolves the hub URL from the API base api-client uses ('/api' in production,
 * same-origin; 'http://host:5019/api' in dev).
 *
 * The hub is mounted at the API HOST's root, NOT under the API path prefix:
 * nginx proxies `location /hubs` to the same backend that serves `location /api`,
 * and the backend maps the hub at `/hubs/messages`. So the URL is
 * `API origin + /hubs/messages` — never `API_URL + /hubs/messages`, which would
 * produce `/api/hubs/messages` and 404.
 *
 * An absent or unparseable API_URL falls back to the same-origin path, so a
 * broken value can never take the header down.
 */
export function resolveMessagesHubUrl(apiUrl: string | undefined, pageOrigin: string): string {
  if (!apiUrl) return HUB_PATH;
  try {
    return `${new URL(apiUrl, pageOrigin).origin}${HUB_PATH}`;
  } catch {
    return HUB_PATH;
  }
}

/**
 * Builds the hub connection.
 *
 * The token is read lazily on every (re)connect, exactly like the axios
 * interceptor does, so a rotated token is picked up by the next attempt. The
 * browser cannot set an `Authorization` header on the WebSocket handshake, so
 * SignalR appends it as `?access_token=`; the backend accepts that ONLY on
 * `/hubs` (ServiceExtensions.OnMessageReceived), leaving REST untouched.
 */
export function createMessagesRealtimeConnection(url: string): HubConnection {
  return new HubConnectionBuilder()
    .withUrl(url, {
      accessTokenFactory: () => StorageService.getTokenFromLocalStorage() ?? '',
    })
    .withAutomaticReconnect()
    .configureLogging(LogLevel.None)
    .build();
}

/** Shapes the server's `ReceiveMessage` payload into the panel's `MessageDto`. */
export type RealtimeMessageHandler = (message: MessageDto) => void;
