# Tests E2E `auth-me-session-rejection` — Grupo F (flaky en corridas completas)

> Entrada autocontenida. **Fuente:** `docs/testing/known-issues.md` → Corrida completa del 2026-09-25. Los tests E2E existentes no se tocan sin autorización explícita del usuario (regla innegociable del proyecto).

## Qué prueba

Que la app maneja bien los cierres de sesión: si el dueño se desactiva, si el token está vencido o revocado, la sesión se cierra (o se retiene sin conexión, según el caso).

## Qué pasaba

En las corridas completas del 2026-09-25 falló 2 veces (corridas con 8 y con 3 workers) y **pasó al reintento**. En solitario pasa siempre (verificado: 16/16 en verde, ~31 s).

**El problema en simple:** la suite comparte una "preparación" que crea usuario y abre sesión al arrancar. Con toda la suite corriendo a la vez, esa preparación tarda más de los 30 segundos que le pone la herramienta por defecto, se corta, y el test pasa al reintento cuando el entorno ya está caliente. Lo que el test verifica (la lógica de sesión) nunca falló.

## Causa probable

Lentitud del arranque cuando toda la suite corre a la vez (contención). No es rate-limit: en las tres corridas completas no hubo ni un solo rechazo de cuota.

## Solución aplicada (2026-09-25, con autorización del usuario)

La preparación compartida (el fixture que acuña la sesión en frío, en `valid-session-navigation.spec.ts`) ahora tiene **60 segundos en vez de los 30 por defecto** — una sola línea. Verificado en solitario: `auth-me-session-rejection` (11/11) y `valid-session-navigation` (12/12) en verde contra el backend real.

## Cómo verificarlo

1. Correrlo solo: `pnpm exec playwright test e2e/auth-me-session-rejection.spec.ts` → pasa (ya verificado).
2. En la próxima **corrida completa**, confirmar que ya no aparece el mensaje "Fixture ... timeout of 30000ms exceeded during setup".

## Estado

🔶 **Fix aplicado — pendiente de confirmar en la próxima corrida completa.**

- _Actualizado: 2026-09-25._
