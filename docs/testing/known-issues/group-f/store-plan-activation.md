# Test E2E `store-plan-activation` — Grupo F (flaky recurrente)

> Entrada autocontenida. **Fuente:** `docs/testing/known-issues.md` → Corrida completa del 2026-09-25 — verificación de estabilidad. Los tests E2E existentes no se tocan sin autorización explícita del usuario (regla innegociable del proyecto).

## Qué prueba

Que un OwnerAdmin cambia el plan de su tienda por el camino correcto — **un solo POST `/v1/stores/{id}/change-plan` con body `{ storePlanId }`, nunca el PUT viejo con `moduleIds`** (regresión T7.1) — y que el plan queda activo y reflejado en la UI. Es el test de la línea 63 del spec (`store-plan-activation.spec.ts`); el segundo test del spec (fallo de red, línea 247) **no** ha sido flaky.

## Dónde y cuándo falló (corridas del 2026-09-25)

| Corrida | Workers | Resultado del test        |
| ------- | ------- | ------------------------- |
| 2       | 4       | Flaky — pasó al reintento |
| 3       | 3       | Flaky — pasó al reintento |

Es el **único** test flaky en dos corridas consecutivas. En solitario no se ha visto fallar (no es determinista).

## Cómo verificar primero (en este orden, sin asumir nada)

1. **En solitario:** `cd frontend-react && pnpm exec playwright test e2e/store-plan-activation.spec.ts --workers=1` → debe pasar (confirma que no es determinista).
2. **BD limpia fuera de corridas:** `psql -h localhost -p 5432 -U postgres -d smca_test -c "SELECT \"Login\" FROM \"User\" WHERE \"Login\" LIKE 'e2e-%';"` → vacía (el `globalTeardown` borra las filas `e2e-*`; el log de teardown de cada corrida lo confirma).
3. **Backend correcto:** `:5019` con `smca_test` (línea `[E2E Guard] ConnectionStrings:Application -> Database=smca_test` del log del backend).
4. **En la próxima corrida completa:** observar si el fallo repite con el MISMO modo de abajo (precondición nula) y anotar qué otros tests de la persona `owner-admin` corrían en paralelo en ese momento.

## Modo de fallo (literal del log, idéntico en las corridas 2 y 3)

El **fixture de precondición aborta ANTES de que el test haga nada**:

```
Error: store-fixture: degradeStoreToFreePlan(<storeId>) precondition mismatch —
expected paymentStartDate to remain non-null after degrading to the free plan
(the Store row is untouched by the direct-DB seed), observed null.
S2-02 depends on this staying non-null.
    at support\store-fixture.ts:155
    at store-plan-activation.spec.ts:85
```

Es decir: la fila de la tienda de la persona llegó con `PaymentStartDate = NULL` cuando el fixture esperaba no-nulo.

## Qué NO es

- **No es timing de render ni contención de red**: el fallo es un estado de BD ya presente al arrancar, no un timeout de UI.
- **No es rate-limit**: cero 429 en las tres corridas.
- **No es determinista**: pasa al reintento y en solitario.

## Hipótesis (por confirmar — ventana de solapamiento)

`owner-admin` es persona **compartida**: varios specs la usan en workers paralelos. `store-plan-lock-regression.spec.ts` —el otro spec de plan que la usa— siembra la fecha **directo en BD** con `setPaymentStartDateDirect()`: `UPDATE "Store" SET "PaymentStartDate" = NULL` (mitad 1 "legacy" de su matriz, `store-plan-lock-regression.spec.ts:76-90`) y después la restaura. Es la única escritura conocida de `NULL` sobre esa columna alcanzable por los specs.

Si ese UPDATE cae en la ventana entre el arranque de `store-plan-activation` y su `degradeStoreToFreePlan`, la precondición encuentra la fecha ya nula → aborta → reintento (ya con la fecha restaurada por el otro test) pasa. Explica por qué es flaky solo bajo paralelismo y por qué el reintento siempre pasa.

**Para confirmar:** correr en paralelo solo los dos specs (`pnpm exec playwright test e2e/store-plan-activation.spec.ts e2e/store-plan-lock-regression.spec.ts --workers=2`) varias veces y ver si el modo se reproduce; o correlacionar en el log de la próxima corrida completa qué test corría simultáneo.

## Propuesta de solución (una vez confirmada; requiere permiso — test E2E)

- **Opción A:** que `store-plan-lock-regression` use una **persona privada** minteada para sí (patrón `mintWholesaleSuperiorOwner` de `support/store-wholesale-fixture.ts`) — elimina el solapamiento de raíz; costo: 1 login más por corrida.
- **Opción B:** que `degradeStoreToFreePlan` **siembre él mismo** la fecha no-nula antes de verificarla (en vez de asumirla) — 1 línea de fixture, cero cambios de app, no elimina el solapamiento pero lo hace irrelevante.

Cero cambios en la app en ambas opciones. No tocar nada hasta confirmar la ventana.

## Estado

⏸ **Hipótesis por confirmar** — el test y el fixture quedan intocables hasta confirmar la ventana de solapamiento.

- _Actualizado: 2026-09-25._
