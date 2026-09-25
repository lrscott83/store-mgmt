# Test E2E `store-plan-activation` — Grupo F (flaky en corridas completas)

> Entrada autocontenida. **Fuente:** `docs/testing/known-issues.md` → Corrida completa del 2026-09-25. Los tests E2E existentes no se tocan sin autorización explícita del usuario (regla innegociable del proyecto).

## Qué prueba

Que el dueño cambia el plan de su tienda por el camino correcto (el botón del diálogo hace un POST de cambio de plan, nunca una edición directa) y que la pantalla refleja el plan nuevo.

## Qué pasaba

En las corridas completas del 2026-09-25 falló 2 veces (corridas con 4 y con 3 workers) y **pasó al reintento**. En solitario nunca se le había visto fallar.

**El problema en simple:** antes de empezar, el test deja su tienda en plan Gratis y comprueba que la fecha de inicio de pago sigue puesta. En esas dos corridas, cuando el test arrancó, la fecha **ya estaba borrada** en la base de datos, así que el test abortó antes de hacer nada. Al reintentarlo la fecha ya estaba bien y pasó.

## Causa probable

Otro test (`store-plan-lock-regression`) usa **la misma tienda compartida** y, como parte de su prueba, borra y restaura esa fecha directamente en la base de datos. La suite corre varios tests a la vez: si el borrado del uno cae justo cuando el otro revisa su fecha, el segundo aborta. Es la única explicación que encaja con todo lo observado: solo falla en la suite completa y el reintento siempre pasa.

## Solución aplicada (2026-09-25, con autorización del usuario)

`store-plan-lock-regression` ahora usa **su propia tienda de prueba** (se registra y entra con su propio usuario en vez de la compartida). Así nadie más toca esa fila y el solapamiento desaparece de raíz. Verificado: la regresión convertida pasa en solitario, y `store-plan-activation` **no se tocó** (sigue igual).

## Cómo verificarlo

1. Correrlo solo: `pnpm exec playwright test e2e/store-plan-activation.spec.ts` → debe pasar.
2. En la próxima **corrida completa**, confirmar que ya no vuelve a abortar con el mensaje de precondición ("expected paymentStartDate to remain non-null ... observed null").

## Estado

🔶 **Fix aplicado — pendiente de confirmar en la próxima corrida completa.**

- _Actualizado: 2026-09-25._
