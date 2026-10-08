# Notificación al SuperAdmin por creación de tienda + beep de audio

## Objetivo

Dos pedidos del usuario, en un solo cambio:

1. Cuando se crea una tienda, el SuperAdmin debe recibir una **notificación** (campana con badge),
   no un mensaje.
2. Las notificaciones deben producir un **sonido propio dentro de la app** al llegar.

## Problema

### 1. La creación de tienda no emite nada

`odd/tasks/superadmin-owner-notifications.md` (cerrada, T1–T5 ✅) construyó el sistema completo:
entidad `Notification`, migración, repositorio, `GET /v1/notifications`, campana con badge,
permiso del navegador y popup del SO.

Los **dos** puntos de emisión existentes son de *registro de propietario*:

- `RegisterCommand.cs:103`
- `CreateOwnerCommand.cs:124`

`CreateStoreCommandHandler` (`CreateStoreCommand.cs:58`) **no inyecta** el servicio de
notificaciones. Un `POST /v1/stores` exitoso no deja ninguna rastro visible para el SuperAdmin.

### 2. No existe sonido

Cero código de audio en todo `frontend-react`. Cero assets en `public/`. No hay helper, ni
llamada, ni `.mp3`.

**Corrección de una premisa del usuario:** no existe "permiso del navegador para emitir
sonidos". Lo que existe es `Notification.requestPermission()` — permiso para **mostrar** la
notificación, no para sonar. El sonido de una notificación del SO lo elige el sistema
operativo, no la web. Web Audio no pide permiso: exige un *click previo* del usuario por la
política de autoplay del navegador. Decisión del usuario 2026-10-08: **beep propio dentro de la
app** vía Web Audio.

### 2b. Bug real adyacente: un `denied` es irrecuperable

`notification-permission.ts:59-61` — `hasRequestedPermission` es de vida del módulo y la función
nunca vuelve a preguntar cuando el permiso quedó en `denied`. Un SuperAdmin que pulsó
"Bloquear" una vez queda en silencio permanente **sin ninguna UI para recuperarlo**. Es el
comportamiento correcto frente a navegadores (re-preguntar un `denied` es ruido que el navegador
rechaza), pero la falta de salida visible es un agujero: hay que poder volver a pedirlo desde la
propia campana.

## Por qué NO se reutiliza el sistema de mensajes

Igual que en la feature original, y por las mismas razones ya documentadas en
`Notification.cs:9-12`: `Message` es store-scoped y vive en una `Conversation` con clave única
`(OwnerId, StoreId)`. Una aviso de creación de tienda no pertenece a ninguna conversación y
crearía **una conversación por tienda nueva**, inundando el buzón. El usuario lo pidió
explícitamente ("no un mensaje").

## Decisiones tomadas (usuario, 2026-10-08)

| Decisión | Valor | Motivo |
| --- | --- | --- |
| Sonido | **Beep propio en la app** (Web Audio) | Web Audio no puede pedir permiso; necesita un click previo. El sonido del SO no es controlable por la web. |
| Canal | Notificación in-app existente | El sistema ya está construido y gateado a SuperAdmin. |
| Migración | **Ninguna** | Ver "Diseño" abajo. |

## Diseño: por qué NO hace falta migración

La hipótesis inicial era que había que hacer `OwnerCellPhone` nullable y generar una migración.
**No es necesario**, y por eso este cambio no toca el esquema.

`Notification.Create(ownerName, ownerCellPhone, storeName)` ya lleva exactamente los tres hechos
que un aviso de creación de tienda necesita, y `CreateStoreCommand.cs:120` ya tiene el owner
cargado **con su `User` incluido**:

```csharp
var owner = await _ownerRepository.GetOwnerIncludingUserByIdAsync(ownerId);  // :120  .Include(o => o.User)
```

- `owner.User.FullName` → `OwnerName`
- `owner.User.CellPhone` (`string?`, nullable en `User.cs:18`) → `OwnerCellPhone`
- `store.Name` → `StoreName`

`OwnerRegistrationNotification.Resolve(owner, cellPhone, storeName)`
(`OwnerRegistrationNotification.cs:26-39`) ya devuelve `null` cuando falta el teléfono, que es
exactamente el comportamiento deseado ("un aviso con teléfono vacío es peor que ningún aviso").
Se reutiliza tal cual, con su política y su mensaje.

## Trampas del terreno (CRÍTICAS)

- **NO emitir desde `ICreateStoreService`.** `CreateStoreService.CreateStoreAsync` lo llaman
  **dos** sitios: `RegisterService.cs:94` (registro de owner) y `CreateStoreCommand.cs:121`
  (`POST /v1/stores`). Emitir en el servicio haría que **cada registro de owner disparase un
  segundo aviso**. El punto de emisión es **`CreateStoreCommandHandler`**, después del save.
- **Orden de escritura.** Emitir **DESPUÉS** del `SaveChangesAsync` del handler
  (`CreateStoreCommand.cs:124`). `MessageRepository`/`NotificationRepository` hacen flush por
  método: escribir antes haría que el save del handler devuelva `0` →
  `StoreErrors.NotCreated` en **todas** las creaciones de tienda. Esta trampa ya mordió a este
  código en el registro.
- **Solo en éxito.** La expresión actual es un ternario
  (`return await SaveChangesAsync(...) > 0 ? Success : Failure`). Hay que emitir **solo** en la
  rama `Success`, nunca tras un fallo del save.
- **Un fallo al notificar nunca puede ser un 500.** El servicio ya traga y loguea sus propios
  errores (T2 de la feature original). No añadir try/catch redundante.
- **El Outbox está muerto** (`Infrastructure/DependencyInjection.cs:39`, `AddInterceptors`
  comentado). No se diseña contra él.
- **E2E bloquea service workers** (`playwright.config.ts:131`). La Notification API tampoco es
  testeable de forma fiable en Playwright → la cobertura del permiso y del beep va en test
  unitario con la API simulada.

## Alcance

**Entra:**
- Emisión en `CreateStoreCommandHandler` tras el save exitoso.
- Helper de beep (Web Audio) + asset de audio.
- Disparo del beep cuando llega una notificación nueva al SuperAdmin.
- Botón "reintentar permiso" en la campana cuando el permiso quedó en `denied`.
- Tests unitarios nuevos (backend + frontend).

**No entra:**
- Web Push / VAPID / service worker de push (sigue sin existir; con la pestaña cerrada no suena).
- Migración ni cambios en la entidad `Notification`.
- Notificaciones para otros roles o eventos.
- Cambios en `frontend/` (Angular, congelado).

## Archivos a tocar

**Backend (producción — requiere aprobación explícita del usuario por `AGENTS.md`):**
1. `backend/src/Application/Features/StoreManagement/Stores/Commands/CreateStore/CreateStoreCommand.cs`

**Frontend (`frontend-react`):**
2. `.../app/shared/lib/notifications/notification-sound.ts` *(nuevo)*
3. `.../app/shared/components/notification-shell.tsx`
4. `.../app/shared/lib/i18n/es.ts` (bloque `NOTIFICATIONS.*`)
5. `frontend-react/apps/web-store-pos/public/sounds/` *(nuevo, asset)*

## Tareas

- [ ] **T1** — Backend: inyectar el servicio y emitir tras el save exitoso.
- [ ] **T2** — Backend: test unitario nuevo (emite con los tres datos; no emite si falla el
      save; un fallo del servicio de notificación no devuelve 500).
- [ ] **T3** — Frontend: helper de beep (Web Audio, SSR-safe, sin estado global mutable
      compartido entre test y runtime, degradación silenciosa si no hay `AudioContext`).
- [ ] **T4** — Frontend: disparo del beep al llegar notificación nueva + salida para recuperar
      un `denied`.
- [ ] **T5** — Frontend: i18n + tests unitarios nuevos.

## Criterios de aceptación

1. `POST /v1/stores` exitoso deja una notificación con nombre del owner, su teléfono y el
   nombre de la tienda.
2. Un registro de owner **no** deja dos notificaciones (el punto de emisión es el handler, no
   `ICreateStoreService`).
3. Un save fallido **no** deja notificación.
4. Un fallo al escribir la notificación **no** convierte una creación de tienda exitosa en error.
5. La campana sigue siendo solo de SuperAdmin y el badge arranca en 0.
6. Con la app abierta, una notificación nueva dispara el beep.
7. Sin soporte de audio, o con la pestaña en segundo plano, **no falla nada**.
8. Si el permiso quedó en `denied`, hay una salida visible para volver a pedirlo.

## Progresión

- **T1** ✅ — `CreateStoreCommand.cs` inyecta `IOwnerRegistrationNotificationService`. El
  ternario se partió en un `return` temprano para que el aviso solo pueda emitirse en la rama
  committeada. Hechos desde `owner.User.CellPhone` (ya cargado por `GetOwnerIncludingUserByIdAsync`)
  y `store.Name`. Sin migración, sin tocar `ICreateStoreService`.
- **T2** ✅ — RED observado primero (`Expected invocation on the mock once, but was 0 times`),
  no un error de compilación. 4 casos nuevos: tres datos correctos; sin aviso si el save devuelve
  0; sin aviso si el teléfono viene vacío; un fallo de escritura no devuelve `Succeeded`.
- **T3** ✅ — `notification-sound.ts`: 880 Hz senoidal + envolvente de ganancia
  (0 → 0.12 en 10 ms → 0.0001 a 180 ms). **Sin asset binario**: sintetizado, no un `.mp3`.
  Todo acceso a `window`/`AudioContext` es lazy. Antiautoplay: intenta `resume()`, descarta el
  beep si sigue suspendido, devuelve `false`, nunca lanza. Guard de 400 ms anti doble-disparo.
- **T4** ✅ — el beep dispara en la misma rama `fresh.length > 0` que `fireSystemPopup`, después
  del early return de la línea base → nunca beep en la población inicial. Control de recuperación
  en el popover, visible **solo** con permiso `denied`, re-leyendo el permiso en cada apertura.
- **T5** ✅ — 2 archivos de test nuevos, 18 tests. 4 claves `NOTIFICATIONS.*` en `es.ts`. Sin
  `en.ts` (la app es `SUPPORTED_LOCALES = ['es']`).

### Evidencia observada

| Verificación | Resultado |
| --- | --- |
| `dotnet test Application.Tests.csproj` | 1035/1035, 0 fallos. Sin `error CS` ni `error MSB`; `testhost` matado antes de cada build |
| `pnpm vitest run` (los 2 archivos nuevos + `notification-shell.test.tsx` preexisting) | **29/29**, `Type Errors: no errors` — spot check del padre, incluye los 11 preexistentes sin regresión |
| `pnpm typecheck` | 5/5 |
| `pnpm lint` | 4/4, cero warnings |
| `pnpm lint` + `pnpm typecheck` (re-run tras el cambio de copy) | 4/4 y 5/5 |
| Frontend suite de notificaciones tras el cambio de copy | **40/40** (los 4 archivos: 2 nuevos + `notification-shell.test.tsx` + `app-layout.test.tsx` preexistentes), `Type Errors: no errors` |
| E2E backend / Playwright | **no ejecutados** (no autorizados en esta iteración) |

### Defectos detectados

1. ~~**`NOTIFICATIONS.SYSTEM_TITLE` miente.**~~ ✅ **CORREGIDO** (decisión del usuario
   2026-10-08: título neutro, sin migración). Era `'Nuevo propietario registrado'` y se dispara
   también cuando un owner **ya registrado** crea su segunda tienda. Ahora es
   `'Nueva tienda registrada'`. El body ya lleva nombre · teléfono · tienda, así que el título no
   necesita distinguir. Esto **rompió** la aserción de
   `notification-shell.test.tsx:223`, que fijaba el literal; se actualizó esa única línea
   (unitario, no E2E) con un comentario que explica el porqué. Distinguir de verdad exigiría una
   columna `Kind` + migración + script + actualizar el índice de scripts: no justificado.
2. **Owner sin celular → ningún aviso.** `OwnerRegistrationNotification.Resolve` devuelve `null`
   con el teléfono vacío. Impacto bajo: `RegisterCommand` exige `CellPhone` no-nulo, así que todo
   owner registrado tiene uno. Solo muerde a owners creados por Gestor sin teléfono. Arreglo real
   = `OwnerCellPhone` nullable + migración + script.

### Supuestos declarados por el ejecutor

- La garantía de "un aviso nunca rompe una operación ya commiteada" vive **dentro** de
  `OwnerRegistrationNotificationService.NotifyAsync` (todo el cuerpo es `try/catch`, líneas
  40-59), no en el handler. Por eso el test de "no devuelve 500" usa el servicio real sobre un
  `INotificationRepository` que lanza: un mock de la interfaz que lance probaría una garantía que
  el código no da.
- El botón de recuperación llama `Notification.requestPermission()` directo porque
  `notification-permission.ts` retorna temprano salvo `permission === 'default'` y por tanto
  **jamás** puede re-preguntar tras un `denied`. La mayoría de navegadores persisten el bloqueo
  por origen y responden `denied` otra vez sin preguntar: la UI lo reporta con un toast en vez de
  fingir que funcionó.
- `store.Name` (lo que devolvió el servicio) es lo que se notifica, no `request.Name`.

### Ruta de delegación

| Tarea | Ruta | Motivo |
| --- | --- | --- |
| T1 | delegated writer | lectura preparatoria + código de producción backend |
| T2 | delegated verifier | `dotnet test` sobre `Application.Tests` |
| T3–T5 | delegated writer | 4 archivos de frontend no triviales |

## Riesgo / presupuesto de entrega

Pronóstico por debajo de las ~400 líneas authored: T1 es un diff pequeño, T3–T5 son el grueso.
Estrategia de entrega sin decidir — la elige el usuario antes de abrir cualquier PR.