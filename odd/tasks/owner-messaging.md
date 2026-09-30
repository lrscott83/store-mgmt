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

## Commits

_(pendiente)_

## Estado

Frontend T5–T8 completos y verdes (unit + typecheck). Transporte real-time: REST + refresco (mount/focus/online/intervalo) — SignalR queda como mejora posterior (requiere dependencia nueva + CSP + cablear el hub del backend, que hoy no publica nada).
