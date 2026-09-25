# Test E2E `store-switch-back-logout` SSR-1 (cambio a segunda tienda) — Grupo G (flaky en corridas completas)

> Entrada autocontenida. **Fuente:** `docs/testing/known-issues.md` → Flaky recurrentes de las corridas completas del 2026-09-25. Los tests E2E existentes no se tocan sin autorización explícita del usuario (regla innegociable del proyecto).

## Qué prueba

Que el dueño con MultiStores (14) cambia a una **segunda tienda** desde el conmutador del encabezado y entra en ella **sin cerrar sesión** (el "cambio de tienda" es un wrap/unwrap de sesión, nunca un logout).

## Qué pasa

Flaky en **2 de las 6 corridas completas** del 2026-09-25 (corridas 4 y 6) y **pasó al reintento** siempre. En solitario nunca falló.

**El problema en simple (medido en los logs, mismo modo en ambas):** el test se quedó sin tiempo (su presupuesto es de **180 segundos**, el mayor de la suite) mientras intentaba hacer clic en el elemento de la pantalla — la página tardó más de lo que el test puede esperar en cargar/renderear con toda la suite corriendo a la vez. Lo que el test verifica (el cambio de tienda sin logout) nunca falló por sí mismo.

## Causa probable

Contención del arranque: la página tarda más de lo normal cuando 4 workers compiten por el mismo dev server + backend + PostgreSQL. No es rate-limit (cero 429 en las seis corridas) ni un defecto de la lógica de cambio de tienda.

## Tiempos que usa

- Presupuesto del test: **180 s** (`describe.configure({ timeout: 180_000 })`).
- Preparación: dentro de ese presupuesto (persona compartida `owner-admin` + siembra directa a BD del módulo 14); no venció como paso separado — venció el total.
- La operación que se quedó sin tiempo: un `click` en la pantalla (la página no terminó de estar lista).
- Reintento: 2 (config); pasó al primero en ambas corridas.

## Cómo verificarlo

1. Correrlo solo: `pnpm exec playwright test e2e/store-switch-back-logout.spec.ts --workers=1` → debe pasar.
2. En la próxima corrida completa, confirmar que si falla, sigue siendo el mismo modo (clic sin tiempo bajo contención) y el reintento pasa.

## Propuesta de solución (si se confirma)

Mismo tratamiento que los demás flaky de contención: ya corre con el presupuesto máximo (180 s), así que la palanca operativa es **menos workers** (ya documentada en el readme). No requiere cambios en la app.

## Estado

⏸ **En observación** — el reintento lo absorbe; se sigue en la próxima corrida completa.

- _Actualizado: 2026-09-25._
