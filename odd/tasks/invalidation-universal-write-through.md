# invalidation-universal-write-through

## Objetivo

Que ninguna pantalla montada pueda mostrar un dato que ya no es verdad. Sin quitar la caché por instancia, y sin que el comportamiento dependa de que la pantalla se monte "justo a tiempo".

## Problema

Cada servicio offline guarda en memoria una foto de lo que leyó del almacenamiento, y solo la rehace si esa foto está vacía o si cambia la tienda. La consecuencia: si un dato cambia mientras una pantalla está puesta, esa pantalla sigue mostrando el valor viejo.

Hoy existe un único aviso en todo el sistema — el bump de revisión que dispara `OrderOfflineService.createOrder`. Todo lo demás escribe en silencio. Hay además un efecto secundario: cada escritura "sella" la llave de tienda del servicio, lo que apaga el único disparador de invalidación que quedaba para el resto de la sesión.

Por qué sale bien a veces: al cambiar de ruta la pantalla anterior se destruye y la nueva construye una instancia con la foto vacía. Funciona por casualidad de ciclo de vida, no por diseño. El caso del carrito es el que rompe ese accidente: el carrito se abre encima de la vista, la vista nunca se destruye, y el fallo queda a la vista.

## Alcance

Movimientos 1 y 2 únicamente. El movimiento 3 (que las vistas se suscriban solas) queda en `docs/plans/2026-10-06-subscription-refresh-for-views.md` y NO se hace aquí.

- Movimiento 1: una única vía de escritura que siempre avisa.
- Movimiento 2: cada foto guarda con qué versión se hizo, y se rehace si la versión cambió.

Sin backend, sin E2E de Playwright, sin tocar `frontend/` (Angular legacy).

## Tareas

- [x] T1 - Documento de movimiento 3 en `docs/plans/`.
- [x] T2 - Movimiento 1: una sola vía de escritura que avisa, sin disciplina por servicio.
- [x] T3 - Movimiento 2: las fotos de los 7 servicios guardan versión y se rehacen al cambiar.
- [x] T4 - Los avisos de escrituras en ráfaga se agrupan (una notificación por ráfaga).
- [x] T5 - Tests unitarios: cada servicio relee tras una escritura de otro; una ráfaga produce una sola notificación.
- [x] T6 - Verificación: suite enfocada + `pnpm typecheck` + test de integración de la venta en verde.

## Comprobaciones ejecutadas

Sobre el código de `424f22d7`, sin cambios desde entonces (lo único modificado después fue este documento):

| Comprobación | Resultado |
|---|---|
| Test de integración del carrito real, sin mocks | 3/3 |
| Suite completa de la app | 5102/5102, 352 ficheros |
| `pnpm typecheck` | 5/5 |

## Servicios cubiertos

| Servicio | Cachés |
|---|---|
| `sales/lib/repositories/product-category-repository.ts` | categorías |
| `sales/lib/services/order-offline-service.ts` | ventas |
| `expenses/lib/services/expense-offline-service.ts` | gastos |
| `sales/lib/services/sale-credit-offline-service.ts` | ventas a crédito |
| `management/channel-rates/lib/services/channel-rate-offline-service.ts` | tasas de canal |
| `inventory/lib/services/warehouse-offline-service.ts` | almacenes, existencias, movimientos |
| `shared/lib/payment-methods/store-payment-methods-config-service.ts` | métodos de pago |

Ya cubiertos por trabajo previo (mismo patrón, sirve de modelo): `inventory/lib/services/inventory-offline-service.ts` y `sales/lib/repositories/product-repository.ts`.

## Restricción de caché

El agrupamiento de avisos (T4) NO es opcional. El aviso en si es barato, pero **rehacer la foto descifra el almacenamiento**. Sin agrupar, una importacion de 500 filas produciria 500 rehacer de fotos y 500 recalculos en las vistas suscritas. Se agrupa por rafaga.

## Criterios de aceptación

- Una escritura hecha desde cualquier servicio invalida la foto de cualquier otra instancia de ese servicio.
- Dos instancias del mismo servicio: la que escribió no ve la foto vieja de la otra.
- Una ráfaga de escrituras produce una sola notificación observable.
- La foto se rehaza solo cuando la versión cambia, nunca en cada lectura.
- El test de integración de la venta sigue verde.

## Comprobaciones

- Tests unitarios nuevos por servicio.
- Suite existente de servicios y repositorios completa.
- `pnpm typecheck`.

## Estado del commit revisado

`424f22d7` (`fix(data): toda escritura avisa y toda foto compara versión`) contiene T1–T5.
Revisión nativa RDD: lineage `review-59a6e966411e247d`, **APPROVED** y authority quemada
(`gentle-ai.review-acknowledged/v1`). T6 se cierra con las comprobaciones de este ciclo.

## Follow-ups de la revisión RDD (2026-10-06)

Los tres hallazgos del revisor son NO bloqueantes (informacionales) y NO abren corrección del
candidato. Se atacan aquí como trabajo nuevo, porque el defecto de fondo es el mismo: cobertura
que prueba el camino feliz y no el camino que de verdad puede romperse.

- R3-001 (WARNING) — el invariante "una venta = una revisión" se prueba solo con dobles síncronos.
  Verificado en código: `OrderOfflineService.createOrder` es síncrono de punta a punta
  (`setOrdersLocalStorage` :514 → `bumpDataRevision()` :521, sin `await` entre medio). El riesgo
  real no es un `await` actual, es una refactorización futura que mueva el bump detrás de una
  promesa. El test debe fijar esa propiedad.
- R3-002 (SUGGESTION) — la rama `initializing = true` sin aviso solo tiene test negativo en
  `inventory` (IV-4) y `product` (PR-4). Los otros cinco servicios que adoptaron el mismo guard
  (expenses, sale-credit, channel-rate, warehouse —tres cachés—, payment-methods) no lo tienen:
  si alguno perdiera el guard, ninguna suite fallaría.
- R3-003 (SUGGESTION) — `sale-stock-refresh-after-cart-sale-integration.test.tsx` no drena la cola
  de coalescencia ni resetea la revisión module-scoped, a diferencia de las suites unitarias. Sus
  aserciones sobreviven porque comparan stock absoluto, no revisión; queda sensible al orden.

## Tareas de follow-up

- [x] F1 (R3-002) — Test negativo de auto-init frío sin aviso en los cinco servicios restantes: expenses, sale-credit, channel-rate, warehouse (las tres cachés) y payment-methods.
- [x] F2 (R3-003) — Aislar el test de integración de la venta: drenar la cola de avisos y resetear la revisión en su `beforeEach`, sin debilitar ninguna aserción existente.
- [x] F3 (R3-001) — Fijar que el bump de revisión de una venta no depende del asentamiento de las promesas de sus colaboradores (dobles que nunca resuelven) y que N ventas producen N revisiones.
- [ ] F4 — Verificación: suites enfocadas en verde, `pnpm typecheck`.

## Alcance de los follow-ups

- SOLO se AÑADEN casos de prueba. No se toca código de producción. No se debilita, salta ni borra
  ninguna aserción existente.
- Sin Playwright, sin la suite E2E (`frontend-react/e2e/**`), sin backend, sin `frontend/` (Angular).
- Archivos existentes que se tocan y por qué es seguro: F1 añade casos a cinco suites
  `.data-revision.test.ts` ya existentes; F2 añade drenaje/reset al `beforeEach` de un test de
  integración de la app (no es E2E) — refuerza aislamiento, no relaja nada.

## Criterios de aceptación (follow-ups)

- Cinco servicios nuevos con prueba negativa de auto-init: un arranque en frío sobre almacén vacío
  siembra la clave y NO emite aviso (revisión sin cambios).
- El test de integración de la venta arranca cada caso con la cola drenada y la revisión en cero.
- Una venta con colaboradores cuyas promesas nunca resuelven sigue costando exactamente una revisión.

## Comprobaciones (follow-ups)

- `pnpm exec vitest run <cada archivo tocado>` desde `frontend-react/apps/web-store-pos`.
- `pnpm typecheck` desde `frontend-react/apps/web-store-pos`.
- Comprobación de mutación por el escritor: quitar el guard `initializing` de un servicio debe
  poner en rojo su prueba nueva.

## Progreso

- 2026-10-06: plan de follow-ups escrito tras la revisión RDD aprobada del commit `424f22d7`.
  Pendiente de implementación F1–F4.
- 2026-10-06: F1 hecho. Caso negativo de auto-init frío (clave propia ausente → se siembra la
  clave, sin aviso, revisión sin cambios) añadido a cinco suites, observadas en verde:
  `expense-offline-service.data-revision.test.ts` (EX-6, 6/6),
  `sale-credit-offline-service.data-revision.test.ts` (SC-6, 6/6),
  `channel-rate-offline-service.data-revision.test.ts` (CR-6, 6/6),
  `warehouse-offline-service.data-revision.test.ts` (WH-8, cubre las TRES cachés, 9/9),
  `store-payment-methods-config-service.data-revision.test.ts` (PM-6, 6/6).
- 2026-10-06: F2 hecho. `sale-stock-refresh-after-cart-sale-integration.test.tsx` drena la cola
  de coalescencia y resetea la revisión en su `beforeEach` (drenar antes de resetear, porque
  `pendingSinceRevision` es module-scoped); ninguna aserción existente tocada. Observado 3/3.
- 2026-10-06: F3 hecho. `order-offline-service.data-revision.test.ts` gana OR-6 (una venta cuesta
  UNA revisión aunque `createSaleCredit` devuelva una promesa que nunca asienta; el doble cableado
  se verifica por su resultado) y OR-7 (5 ventas → 5 revisiones). OR-4 intacto. Observado 7/7.
- 2026-10-06: `pnpm typecheck` en verde tras F1–F3.
