# 11. login-offline.spec.ts:257 — el beacon de telemetría pública cuenta como HTTP inesperada en el login offline

## Qué prueba el test

`login-offline.spec.ts:257:7` — *"T2: destino con productos — siembra por UI, logout y 2º submit offline"*. Con productos ya sembrados desde la interfaz, cerrar sesión y volver a entrar sin conexión debe funcionar igual que el primer login, sin red.

## Qué falla (en simple)

El test recorre el login sin conexión y al final comprueba que **no haya salido ninguna petición HTTP** (o solo el tracker de uso, según el caso). Falla porque apareció una petición nueva que la lista de excepciones no conoce:

```
Error: Expected zero HTTP requests other than the known store-usage telemetry POST (T2 destino con productos), but observed 2: POST http://localhost:5019/api/v1/public/site/events (fetch).
```

La aserción que revienta es el helper login-offline.spec.ts:92 (xpectOnlyKnownTelemetry / comprobación de cero red).

## Evidencia

- Corrida completa del **2026-10-28**: 338 passed / 16 failed / 2 flaky / 1 did not run en 20.6 min, contra el backend real con perfil `http-e2e` (`:5019`, BD `smca_test` confirmada por el teardown) y el dev server propio de Playwright en `:3333`.
- Falló en **los 3 intentos** (`retries: 2` del config), así que es determinista en esta corrida.
- Artifact: `frontend-react/test-results/login-offline-login-offlin-abae0-*/error-context.md`.

## Causa raíz — CONFIRMADA

La única petición inesperada es `POST /api/v1/public/site/events` (`resourceType: fetch`): el **beacon de telemetría del sitio público** (`PublicSiteEventsController` + `SiteEventCatalog`, el mismo mecanismo que cuenta las visitas y la descarga del manual, pineado en los E2E del backend `SiteTelemetry`).

El helper del spec tolera el POST del tracker de uso, el hub `/hubs/messages` y `/api/v1/messages`, pero **no** el beacon público. No hay ninguna petición de autenticación ni de producto: el flujo offline en sí funciona y el test llega hasta la comprobación de red.

Hipótesis descartadas: no es una regresión de autenticación (la sesión y el DEK se resuelven bien); no es carga del entorno (falló también en los reintentos).

## Clasificación

**Defecto del test** — la allowlist de HTTP quedó obsoleta cuando se agregó la telemetría pública. La aplicación hace lo que el diseño del sitio público manda; el invariante que el test protege (cero HTTP **de autenticación/producto** sin conexión) sigue intacto.

## Propuesta de solución — NO APLICADA

Agregar `/api/v1/public/site/events` al conjunto tolerado del helper (`login-offline.spec.ts:92`), igual que ya se tolera el tracker de uso y el chat. Alternativa, si el producto exige "cero red cuando `navigator.onLine === false`": suprimir el beacon en ese estado. Requiere autorización 1 a 1 para tocar el spec.

## Aplicación y verificación

**APLICADA (2026-10-28, autorizada por el usuario).** En `login-offline.spec.ts`: se agregó `/api/v1/public/site/events` a `KNOWN_BACKGROUND_PATHS`; los casos T3–T7 y T9 pasaron de `anyRequest.expectNoRequests(...)` a `expectOnlyKnownTelemetry(anyRequest, ...)`; T8 filtra la allowlist antes de exigir exactamente 1 petición.

- Comando: `pnpm exec playwright test e2e/login-offline.spec.ts e2e/sync-export-import-v2.spec.ts e2e/owner-store-create.spec.ts --workers=2 --retries=0` → **17 passed**, exit 0 (backend `http-e2e` en `:5019`, BD `smca_test`), 2026-10-28.
- **Prueba de mutación:** se cambió el path tolerado a `/api/v1/public/site/events-MUTATED` y la misma corrida dio **14 failed** (los 12 de `login-offline` + T1/T2 de `sync`), cayendo en esta misma aserción; restaurado el path, vuelve a **17 passed**.

## Estado final

✅ **Resuelto** — 2026-10-28.
