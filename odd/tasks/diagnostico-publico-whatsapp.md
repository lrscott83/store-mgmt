# Diagnóstico: público, sin falsos errores y envío por WhatsApp

Branch: `test` (frontend-react/apps/web-store-pos) · Delivery: ask-on-risk · Runner: `pnpm test` (vitest) · Typecheck: `pnpm typecheck`

## Specs

S1 — `/diagnostics` must be viewable without authentication.
- The route is not behind `authLoader`/`adminLoader`: it mounts `shared/components/public-app-layout.tsx` (same chrome, no auth gate), and the page module exports no guarded `clientLoader`.
- The login screen shows a discreet link labelled `DIAGNOSTICS.TITLE` ("Diagnóstico") pointing to `/diagnostics`.
- The existing menu entry (`MENU.DIAGNOSTICS`, SuperAdmin/OwnerAdmin) stays unchanged.
- The authenticated-session redirect invariant is untouched: a valid session never lands on `/login` because of this change.

S2 — The diagnostic buffer stores real errors and only real errors.
- Any catch that today swallows a real, non-HTTP failure without any signal writes one `logClientError({ level: 'error' })` entry carrying the error name/message and a `context` identifying the site.
- Expected environment/capability failures stay silent: clipboard unavailable, `navigator.share` cancelled by the user, Notification API unsupported/denied, `localStorage` unavailable in SSR/private mode, best-effort cleanup, and any path whose failure is already reported by the HTTP interceptor (`api-client` logs every axios failure).
- Failing to sync store usage telemetry is NOT an error: the `store-daily-usage` POST is sent with `skipDiagnostics: true` and produces no diagnostic entry.
- All other HTTP failures keep being recorded by the interceptor (no duplicate entry from the caller's catch).

S3 — Send the whole diagnostic to WhatsApp 5352432968.
- A button (`DIAGNOSTICS.SEND_WHATSAPP`) downloads the same JSON artifact as `Descargar` and opens `https://wa.me/5352432968` in a new tab, so the owner can attach the full file to the chat.
- The full payload is never truncated: no JSON in the URL.
- Share/download/copy/clear keep working exactly as today (the existing E2E clicks `Descargar`).

S4 — No regression.
- Existing diagnostics unit tests, the Playwright `diagnostics.spec.ts` flow, typecheck and lint stay green.

## Tasks

| ID | Specs | Route | Status |
| --- | --- | --- | --- |
| T1 | S1 | inline | done — `routes.ts` public group + no `clientLoader`; login link |
| T2 | S2 (telemetry) | inline | done — `skipDiagnostics` flag + usage POST |
| T3 | S2 (audit) | inline | done — 6 silent sites instrumented |
| T4 | S3 | inline | done — `handleSendWhatsApp` |
| T5 | S4 | inline | done — 5763 passed / 6 skipped, typecheck + lint clean |

## Log

L1 (user, verbatim): "El diagnostic debe poder mostrarse aunque no se este autenticado. Seguiremos con esa politica de diagnostic para almacenear todos los errores que sean errores porque el no poder sincronizar los usages por ejemplo no es un error. Toda excepcion y error debe almacenarse ahi. Ademas permitir enviar por whatsapp todo el diagnostic para mi numero. Si tienes alguna duda me preguntas para que no asumas nada de nada,"

L2 (user answers): alcance de la auditoría = completa; número = 5352432968; envío = descargar JSON + abrir chat del número; acceso sin sesión = ruta pública + enlace en el login; catches que registran = solo los silenciosos (cuerpo vacío o fallback silencioso), sin duplicar los que ya muestran un mensaje al usuario.

L3 (decision): la auditoría instrumenta solo fallos no-HTTP que hoy no dejan rastro y que son señales reales de defecto. Excluidos a propósito (documentados en el código donde aplica): `navigator.share` cancelado, clipboard, Notification API, SSR/localStorage ausente, limpieza best-effort, y cualquier `catch` que envuelve una llamada axios (el interceptor ya la registra). Los merges del sincronizador devuelven un `error` estructurado que la UI de sync ya muestra: no son silenciosos y no se duplican.

L4 (decision): el fallo del POST de telemetría de usages se silencia con un flag explícito `skipDiagnostics` en la config de axios, no con una heurística por URL ni por `skipLoading`.

L5 (evidencia T1-T4): RED observado antes de implementar (11 fallos en 5 archivos: membership de rutas, enlace del login, `clientLoader` público, flag `skipDiagnostics`, número de WhatsApp). Después: 94/94 en los archivos focales y 5763 passed / 6 skipped en la suite completa; `pnpm typecheck` y `pnpm lint` limpios.

L6 (auditoría ejecutada — sitios instrumentados): `entity-migration.ts` (por clave), `offline-auth-service.ts` (migración tras login offline), `auth-store.ts` (migración de tasas retiradas), `decryption-failure-policy.ts` (oferta de archivo de recuperación), `cart-shell.tsx` (createOrder lanzó), `message-shell.tsx` (cola de mensajes dañada). Todos registran `{ level: 'error' }` con contexto de sitio.

L7 (exclusiones deliberadas de la auditoría): `navigator.share` cancelado y clipboard (acción del usuario), Notification API / Notification.close (capacidad), `localStorage` en SSR o bloqueado, limpieza best-effort (`clearClientLogs`, `deleteDeviceKey`), `device-key-store` (ya registra por su cuenta), `read-store-entities` y `dek-bootstrap`/`dek-provisioning` (fallback esperado del gate de unlock; la corrupción se reporta por `decryption-failure-policy`), `roster-*` (la UI de login ya lo surface), y todos los `catch` que envuelven axios (el interceptor ya registra). Los merges del sincronizador devuelven un `error` estructurado que la UI muestra.

L8 (riesgo): T1 cambia un guard de ruta (ítem 2: guards/autorización). T2-T4: `Risk: none`.
