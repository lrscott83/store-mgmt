# 23. sync-export-import-v2.spec.ts:223 — el beacon de telemetría pública rompe el invariante de "cero HTTP" del export

## Qué prueba el test

`sync-export-import-v2.spec.ts:223:7` — *"T1 — device A exports a backup with a seeded product,
device B imports it and sees the product"*. Con dos dispositivos, exporta un respaldo con un producto
sembrado e impórtalo en el otro; el producto debe aparecer. Durante la exportación exige que **no haya
HTTP** salvo el tracker de uso tolerado: el respaldo es un archivo local, no una subida.

## Qué falla (en simple)

```
Error: device A — zero HTTP beyond the tolerated usage tracker

- Expected  - 1
+ Received  + 7

- Array []
+ Array [
+   Object {
+     "method": "POST",
+     "resourceType": "fetch",
+     "url": "http://localhost:5019/api/v1/public/site/events",
+   },
+ ]

> 90 |   expect(unexpected, `${context} — zero HTTP beyond the tolerated usage tracker`).toEqual([]);
```

La aserción revienta en el helper `expectOnlyKnownTelemetry` (`sync-export-import-v2.spec.ts:90`),
invocada desde la línea 275.

## Evidencia

- Corrida completa del **2026-10-28**: falló los **3 intentos** (`retries: 2`).
- Artifact: `frontend-react/test-results/sync-export-import-v2-sync-b7dcc-*/error-context.md`.
- La única petición inesperada es el beacon público; no hay subida del respaldo ni llamada de producto.

## Causa raíz — CONFIRMADA

El helper filtra las peticiones contra `KNOWN_BACKGROUND_PATHS`, que solo tolera el tracker de uso.
El beacon de telemetría del sitio público (`POST /api/v1/public/site/events`, `PublicSiteEventsController`
+ `SiteEventCatalog`) no está en esa lista, así que se cuenta como tráfico inesperado.

Misma causa que las fichas 10 a 21 (`login-offline`): la allowlist de HTTP de los specs offline no se
actualizó cuando se agregó la telemetría pública.

## Clasificación

**Defecto del test** — allowlist obsoleta. La aplicación hace lo que el diseño manda; el invariante que
el test protege (cero HTTP **de export/import**) sigue intacto.

## Propuesta de solución — NO APLICADA

Agregar `/api/v1/public/site/events` a `KNOWN_BACKGROUND_PATHS` (`sync-export-import-v2.spec.ts:86-90`),
igual que en las fichas 10–21. Requiere autorización 1 a 1 para tocar el spec.

## Aplicación y verificación

**APLICADA (2026-10-28, autorizada por el usuario).** Se agregó `/api/v1/public/site/events` a `KNOWN_BACKGROUND_PATHS` en `sync-export-import-v2.spec.ts`.

- Comando: `pnpm exec playwright test e2e/login-offline.spec.ts e2e/sync-export-import-v2.spec.ts e2e/owner-store-create.spec.ts --workers=2 --retries=0` → **17 passed**, exit 0, 2026-10-28.
- **Prueba de mutación:** con el path cambiado a `/api/v1/public/site/events-MUTATED`, T1 y T2 fallan en `sync-export-import-v2.spec.ts:93` con `zero HTTP beyond the tolerated usage tracker`; restaurado, pasan.

## Estado final

✅ **Resuelto** — 2026-10-28.
