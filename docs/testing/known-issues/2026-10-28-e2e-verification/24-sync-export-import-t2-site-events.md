# 24. sync-export-import-v2.spec.ts:282 — el beacon de telemetría pública rompe el invariante de "cero HTTP" del round-trip vacío

## Qué prueba el test

`sync-export-import-v2.spec.ts:282:7` — *"T2 — empty store round trip (V2-11): an empty store exports
and imports cleanly"*. Una tienda sin datos exporta un respaldo y lo importa sin errores. Igual que T1,
exige que el export no genere **ningún HTTP** salvo el tracker de uso tolerado.

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
invocada desde la línea 326.

## Evidencia

- Corrida completa del **2026-10-28**: falló los **3 intentos** (`retries: 2`).
- Artifact: `frontend-react/test-results/sync-export-import-v2-sync-cc6dd-*/error-context.md`.
- La única petición inesperada es el beacon público; no hay subida del respaldo ni llamada de producto.

## Causa raíz — CONFIRMADA

Idéntica a la ficha 23: `KNOWN_BACKGROUND_PATHS` (`sync-export-import-v2.spec.ts:86-90`) solo tolera el
tracker de uso, y el beacon `POST /api/v1/public/site/events` (telemetría pública, `SiteEventCatalog`)
se cuenta como tráfico inesperado.

## Clasificación

**Defecto del test** — allowlist obsoleta. La aplicación es correcta.

## Propuesta de solución — NO APLICADA

Agregar `/api/v1/public/site/events` a `KNOWN_BACKGROUND_PATHS`, en el mismo cambio que la ficha 23.
Requiere autorización 1 a 1 para tocar el spec.

## Aplicación y verificación

**APLICADA (2026-10-28, autorizada por el usuario).** Se agregó `/api/v1/public/site/events` a `KNOWN_BACKGROUND_PATHS` en `sync-export-import-v2.spec.ts`.

- Comando: `pnpm exec playwright test e2e/login-offline.spec.ts e2e/sync-export-import-v2.spec.ts e2e/owner-store-create.spec.ts --workers=2 --retries=0` → **17 passed**, exit 0, 2026-10-28.
- **Prueba de mutación:** con el path cambiado a `/api/v1/public/site/events-MUTATED`, T1 y T2 fallan en `sync-export-import-v2.spec.ts:93` con `zero HTTP beyond the tolerated usage tracker`; restaurado, pasan.

## Estado final

✅ **Resuelto** — 2026-10-28.
