# Integración — Multipagos (módulo 16)

> Specs E2E cubiertos: `multipayments.spec.ts`, `multipayments-cart-v2.spec.ts`,
> `multipayments-currency-block.spec.ts`, `channel-rates-catalogue.spec.ts` (6 tests).
>
> **Leyenda**
>
> - ✅ **Total** — toda la afirmación es lógica de negocio y vive en servicios/repositorios/dominio:
>   se prueba sin navegador, sin render y sin backend.
> - ⚠️ **Parcial** — la lógica es probable sin navegador, pero el test además prueba algo que exige
>   render/router/red (se indica qué).
> - ❌ **No** — la afirmación depende del navegador o del backend real.
>
> **Regla del proyecto:** los specs E2E no se tocan sin autorización explícita del usuario.

| Test                                                                                                                         | Qué prueba                                                                                                                                                        | Clasificación                                                                                                                                                                                                                                         | Ya cubierto en                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `multipayments` T10.1 — el selector bloquea un cambio de moneda sin tasa y lo permite tras registrarla                       | Con una venta en CUP, elegir USD sin tasa registrada no debe cambiar nada (queda en CUP con aviso) y, tras registrar la tasa, el cambio sí procede y convierte    | ⚠️ **Parcial** — la decisión bloquear/convertir es pura (`resolveCurrencyRate` + `convertLineAmount`); **visual:** el select se queda en CUP, el aviso `CART_CURRENCY_CHANGE_ERROR`, el total en pantalla y la preferencia que sobrevive a la recarga | Dominio: `payment-channel.test.ts`, `payment-tally.test.ts`. App: `shared/components/multipayments/__tests__/cart-line-conversion.test.ts`, `cart-currency-select.test.tsx` |
| `multipayments` T10.2 — fila por defecto, segundo canal por el popup, recálculo y bloqueo por subpago                        | Con el módulo activo, pagar en dos canales distintos: el total y el vuelto se recalculan y no deja registrar una venta pagada de menos                            | ✅ **Total** — ver el detalle al final                                                                                                                                                                                                                | `app/integrations/multi-payment-two-channels.integration.test.ts` (5 casos)                                                                                                 |
| `multipayments-cart-v2` — fila Efectivo por defecto, popup de canales, papelera, recálculo y venta en dos canales            | La fila por defecto (Efectivo, por el total, sin mensaje de tasa), el popup que agrega el segundo canal, borrar una fila, el recálculo y la venta que se registra | ⚠️ **Parcial** — la fila por defecto (`createPaymentRow` + siembra del carrito) y el recálculo son lógica; **visual:** el popup y la papelera, la fila que aparece/desaparece de la lista y la venta registrada contra el backend                     | `shared/components/multipayments/__tests__/multi-payment-list.test.tsx`, `app/integrations/multi-payment-two-channels.integration.test.ts`                                  |
| `multipayments-currency-block` — sin tasa el cambio se bloquea y el carrito cae a la moneda nativa; con la tasa se convierte | El carrito no puede quedarse en una moneda sin tasa para la venta en curso, y con la tasa registrada sí convierte                                                 | ⚠️ **Parcial** — la regla de bloqueo/fallback es pura (`resolveCurrencyRate`, `convertLineAmount`); **visual:** que el carrito "caiga" a la moneda nativa en pantalla y el total pintado                                                              | `shared/components/multipayments/__tests__/cart-line-conversion.test.ts`                                                                                                    |
| `channel-rates-catalogue` — solo ofrece canales reales, registrar pinta el label y el menú muestra la página                 | La pantalla de tasas solo deja elegir combinaciones que existen (nada de Zelle+CUP) y, al guardar, muestra el canal registrado                                    | ⚠️ **Parcial** — la validez del canal es pura (`PAYMENT_CHANNELS`, `isValidChannel`) y el registro ida/vuelta es del servicio; **visual:** las opciones del desplegable, el label guardado y el enlace del menú                                       | Dominio: `payment-channel.test.ts`. App: `management/channel-rates/lib/services/__tests__/` (2), `management/channel-rates/routes/__tests__/` (1)                           |
| `channel-rates-catalogue` — el menú no ofrece la página y la ruta queda gateada                                              | Sin el módulo 16, la página de tasas no aparece en el menú y su ruta no se puede abrir                                                                            | ⚠️ **Parcial** — el gate es puro (`isModuleAvailable` + el loader de la ruta); **visual:** el enlace ausente en el sidebar y la redirección al home                                                                                                   | `shared/lib/auth/__tests__/` (authorization-service), `auth/routes/__tests__/loaders.test.ts`                                                                               |

## ✅ Total — `multipayments` T10.2

Afirmación: _con el módulo de multipagos activo, pagar una venta en dos partes por canales distintos
recalcula bien el total y el vuelto, y no deja registrar una venta pagada de menos._

Toda la afirmación es lógica: `settleMultiPayments` convierte cada fila con el dominio
(`convertPaymentAmount`), talla con `summarizePayments` y devuelve `remainingCents` (0 = cubierta) y
`firstError` (nunca un 0 silencioso). Las tasas salen del registro real
(`ChannelRateOfflineService`) y el guard del submit del carrito bloquea con **ese mismo resultado**
(`firstError !== null || remainingCents > 0`), así que probarlo es probar el bloqueo.

**Implementado en** `frontend-react/apps/web-store-pos/app/integrations/multi-payment-two-channels.integration.test.ts`
(5 casos: registro de tasas ida y vuelta, dos canales que cubren el total, recálculo del vuelto,
bloqueo por subpago con su borde, y fila inconvertible que bloquea aunque las demás cubran).

Lo que **no** se prueba ahí, y por eso el E2E `multipayments` sigue existiendo: que el popup
"Agregar pago" abra, que el router navegue y que la venta se registre contra el backend real.

### Estado de la entrada original de `known-issues`

Entrada movida desde `docs/testing/known-issues/group-anotados/multipayments-t10-2.md` (ficha
retirada al resolverse):

- **Qué falla (corrida 2026-09-24, versión vieja del spec):** antes de llegar al carrito, el test
  tenía que registrar una tasa de cambio en la pantalla de "tasas de cambio"; el formulario nunca
  aparecía (el campo donde se escribe la tasa no se dibujaba) y el test moría ahí.
- **Causa raíz (confirmada):** la versión que falló era la vieja — el spec se reescribió en dev el
  23/09 ("currency block and popup flow") y la corrida de la versión nueva pasó 2/2 (T10.1 + T10.2,
  ~35 s) como `describe.serial`. Limitación documentada: T10.2 necesita la sesión que crea T10.1
  (si se corre aislado, falla).
- **Estado:** ✅ **Resuelto 2026-09-24** — spec reescrito verificado en verde contra el backend real;
  el núcleo de negocio queda pineado en el test de integración sin navegador (abajo, 5 casos).

> Lo que este archivo aporta: el **núcleo de negocio** de T10.2 ya no depende de ese desenlace — está
> probado sin navegador en `app/integrations/`.

- _Actualizado: 2026-09-24._
