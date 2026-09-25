# Test E2E `store-create-security` (ruta de creación = edición) — Grupo G (flaky en corridas completas)

> Entrada autocontenida. **Fuente:** `docs/testing/known-issues.md` → Flaky recurrentes de las corridas completas del 2026-09-25. Los tests E2E existentes no se tocan sin autorización explícita del usuario (regla innegociable del proyecto).

## Qué prueba

Que la ruta "crear tienda" **no crea nada**: un dueño que entra a `/management/stores/create` ve el formulario de edición de su propia tienda y guarda con PUT (actualización), nunca un POST de creación. Es una prueba de seguridad de rutas (S2-03).

## Qué pasa

Falló en **2 de las 5 corridas completas** del 2026-09-25 (corridas 1 y 5) y **pasó al reintento** siempre. En solitario nunca falló.

**El problema en simple (medido en los logs):** en la corrida 1 el test murió **preparando la sesión** — el mensaje exacto es `Test timeout of 120000ms exceeded while setting up "signedInPage"` (se agotaron los 120 s del test mientras el mint de la persona hacia registro + login; la última espera visible era la navegación del login del usuario de tienda). Las aserciones de seguridad (ruta, formulario, verbo PUT) nunca fallaron por sí mismas.

## Causa probable

Contención del arranque, no un defecto de seguridad ni del test: el modo de fallo observado es siempre "se acabó el tiempo preparando la sesión", nunca una aserción incumplida.

## Tiempos que usa

- Preparación de la sesión (`signedInPage` — mint de persona compartida): corre **dentro del presupuesto de 120 s** del test (`describe.configure({ timeout: 120_000 })`); no tiene reloj aparte.
- Esperas internas del mint (registro, login, navegaciones): **30 s** cada una (default de Playwright; ninguna venció sola — venció la suma).
- Reintento: 2 (config); pasó al primero en ambas corridas.

## Cómo verificarlo

1. Correrlo solo: `pnpm exec playwright test e2e/store-create-security.spec.ts --workers=1` → debe pasar.
2. En la próxima corrida completa, confirmar que si falla, sigue siendo en la preparación ("while setting up \"signedInPage\"") y el reintento pasa.

## Propuesta de solución (si se confirma)

Más presupuesto para este test (120 → 180 s, como ya usa `auth-me-session-rejection`) o menos workers. Es cambio de test E2E y requiere tu permiso explícito; no requiere cambios en la app.

## Estado

⏸ **En observación** — el reintento lo absorbe; se sigue en la próxima corrida completa.

- _Actualizado: 2026-09-25._
