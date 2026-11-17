# collections-module-breakdown — total tachado y desglose por módulo en Cobros pendientes

Objetivo: en la vista SuperAdmin "Cobros pendientes" (`/management/stores/collections`) mostrar el total sin descuento tachado cuando el monto tiene descuento, y un ícono "i" por fila que abra un popup con el precio de cada módulo de la tienda.
Branch: `dev`. Delivery: work-unit commits, RDD por commit. Runner: `dotnet test` (backend), `pnpm --filter @store-mgmt/web-store-pos test` (frontend).

## Specs

S1 — Columna Monto con total tachado.
En la tabla de "Cobros pendientes", cuando una fila tiene descuento (`baseAmount > amount`), la columna `Monto` muestra el total sin descuento **tachado** y a continuación el monto a cobrar. Sin descuento, se muestra solo el monto. El tachado usa el patrón ya establecido (`text-danger line-through`) y un `data-testid` propio por fila.

S2 — `baseAmount` lo calcula el backend.
`StoreToCollectDto` incorpora `BaseAmount` (float), calculado en `GetStoresToCollectQueryHandler` con `ModulePriceCalculator.CalculateBaseTotal(store.StoreModules)` — el mismo predicado `IsBillable` y el mismo filtro `Module.IsActive` que `CalculateTotal`. El cliente NO calcula aritmética de cobro; solo compara `baseAmount` con `amount`.

S3 — Ícono "i" con desglose por módulo.
Cada fila ofrece un botón con ícono de información (`aria-label` traducido) que abre un popup `role="dialog"` con el desglose de la tienda: una fila por módulo que **contribuye al monto** (`isActive && !priceIncluded`, vía `isBillableModule`), con columnas Módulo, Precio, Descuento, % Descuento y Precio actual; al pie, el Total con el acumulado sin descuento tachado cuando hay descuento. El popup es de solo lectura (sin inputs, sin guardar).

S4 — Origen de datos del popup y alcance.
El popup reutiliza `storeHttpService.getStoreModulePricing(storeId)` (`GET /v1/stores/{storeId}/module-pricing`, existente, SuperAdmin-only). El ícono "i" se muestra **solo** a usuarios con `user.isSuperAdmin`; para el resto la columna Monto sigue igual (S1) sin ícono.

S5 — Textos en un solo lugar.
Las cadenas nuevas viven en `frontend-react/apps/web-store-pos/app/shared/lib/i18n/es.ts` bajo `BILLING.COLLECTIONS.*`; los encabezados de columna del desglose reutilizan `STORES.MODULE_PRICING.COLUMN_*` y `STORES.MODULE_PRICING.TOTAL`, cuyos textos son idénticos.

S6 — Estados del popup.
Mientras carga muestra el spinner con texto traducido; si falla, un `role="alert"` con mensaje traducido; si no hay módulos que contribuyan, un mensaje traducido de estado vacío.

## Tasks

T1 — Backend: `BaseAmount` en `StoreToCollectDto` + cálculo en el handler + test unitario. Route: delegated worker. Status: done — commit hash registrado al cierre de la feature. RED: `error CS1061` (BaseAmount inexistente); GREEN: `Passed: 6, Failed: 0`, cero `error MSB`/`error CS`.
T2 — Frontend: `baseAmount` en `StoreToCollect`, columna Monto con tachado, botón "i" SuperAdmin, modal de desglose, i18n, tests. Route: delegated worker. Status: done — commit hash registrado al cierre de la feature. RED: 4 tests fallando (import del modal inexistente y testids ausentes); GREEN: `Test Files 15 passed (15)`, `Tests 207 passed (207)`, typecheck y lint en 0.

## Log

L1 (2026-11-17, petición original verbatim):
"En los cobros prendientes del SuperAdmin mostrar en la columna monto si tiene descuento mostrar tambien el total tachado. Además un ícono i para cuando se de tap se muestre el un popup con el precio de cada uno de los módulos de la tienda como mismo se muestra en el popup de "Precios de módulos" de una tienda pero solo con los datos para mostrar los valores necesario para revisar si esta bien el monto. Recuerda usar los subagentes para el explorer, para el worker y las tareas que debes usar los subagentes. Usa codegraph para las cosas que debes usarlo y no usar grep o otro comando para esos casos. Ademas tienes que hacer RDD cada vez que toque. Cualquier duda me preguntas para que no asumas nada de nada."

L2 (2026-11-17, aprobación): el Owner aprobó modificar backend de producción para agregar `BaseAmount`, con el ícono "i" visible solo para SuperAdmin reutilizando `GET /v1/stores/{id}/module-pricing`.

L3 (2026-11-17, exploración): `StoreToCollectDto` solo expone `Amount`. `CalculateTotal(store.StoreModules)` ya aplica descuentos (`ModulePriceCalculator.cs:53-63`); `CalculateBaseTotal` (:88-97) usa el mismo predicado con `sm.Price`. La vista es `management/stores/routes/collections.tsx`, el endpoint `/v1/stores/{storeId}/module-pricing` es SuperAdmin-only (`GetStoreModulePricingQuery.cs:65-66`) y el tipo de lectura es `StoreModulePricingReadResult` (`packages/domain/src/models/store.ts:306-310`). El mirror cliente `totalModulePricing`/`isBillableModule` vive en `packages/domain/src/commons/module-pricing.ts`.

L4 (2026-11-17, corrección de la revisión RDD de c9543824): dos defectos introducidos, corregidos en un work unit propio. (1) El popup pintaba a la vez el alerta de error y el estado vacío "Esta tienda no tiene módulos que sumen al monto" — información de cobro falsa; ahora `error` es exclusivo y precede a `loading`/vacío/tabla. (2) `openBreakdown` no tenía guarda de orden: la respuesta lenta de la tienda A podía pintarse bajo el nombre de la tienda B; ahora un `breakdownRequestIdRef` monotónico descarta la respuesta obsoleta (incluido el `finally`) y `closeBreakdown` lo incrementa. Tests nuevos: error sin estado vacío, promesa rechazada, descarte, cierre por encabezado y por overlay. Sugerencias restantes (R2-discount-rule-duplicated, R2-dual-closed-gate, R3-4, R3-5) quedan como follow-ups registrados, no bloquean.
