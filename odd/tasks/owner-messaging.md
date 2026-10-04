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
  - [x] **T9.3 Frontend React.** **Cerrada 2026-09-30** (commit `fa1b5ed6`): `@microsoft/signalr@8.x` (MIT) en `messages-realtime-service.ts`; el shell escucha `ReceiveMessage`/`MessageRead` y refresca al instante. **El intervalo de 15s se queda como fallback a propósito** (decisión del owner): la conexión solo arranca online y un `start()` fallido se traga — sin WebSocket, upgrade bloqueado o hub caído, todo degrada a polling sin mostrar un error que el fallback ya cubre. La URL del hub se deriva del **origen** del API, no de `API_URL`: el hub vive en la raíz del host (`/hubs/messages`) y nginx proxya `/api` por path, así que `${API_URL}/hubs/messages` daría 404 como `/api/hubs/messages` (pineado por test). Los dos tests del shell mockean el módulo realtime (es aditivo; sin el mock, `block-real-http` cazaría el negotiate). Evidencia: `web-store-pos` 336/336; typecheck limpio.

### Polling incremental (T10)

- [x] **T10 — Polling en background con escalera incremental.** Hoy el chat refresca cada **15s fijos** (`REFRESH_INTERVAL_MS = 15000`) y ese refresh **dispara el overlay global de carga** — el interceptor de `api-client.ts` arranca el loading en cada request salvo `skipLoading: true` — así que el usuario ve un spinner cada 15 segundos. Eso es un bug visible, no un detalle de performance.
  - **Background.** `getConversations` / `getMessages` / `markAsRead` aceptan `{ background: true }` → `skipLoading`. Los polls programados no tocan el overlay; las acciones del usuario (abrir el panel, enviar) siguen mostrándolo. El camino por defecto debe seguir llamando a `apiClient` con **exactamente los mismos argumentos** que hoy, o los tests existentes de `messages-http-service` rompen.
  - **Escalera.** 10s → 20s → 50s → 1m40s → 3m → 5m (tope). Un poll que trae mensaje nuevo (entrada **o** salida) vuelve a 10s; si no hay nada, sube un escalón. La señal es `lastMessageAt` de las conversaciones: cambia exactamente cuando aparece un mensaje, sin falsos positivos por leer.
  - **Foreground.** `visibilitychange` → visible vuelve al escalón 0 y pollea de inmediato, por si el timer se perdió con la pestaña en background. Mientras está oculta no pollea (reagenda al tope).
  - **Envío.** Un envío exitoso reinicia la escalera a 10s.
  - **Cerrada 2026-10-01**: `messages-http-service` acepta `{ background: true }` → `skipLoading` (solo el camino background agrega el argumento, para no cambiar la forma de las llamadas que los tests pinchan); el shell pasó de `setInterval` fijo a `setTimeout` con la escalera; `visibilitychange` → visible y `window focus` re-arman en el paso 0 (el primero con poll inmediato); el envío y un `ReceiveMessage` reinician a 10s. La señal de actividad es `lastMessageAt`, nunca `unreadCount` (ese también cambia al marcar leído, y no es actividad). Evidencia: `web-store-pos` 336/336; typecheck limpio. **Cambio de comportamiento a tener presente:** un poll en background ya **no muestra toast de error** — un fallo de red en un tick programado es silencioso a propósito; antes habría sido un toast cada ciclo.

### Chat siempre visible + aviso offline + verde WhatsApp (T11)

- [x] **T11 — El icono del chat siempre visible (OwnerAdmin), aviso al encolar sin conexión, y el color de WhatsApp.** **Cerrada 2026-10-01**: se quitó el gate `GlobalConfig.USE_ONLINE_SERVICE` del navbar (`3bd432ab` lo había puesto porque el chat hacía HTTP en mount/intervalo/foco y rompía el invariante de cero peticiones de `login-offline.spec.ts` — 4/12 tests rojos). El gate se movió **dentro** del componente: el icono se monta siempre y el trabajo de red (refresh de montaje, escalera de polling, refresh al abrir el panel, SignalR) queda detrás de `isOnline`. El shell ya se auto-gateaba por rol, así que sigue siendo solo OwnerAdmin.
  - **Aviso offline**: al encolar un mensaje (sin conexión, o envío que falla por red) se muestra `MESSAGES.OFFLINE_QUEUED` — «Sin conexión. El mensaje se enviará automáticamente cuando vuelva la conexión.» Antes se encolaba en silencio.
  - **Color**: los dos iconos pasan a `#25D366` (verde WhatsApp) — el del chat en el header (`stroke="currentColor"`) y el de «Contáctanos» del footer (`fill="currentColor"`, icono + texto). `footer.test.tsx` no se rompe: pinea los atributos del SVG, no las clases, y solo prohíbe la clase dorada.
  - **Invario del badge del chat (fijado 2026-10-04):** el fondo del badge es `bg-whatsapp` **incondicional**, incluido el 0. El ícono del gadget y el fondo de su badge son el mismo verde, siempre; no hay rama atenuada ni de estado cero. El badge del carrito es la referencia de forma, no de color: pinta `bg-primary` sólido y sin variante apagada, así que no hay opacidad que replicar. **Por qué se fija:** `71ca39ff` (2026-10-02) hizo el contador siempre visible y le puso un `bg-text-muted` en el cero "para no competir con el punto rojo"; `28784381` (2026-10-03) cambió solo la rama `> 0` a `bg-whatsapp` y dejó el gris. El resultado era un badge `rgb(140 140 140)` = `--color-text-muted` (`styles.css:34`) casi siempre, porque `totalUnread` está en 0 la mayor parte de la sesión (ver "Deuda abierta"). Un `bg-text-muted` en este gadget es una regresión, no una variante. `message-shell.badge.test.tsx` lo asserte en ambos sentidos (`bg-whatsapp` presente, `bg-text-muted` ausente).
  - **Tests actualizados**: `message-shell.offline.test.tsx` pineaba el comportamiento viejo — que el chat llamara a `getConversations` **estando offline** (justo lo que el E2E prohíbe) y que **no** hubiera toast. Ahora asserte lo contrario, que es el requisito nuevo.
  - **Evidencia**: `web-store-pos` 337/337; typecheck limpio. **No ejecutado**: la E2E de Playwright (requiere backend + PostgreSQL). El mecanismo se verificó por lectura: `login-offline.spec.ts` usa `page.context().setOffline(true)` → `navigator.onLine === false` → `useOnlineStatus` false → cero HTTP del chat.

## Commits

_(pendiente)_

## Deuda abierta (2026-10-04)

- **Cerrada el 2026-10-04.** El número del badge ya no se auto-rombaba. `refresh(withMessages = true)` marcaba como leídos *todos* los mensajes entrantes sin leer como efecto secundario de **listar** el hilo, y ese hilo se monta entero dentro de una caja `max-h-64`: la mayoría nunca estuvo en pantalla. El acuse de lectura pasó a ser **por visibilidad** (`markVisibleIncomingAsRead`): solo se marcan los entrantes cuyo rect renderizado cae dentro de la caja visible, tras el paint y en cada scroll (rAF-throttled). Lo que quedó arriba sin verse sigue contando en el badge, que es justo lo que el gadget debe reportar. `receiptedRef` recuerda los ids ya enviados para que el scroll no re-POSTe, y los ids se liberan si el servidor rechaza el recibo para que no queden varados. Se eliminó de paso el `getConversations()` extra que cada mark-as-read disparaba. **Decisión del owner 2026-10-04:** la opción elegida fue "solo lo que se ve en pantalla", no "bajar a 0 al abrir" ni "no marcar nunca". Alcance: solo el gadget; sin cambios de backend — el conteo del servidor ya era correcto (`GetUnreadCountAsync` filtra por `RecipientId == currentUserId && ReadAt == null`).

## Estado

T1–T8 cerradas. Frontend T5–T8 verdes (unit + typecheck). Transporte real-time actual: REST + refresco (mount/focus/online/intervalo).

**T9 CERRADO (2026-09-30)** — tiempo real SignalR de punta a punta: `cfe96803` (push backend), `a0392d07` (proxy same-origin + CSP), `fa1b5ed6` (cliente React). Todo MIT y gratuito (SignalR self-hosted; sin Azure SignalR Service).

**Pendiente OPERATIVO, fuera del repo:** el WebSocket tiene que atravesar **HAProxy en el VPS** (`/etc/haproxy/haproxy.cfg`, no versionado). Sin soporte de upgrade y un timeout largo ahí, el hub conecta en el contenedor pero no llega al navegador. No es tocable desde este repo.

**Hueco conocido del deploy:** el `smoke_ok` de `scripts/deploy-test.sh` y `deploy-prod.sh` no puede cazar un `/hubs` mal ruteado — `/` devuelve 200 (fallback SPA) para cualquier path, así que el smoke pasa igual. No se parcheó a propósito: el smoke dispara rollback con restauración de BD y no se pudo verificar el código de estado real. Candidato a mejora deliberada.

**Corrección de registro (2026-09-30):** T3 figuraba `[x]` pero el hub nunca se cableó — `MessageHub` existe y está mapeado (`Program.cs:201`) y no hay un solo `IHubContext` en el repo. El `[x]` describía el andamiaje, no la entrega. Además, el commit `9a80936e` dejó HEAD rojo (dos tests del registro de entidades sin actualizar; corregidos en `825bb31b`).
