# Owner Messaging — SuperAdmin ↔ Owner Chat

## Objetivo

Sistema de mensajería 1:1 entre SuperAdmin y Owners, con una conversación por tienda. Los Owners pueden tener múltiples tiendas, cada una con su propia conversación. Persistencia en backend, sincronización offline, read receipts y soft delete por usuario.

## Decisiones de diseño confirmadas

| Aspecto | Decisión |
|---------|----------|
| Conversación | 1:1 por Owner, una conversación por tienda |
| Backend | API completa nueva + SignalR |
| Real-time | WebSockets (SignalR) |
| Tipo | Solo texto |
| Soft delete | Solo quien borra |
| Tienda | Por tienda (Owner puede tener varias) |
| Offline | Cola local + sync al reconectar |
| Read receipt | Sí, doble check |
| Inicio | Ambos pueden iniciar |
| Badge | Sí, contador de no leídos |

## Arquitectura

### Backend

**Entities:**
- `Message` — Id, ConversationId, SenderId, SenderType, RecipientId, StoreId, Content, SentAt, ReadAt, IsDeletedBySender, IsDeletedByRecipient
- `Conversation` — Id, OwnerId, StoreId, LastMessageAt, LastMessageContent

**API REST:**
- `GET /api/messages/conversations` — lista conversaciones (SuperAdmin ve todas, Owner ve las suyas)
- `GET /api/messages/conversations/{id}` — mensajes de una conversación
- `POST /api/messages` — enviar mensaje
- `POST /api/messages/{id}/read` — marcar como leído
- `POST /api/messages/mark-all-read` — marcar todos como leídos
- `DELETE /api/messages/{id}` — soft delete para el usuario actual
- `DELETE /api/messages` — soft delete todos para el usuario actual
- `POST /api/messages/broadcast` — mensaje masivo a todos los owners

**SignalR Hub:**
- Entrega instantánea de mensajes
- Read receipts en tiempo real
- Notificación de nuevos mensajes

### Frontend (React)

- **Header:** icono de mensaje con badge de no leídos
- **Owner:** panel colapsable (como el carrito) con su conversación de la tienda activa
- **SuperAdmin:** vista WhatsApp — panel izquierdo con Owners (y sus tiendas), panel derecho con el chat
- **Offline:** cola en localStorage, sync al reconectar

## Tareas

### Backend

- [x] T1: Entities + migración (Message, Conversation)
- [x] T2: API REST (endpoints de mensajes y conversaciones)
- [x] T3: SignalR Hub (real-time delivery + read receipts)
- [x] T4: Tests E2E backend (cobertura completa)

### Frontend

- [x] T5: Header icono + badge de no leídos
- [x] T6: Owner panel colapsable (conversación de tienda activa)
- [x] T7: SuperAdmin vista WhatsApp (paneles + chat) + broadcast
- [x] T8: Offline queue + sync

### Real-time (SignalR) — T9

- [ ] **T9 - Tiempo real real (SignalR end-to-end).** Hoy el "real-time" es REST + refresco por intervalo: `MessageHub` está registrado y mapeado (`Program.cs:135,201`) pero **nadie inyecta `IHubContext`** (cero usos en el repo), así que no publica nada. T3 dejó el hub como andamiaje desconectado.
  - [x] **T9.1 Backend.** Abstracción en `Application` (la capa de aplicación no debe depender de `SMCA.WebApi`): `IMessagePushService`; implementación `SignalRMessagePushService` en `WebApi` sobre `IHubContext<MessageHub>`; registro en DI; inyectar en `SendMessageCommandHandler`, `MarkAsReadCommandHandler`, `MarkAllAsReadCommandHandler` y `BroadcastMessageCommandHandler`, publicando tras persistir. **Endurecer `MessageHub`**: quitar los métodos invocables por el cliente (`SendMessageToUser`/`MarkAsReadToUser`), que hoy permiten a cualquier usuario autenticado empujar a la conversación de otro; el push es siempre del servidor. **Cerrada 2026-09-30** (commit `cfe96803`; 12 archivos): `dotnet build` 0 errores, `Application.Tests` 539/539 (5 tests nuevos del group-key). **Hallazgo:** el hub agrupaba por el claim `sub`, que `JwtProvider` **nunca emite** (emite `ClaimTypes.NameIdentifier`) — ningún cliente entraba a un grupo, así que el real-time habría fallado incluso cableado.
  - [x] **T9.2 Proxy + CSP.** **Cerrada 2026-09-30** (commit `a0392d07`): nginx **no tenía `location /hubs`** — un WebSocket caía al fallback SPA y nunca llegaba al backend, así que el hub era inalcanzable en producción. Añadido `location /hubs` → mismo upstream `api`, con headers de upgrade (map `$connection_upgrade`), HTTP/1.1 y `proxy_read_timeout 3600s`. Y `connect-src` gana `ws:`/`wss:`: `'self'` **no** resuelve a schemes WebSocket en todos los navegadores (MDN `connect-src`; w3c/webappsec-csp#7), y como el host varía por entorno y la misma imagen sirve test y prod, un scheme-source es la única opción estática. Ensanchamiento aceptado explícitamente por el owner. Tests canónicos y literal de nginx actualizados a propósito; gate de deriva verde (7/7). Sin verificar: sintaxis de nginx por contenedor (daemon apagado).
  - [ ] **T9.3 Frontend React.** Cliente `@microsoft/signalr` (MIT, gratis, self-hosted — NO Azure SignalR Service), conectar autenticado, escuchar `ReceiveMessage`/`MessageRead`, y **fallback al refresco por intervalo** cuando la conexión no esté disponible.

## Commits

_(pendiente)_

## Estado

T1–T8 cerradas. Frontend T5–T8 verdes (unit + typecheck). Transporte real-time actual: REST + refresco (mount/focus/online/intervalo).

**En curso: T9 — tiempo real real (SignalR end-to-end).** Aprobado por el owner el 2026-09-30, incluida la modificación de producción del backend. Todos los componentes son MIT y gratuitos: SignalR self-hosted (cliente `@microsoft/signalr` MIT; servidor en el shared framework de .NET). Sin Azure SignalR Service.

**Corrección de registro (2026-09-30):** T3 figuraba `[x]` pero el hub nunca se cableó — `MessageHub` existe y está mapeado (`Program.cs:201`) y no hay un solo `IHubContext` en el repo. El `[x]` describía el andamiaje, no la entrega. Además, el commit `9a80936e` dejó HEAD rojo (dos tests del registro de entidades sin actualizar; corregidos en `825bb31b`).
