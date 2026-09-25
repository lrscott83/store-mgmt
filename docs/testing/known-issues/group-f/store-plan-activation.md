# Test E2E `store-plan-activation` — Grupo F (flaky en corridas completas)

> Entrada autocontenida. **Fuente:** `docs/testing/known-issues.md` → Corrida completa del 2026-09-25. Los tests E2E existentes no se tocan sin autorización explícita del usuario (regla innegociable del proyecto).

## Qué prueba

Que el dueño cambia el plan de su tienda por el camino correcto (el botón del diálogo hace un POST de cambio de plan, nunca una edición directa) y que la pantalla refleja el plan nuevo.

## Qué pasaba

Falló en **tres corridas completas seguidas** (4, 3 y 4 workers) y **pasó al reintento** cada vez. En solitario nunca falló.

**El problema en simple:** antes de empezar, el test pone su tienda en plan Gratis y comprueba que la fecha de inicio de pago sigue puesta. En esas corridas, al arrancar, la fecha **ya estaba borrada** en la base de datos, así que el test abortó antes de hacer nada. Al reintentarlo, pasaba.

## Causa raíz (confirmada con la corrida de confirmación)

Otro test, **`roster-export`**, borra la fecha de pago de la tienda compartida directamente en la base de datos (para probar el roster sin fecha) y **no la restaura**. Como la suite corre los tests en orden alfabético, `roster-export` siempre termina **antes** de que `store-plan-activation` arranque — por eso el fallo se repitió en todas las corridas completas.

Nota honesta: la primera hipótesi (el solapamiento con `store-plan-lock-regression`) quedó **refutada** — el fallo se repitió en la corrida de confirmación aunque ese test ya usaba su propia tienda. La búsqueda del escritor real encontró a `roster-export`.

## Solución aplicada (2026-09-25, con autorización del usuario)

`store-plan-activation` ahora usa **su propia tienda**: cada test crea su usuario y abre su sesión (en un contexto desechable) y trabaja sobre esa tienda exclusiva. Nadie más toca esa fila, así que da igual lo que otros tests hagan con la tienda compartida. Verificado en solitario: **2/2 en verde** contra el backend real (`:5019`, BD `smca_test`). `store-plan-lock-regression` conserva también su tienda privada (cinturón extra).

## Cómo verificarlo

1. Correrlo solo: `pnpm exec playwright test e2e/store-plan-activation.spec.ts` → pasa (ya verificado).
2. En la próxima **corrida completa**, confirmar que ya no aparece el mensaje "expected paymentStartDate to remain non-null ... observed null".

## Estado

🔶 **Fix aplicado — pendiente de confirmar en la próxima corrida completa.**

- _Actualizado: 2026-09-25._
