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

- [ ] T1 - Documento de movimiento 3 en `docs/plans/`.
- [ ] T2 - Movimiento 1: una sola vía de escritura que avisa, sin disciplina por servicio.
- [ ] T3 - Movimiento 2: las fotos de los 7 servicios guardan versión y se rehacen al cambiar.
- [ ] T4 - Los avisos de escrituras en ráfaga se agrupan (una notificación por ráfaga).
- [ ] T5 - Tests unitarios: cada servicio relee tras una escritura de otro; una ráfaga produce una sola notificación.
- [ ] T6 - Verificación: suite enfocada + `pnpm typecheck` + test de integración de la venta en verde.

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

## Progreso

_Pendiente._
