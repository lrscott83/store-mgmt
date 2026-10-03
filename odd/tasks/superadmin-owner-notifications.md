# Notificaciones al SuperAdmin por registro de propietario

## Objetivo

Cuando se registra un propietario (se crea el owner **y** su tienda), el SuperAdmin debe
enterarse: una **notificación** en la campana del header, con badge, y un popup del sistema
operador si lo autorizó. No es un mensaje — es un concepto separado, explícitamente pedido así.

## Problema

Hoy el SuperAdmin se queda sin enterarse. Alguien que se registra como propietario es
información de negocio relevante (un cliente nuevo, con su tienda) y no existe ningún canal
que se la lleve. El único aviso existente es el mensaje de bienvenida al owner, que va en la
dirección contraria.

## Por qué NO se reutiliza el sistema de mensajes

`Message` es store-scoped (`StoreId` obligatorio) y vive dentro de una `Conversation` con clave
única `(OwnerId, StoreId)`. Una notificación de registro:

- no pertenece a una conversación,
- no es store-scoped (el SuperAdmin es global),
- crearía **una conversación por tienda nueva**, inundando el buzón.

Son dos conceptos distintos. Se crea uno nuevo.

## Decisiones tomadas (usuario, 2026-10-03)

| Decisión | Valor | Motivo |
| --- | --- | --- |
| Alcance del aviso | **In-app + popup del SO con la app abierta** | Sin Web Push el popup solo se dispara con una pestaña abierta. Pedir push real (VAPID + SW push + suscripción persistida) es varias veces más trabajo y exige HTTPS. |
| Destinatario | **SuperAdmin canónico** (`DataUtils.SuperAdminUser.Id`) | Es el mismo al que ya le escribe `OwnerWelcomeMessageService`. `GetSuperAdminIdAsync` del repositorio NO se usa: es un `FirstOrDefault` sin orden y puede devolver `Guid.Empty`. |
| Datos visibles | **Nombre del propietario, su teléfono, nombre de la tienda** | Requisito literal del usuario. |

## Restricciones y trampas del terreno

- **Orden de escritura (CRÍTICO).** La notificación se escribe **DESPUÉS** del
  `SaveChangesAsync` del handler: `RegisterCommand.cs:81` y `CreateOwnerCommand.cs:97`.
  `MessageRepository` llama `SaveChangesAsync` internamente por método, así que una escritura
  previa flush-earía primero y el `SaveChangesAsync` del handler devolvería `0` →
  `Register.FailedToSave` en **todos** los registros. Esta trampa ya mordió a este código.
- **Dos puntos de entrada, no uno.** `RegisterCommandHandler` (autoregistro público) y
  `CreateOwnerCommandHandler` (Gestor/SuperAdmin). La notificación se emite desde **ambos**, o
  los owners creados por Gestor quedan sin avisar.
- **El teléfono NO está en el `Owner` devuelto.** Vive en `RegisterCommand.CellPhone` /
  `CreateOwnerCommand.Cellphone`. Se toma del comando.
- **El Outbox está muerto**: `Infrastructure/DependencyInjection.cs:39` tiene el
  `AddInterceptors(...)` comentado. No hay dispatcher. No se diseña contra él.
- **E2E bloquea service workers** (`playwright.config.ts:131`): cualquier E2E de notificaciones
  lo hereda. La Notification API tampoco es testeable en Playwright de forma fiable → la
  cobertura de la parte de permiso va en test unitario con la API simulada.

## Alcance

**Entra:**
- Entidad `Notification` + migración EF (la migración es la fuente; el `.sql` se genera).
- Endpoint de listado para SuperAdmin + endpoint de marcar leída.
- Emisión en los dos handlers de registro, con el patrón try/catch-and-log de
  `OwnerWelcomeMessageService` (un write de cortesía nunca debe convertir un registro exitoso
  en un 500).
- `NotificationShell` en el header: campana, badge (0 por defecto), popover con la lista.
- Permiso del navegador (`Notification.requestPermission()`), pedido una sola vez.
- i18n es/en.

**No entra (fuera de alcance):**
- Web Push real / VAPID / service worker de push.
- Borrado de notificaciones.
- Notificaciones para otros roles o para otros eventos.
- Realtime push por SignalR (ver T3).

## Tareas

### T1 — Backend: entidad, migración y consulta
- [ ] `Notification` en `Domain/Entities/Notifications/` con `OwnerName`, `OwnerCellPhone`,
      `StoreName`, `CreatedAt`, `ReadAt` (nullable).
- [ ] Configuración EF + `DbSet` + **migración** (la migración es la fuente de verdad).
- [ ] `INotificationRepository` + impl (listar, no leídas, marcar leída).
- [ ] Query de listado con DTO (nombre owner, teléfono, tienda, fecha, leída/no) + unread count.
- [ ] `NotificationsController` gateado a SuperAdmin, alineado con el gate de
      `MessagesController`/`superAdminLoader`.

### T2 — Backend: emisión en el registro
- [ ] `OwnerRegistrationNotificationService` (misma forma que `OwnerWelcomeMessageService`:
      try/catch, log, nunca propaga).
- [ ] Emitir en `RegisterCommandHandler` **después** del save.
- [ ] Emitir en `CreateOwnerCommandHandler` **después** del save.
- [ ] Destinatario `DataUtils.SuperAdminUser.Id`; teléfono desde el comando.

### T3 — Backend: entrega al cliente
- [ ] **Decisión: escalera de polling adaptativa**, no un hub nuevo. Se replica el patrón ya
      establecido en `MessageShell` (`setTimeout` en cascada, no `setInterval`; pausa offline y
      con la pestaña oculta; re-arma en `visibilitychange`/`focus`). Se documenta el porqué de
      no abrir un hub nuevo: el Concepto es nuevo y un hub adicional agranda la superficie sin
      que el requisito la pida.

### T4 — Frontend: servicio, permiso y campana
- [ ] `notifications-http-service` (listar con `background`, marcar leída).
- [ ] Hook de permiso: feature-detect, SSR-safe, pide una sola vez, no vuelve a preguntar si
      la respuesta es `denied`.
- [ ] `NotificationShell`: auto-gateado con `isSuperAdmin` (patrón `MessageShell`: se monta
      siempre y hace `return null` si el rol no aplica, con la red gateada adentro).
- [ ] Badge con **0 por defecto** (patrón `MessageShell`: siempre renderizado, atenuado en 0,
      cap `99+`).
- [ ] Popover con los tres datos pedidos + "marcar todas como leídas".
- [ ] Disparar el popup del SO cuando llega una nueva y el permiso está concedido.
- [ ] Montar en `navbar.tsx` junto a `MessageShell`.
- [ ] i18n.

### T5 — Pruebas
- [ ] Unitarios backend del servicio de emisión (incluye el caso "no rompe el registro si falla").
- [ ] E2E backend **nuevo** (agregar E2E nuevo está permitido): registro produce notificación
      con los tres datos.
- [ ] Unitarios frontend: badge en 0, lista, auto-gateado SuperAdmin, permiso concedido /
      denegado / no soportado, popup disparado.
- [ ] Verificación de no-regresión de la suite completa.

## Criterios de aceptación

1. Registrar un owner (autoregistro y por Gestor) deja una notificación con nombre del owner,
   teléfono y nombre de la tienda.
2. La campana solo aparece para SuperAdmin.
3. El badge arranca en **0**.
4. Con el permiso concedido y la app abierta, llega popup del sistema con esos datos.
5. Sin permiso, o denegado, o navegador sin soporte: **no falla nada**, solo el aviso in-app.
6. Un fallo al escribir la notificación **no** convierte un registro exitoso en error.

## Progresión

_(se completa por tarea, con evidencia observada)_

## Riesgo / presupuesto de entrega

El pronóstico supera las ~400 líneas authored. La estrategia de entrega (un PR o cadena de PRs)
la decide el usuario antes de abrir cualquier PR — **no está decidida todavía**.