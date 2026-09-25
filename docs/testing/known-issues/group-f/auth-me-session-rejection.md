# Tests E2E `auth-me-session-rejection` — Grupo F (flaky en corridas completas)

> Entrada autocontenida. **Fuente:** `docs/testing/known-issues.md` → Corrida completa del 2026-09-25. Los tests E2E existentes no se tocan sin autorización explícita del usuario (regla innegociable del proyecto).

## Qué prueba

Que la app maneja bien los cierres de sesión: si el dueño se desactiva, si el token está vencido o revocado, la sesión se cierra (o se retiene sin conexión, según el caso). También prepara (setup) la sesión de superadmin que otros pasos usan.

## Qué pasa

En las corridas completas del 2026-09-25 falló 2 veces (corridas con 8 y con 3 workers) y **pasó al reintento**. En solitario pasa siempre (verificado: 16/16 en verde, ~31 s).

**El problema en simple:** este test necesita crear usuarios y abrir sesión al arrancar. En la suite completa hay muchos tests haciendo lo mismo a la vez y el arranque se pone lento; alguna de esas esperas se quedó sin tiempo. Al reintentarlo todo ya estaba caliente y pasó. Los fallos siempre ocurrieron en esa fase de preparación, nunca en lo que el test realmente verifica.

## Causa probable (por confirmar)

Lentitud del arranque cuando toda la suite corre a la vez (contención). No es rate-limit: en las tres corridas completas no hubo ni un solo rechazo de cuota. Y no es un defecto de la lógica de sesión: lo que el test verifica funciona bien.

## Cómo verificarlo

1. Correrlo solo: `pnpm exec playwright test e2e/auth-me-session-rejection.spec.ts` → debe pasar (ya verificado 16/16).
2. En la próxima corrida completa, confirmar que si falla, es solo en la preparación del arranque y el reintento pasa.

## Propuesta de solución (requiere permiso — test E2E)

Darle más tiempo (30 → 60 segundos) a la preparación que arranca con el test. Alternativa sin tocar tests: correr la suite con menos workers (ya documentado en el readme).

## Estado

⏸ **Por confirmar** — el test queda intocable hasta ver de nuevo el mismo patrón (fallo solo en la preparación, reintento en verde).

- _Actualizado: 2026-09-25._
