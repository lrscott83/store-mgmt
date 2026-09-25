# Integración — Inventario, almacenes, movimientos y elaboración

> Specs E2E cubiertos: `inventory-available.spec.ts`, `inventory-available-multistore.spec.ts`,
> `inventory-egress.spec.ts`, `inventory-entries-history.spec.ts`, `inventory-entry.spec.ts`,
> `inventory-profit.spec.ts`, `inventory-quantities.spec.ts`, `entry-cost-guard.spec.ts`,
> `entry-cost-propagation.spec.ts`, `entry-cost-sync-roundtrip.spec.ts`, `warehouses.spec.ts`,
> `warehouse-cost-propagation.spec.ts`, `warehouse-movement-edit-cap.spec.ts`,
> `warehouse-movements-extended.spec.ts`, `warehouse-movements-fase4.spec.ts`,
> `movement-reversal.spec.ts`, `elaboration.spec.ts` (68 tests).
>
> **Leyenda**
> - ✅ **Total** — toda la afirmación es lógica de negocio y vive en servicios/repositorios/dominio.
> - ⚠️ **Parcial** — la lógica es probable sin navegador, pero el test además prueba algo que exige
>   render/router/red (se indica qué).
> - ❌ **No** — la afirmación depende del navegador o del backend real.
>
> **Regla del proyecto:** los specs E2E no se tocan sin autorización explícita del usuario.

Esta es la feature con mejor cobertura de servicios: `inventory/lib/` tiene las matemáticas puras
(`warehouse.ts`, `profit-calculator.ts`, `elaboration-math.ts`) y `warehouse-offline-service` tiene
tests por fase (1, 3, 4) más un `warehouse-profit-integration.test.ts`. Casi todo el fondo de estos
68 tests ya se prueba sin navegador; el E2E aporta las pantallas, los modales y el modo offline.

| Test | Qué prueba | Clasificación | Ya cubierto en |
|---|---|---|---|
| `inventory-available` — expandir categoría muestra productos con stock | Que el stock por categoría se despliega | ⚠️ **Parcial** — el stock es del servicio; **visual:** el acordeón | `inventory/lib/services/__tests__/inventory-offline-service.test.ts` |
| `inventory-available` — buscar producto filtra por nombre | Que el buscador filtra la lista | ⚠️ **Parcial** — el filtrado es del servicio; **visual:** el input y la lista | ídem |
| `inventory-available-multistore` MA-01 — con MultiStores el inventario se agrupa por tienda y la seleccionada muestra su stock | Que el inventario se agrupa por tienda | ⚠️ **Parcial** — las claves por tienda y sus lecturas son del repositorio; **visual:** los paneles y el agrupado | `inventory/lib/services/__tests__/`, `shared/lib/multistore/__tests__/` |
| `inventory-available-multistore` MA-02 — el select filtra a una sola tienda y oculta el resto | Que elegir una tienda aísla su inventario | ⚠️ **Parcial** — ídem; **visual:** el select y los paneles | ídem |
| `inventory-egress` FC-A1 — registrar venta mayorista y verificar en Ventas del día | Que una venta mayorista registra su egreso | ⚠️ **Parcial** — el egreso es del servicio; **visual/red:** el carrito y el POST | `inventory/lib/services/__tests__/`, `sales/lib/services/__tests__/order-offline-service*` |
| `inventory-egress` — la venta mayorista se refleja en Cantidades del día | Que las cantidades del día cuadran | ⚠️ **Parcial** — los agregados son del servicio; **visual:** la tabla | `inventory/lib/services/__tests__/inventory-offline-service.test.ts` |
| `inventory-egress` — cambiar el tipo de orden a Normal funciona igual | Que el mismo flujo funciona en venta normal | ⚠️ **Parcial** — `guardOrderType` es puro; **visual:** el select | `sales/lib/__tests__/` |
| `inventory-entries-history` S3-F2 — sin entradas muestra estado vacío | Que sin entradas hay estado vacío | ❌ **No** — aserción de pantalla | — |
| `inventory-entries-history` S3-F1 — las entradas aparecen agrupadas por día | Que el historial agrupa por día | ⚠️ **Parcial** — el agrupado es del servicio; **visual:** los acordeones | `inventory/lib/services/__tests__/inventory-offline-service.test.ts` |
| `inventory-entry` — registrar una entrada de stock aparece en la lista | Que una entrada creada se guarda y se ve | ⚠️ **Parcial** — `create` es del servicio; **visual:** el modal y la lista | ídem |
| `inventory-entry` — sin producto seleccionado muestra error de validación | Que el producto es obligatorio | ⚠️ **Parcial** — error tipado; **visual:** el mensaje | ídem + dominio `inventory-errors` |
| `inventory-entry` — la operación funciona correctamente en modo offline | Que se puede registrar sin red | ❌ **No** — modo offline del navegador | `shared/lib/offline/__tests__/` |
| `inventory-entry` S3-B1 — editar una entrada cambia cantidad y costo | Que la edición persiste cantidad y costo | ⚠️ **Parcial** — el update (con su guarda de costo) es del servicio; **visual:** el modal y la lista | `inventory/lib/services/__tests__/`, `entry-cost-*` (código) |
| `inventory-entry` S3-B2 — eliminar una entrada la remueve de la lista | Que el soft-delete funciona | ⚠️ **Parcial** — ídem; **visual:** la confirmación y la lista | ídem |
| `inventory-profit` S3-D2 — sin ventas muestra estado vacío | Que el reporte de ganancias tiene estado vacío | ❌ **No** — aserción de pantalla | — |
| `inventory-profit` S3-D1 — la ganancia refleja costo vs precio de venta | Que la ganancia se calcula con el costo real | ⚠️ **Parcial** — `profit-calculator.ts` es puro y ya está cubierto; **visual:** la tabla | `inventory/lib/__tests__/profit-calculator.test.ts`, `warehouse-profit-integration.test.ts` |
| `inventory-quantities` S3-C2 — sin datos muestra estado vacío | Que cantidades del día tiene estado vacío | ❌ **No** — aserción de pantalla | — |
| `inventory-quantities` S3-C1 — las cantidades reflejan entradas y ventas | Que el reporte de cantidades cuadra entradas con ventas | ⚠️ **Parcial** — el agregado es del servicio; **visual:** la tabla | `inventory/lib/services/__tests__/inventory-offline-service.test.ts` |
| `entry-cost-guard` E-CG-1 — una entrada de almacén no permite editar el costo en la tienda | Que el costo que vino de un almacén no se puede editar en la tienda | ⚠️ **Parcial** — la guarda es del servicio; **visual:** el campo bloqueado y el aviso | `warehouse-offline-service-fase3.test.ts` |
| `entry-cost-guard` E-CG-2 — una entrada normal SÍ permite editar el costo | Que una entrada de tienda sí permite editar el costo | ⚠️ **Parcial** — ídem, en positivo | ídem |
| `entry-cost-propagation` E-CP-1 — editar el costo de una entrada sin ventas guarda directo y se refleja | Que la corrección de costo se guarda y propaga | ⚠️ **Parcial** — la propagación es del servicio; **visual:** la tabla y el stock | `warehouse-offline-service-fase3.test.ts` |
| `entry-cost-propagation` E-CP-2 — una entrada con ventas es rechazada y su costo no cambia | Que no se puede reescribir el costo de una entrada ya consumida | ⚠️ **Parcial** — la guarda es del servicio; **visual:** el diálogo de rechazo | ídem |
| `entry-cost-sync-roundtrip` E-CS-1 — la corrección de costo llega por import a una orden ya existente en otro dispositivo | Que la corrección de costo viaja export→import | ⚠️ **Parcial** — el round-trip es de los servicios de sync; **visual:** el segundo dispositivo | `sync/lib/services/__tests__/`, `warehouse-offline-service-fase4.test.ts` |
| `warehouses` — crear un almacén y registrar una entrada por compra | Que el alta de almacén y su compra funcionan | ⚠️ **Parcial** — el servicio de almacenes lo cubre; **visual:** los modales | `warehouse-offline-service-fase1.test.ts`, `warehouse-offline-service.test.ts` |
| `warehouses` — una salida a tienda debita el almacén y crea una entrada en Entradas del día | Que la salida mueve stock y crea la entrada de tienda | ⚠️ **Parcial** — ídem; **visual:** las dos pantallas | ídem |
| `warehouses` — salida a tienda con stock insuficiente se bloquea y no crea entrada | Que sin stock no hay movimiento | ⚠️ **Parcial** — la guarda es del servicio; **visual:** el aviso | ídem |
| `warehouses` — transferencia entre almacenes mueve el stock | Que la transferencia mueve stock entre almacenes | ⚠️ **Parcial** — ídem | ídem |
| `warehouses` — desactivar un almacén con stock se bloquea y uno vacío sí se desactiva | Que el guard de desactivación depende del stock | ⚠️ **Parcial** — la guarda es del servicio; **visual:** el aviso | `warehouse-offline-service.test.ts` |
| `warehouses` — la cantidad decimal se acepta con round2 en compra y salida | Que las cantidades decimales se redondean a 2 decimales | ⚠️ **Parcial** — el redondeo es puro (`round2`, `warehouse.ts`); **visual:** los inputs | `inventory/lib/__tests__/warehouse.test.ts` |
| `warehouses` — exportar e importar el backup restaura las tres entidades de almacenes | Que el respaldo restaura almacenes, movimientos y lotes | ⚠️ **Parcial** — el round-trip es de los servicios de sync; **visual:** las listas | `sync/lib/services/__tests__/`, `warehouse-offline-service-fase4.test.ts` |
| `warehouses` — el ítem de menú Almacenes se oculta sin el feature y aparece al habilitarlo | Que el acceso a Almacenes está gateado por feature | ⚠️ **Parcial** — el gate es puro; **visual:** el menú | `shared/lib/auth/__tests__/`, `routes/__tests__/inventory-routes.test.tsx` |
| `warehouses` — venta tras salida a tienda descuenta FIFO con el costo del almacén | Que la venta descuenta por lotes FIFO con el costo correcto | ⚠️ **Parcial** — el FIFO/costo ponderado es puro (`warehouse.ts`) y está cubierto; **visual:** la venta y la ganancia | `inventory/lib/__tests__/warehouse.test.ts`, `warehouse-profit-integration.test.ts` |
| `warehouses` — un StoreUser no ve Almacenes y la ruta lo desloguea | Que un usuario de tienda no accede a almacenes | ⚠️ **Parcial** — el gate es puro (`featureLoader`); **visual:** el menú y la redirección | `auth/routes/__tests__/loaders.test.ts` |
| `warehouse-cost-propagation` E-CP-1 — propaga el costo nuevo a la venta activa y al stock en tienda | Que editar una compra propaga el costo a la tienda | ⚠️ **Parcial** — la propagación es del servicio; **visual:** el stock y la tabla | `warehouse-offline-service-fase3.test.ts` |
| `warehouse-cost-propagation` E-CP-2 — una compra sin unidades fuera guarda sin diálogo | Que sin unidades consumidas no hay diálogo de confirmación | ⚠️ **Parcial** — la condición es del servicio; **visual:** el diálogo que no aparece | ídem |
| `warehouse-movement-edit-cap` E-UI-2 — una cantidad por encima del tope queda bloqueada y no toca el stock | Que el tope de edición de una compra se respeta | ⚠️ **Parcial** — el tope es del servicio; **visual:** el error y el stock | `warehouse-offline-service-fase3.test.ts` |
| `warehouse-movement-edit-cap` E-UI-1 — tras consumir el lote, el tope es lo que QUEDA (no la cantidad original) | Que el tope se recalcula con lo consumido | ⚠️ **Parcial** — ídem | ídem |
| `warehouse-movement-edit-cap` E-UI-3 — dentro del tope la edición completa reversa + recreación | Que una edición válida se resuelve como reversa + nueva compra | ⚠️ **Parcial** — ídem | ídem |
| `warehouse-movements-extended` — segunda compra recalcula el promedio ponderado | Que el costo promedio ponderado se recalcula | ⚠️ **Parcial** — la matemática es pura (`warehouse.ts`); **visual:** el costo mostrado | `inventory/lib/__tests__/warehouse.test.ts` |
| `warehouse-movements-extended` — salida con stock insuficiente se bloquea con Swal y no debita | Que no hay salida sin stock | ⚠️ **Parcial** — la guarda es del servicio; **visual:** el Swal | `warehouse-offline-service*.test.ts` |
| `warehouse-movements-extended` — transferencia a destino con stock previo mezcla el costo ponderado (GAP-3) | Que la transferencia pondera el costo con lo que ya había | ⚠️ **Parcial** — puro; **visual:** el costo | ídem |
| `warehouse-movements-extended` — salida seguida de venta en tienda descuenta FIFO con el costo del almacén | Que el FIFO se respeta hasta la venta | ⚠️ **Parcial** — ídem | `warehouse-profit-integration.test.ts` |
| `warehouse-movements-extended` — cantidad decimal (0.5) en compra y salida con round2 | Que los decimales no rompen el inventario | ⚠️ **Parcial** — `round2` es puro | `inventory/lib/__tests__/warehouse.test.ts` |
| `warehouse-movements-fase4` E-R7b — editar una transferencia sin stock en el destino falla con stock insuficiente | Que una edición de transferencia valida el destino | ⚠️ **Parcial** — la guarda es del servicio; **visual:** el aviso | `warehouse-offline-service-fase4.test.ts` |
| `warehouse-movements-fase4` E-R13 — re-importar un respaldo con la reversa ya aplicada no la duplica | Que la reversa es idempotente ante re-import | ⚠️ **Parcial** — la idempotencia es del servicio/import; **visual:** el segundo import | `warehouse-offline-service-fase4.test.ts`, `sync/lib/services/__tests__/` |
| `warehouse-movements-fase4` E-R15 — revertir un movimiento de un almacén desactivado → almacén no activo | Que no se puede revertir contra un almacén desactivado | ⚠️ **Parcial** — la guarda es del servicio; **visual:** el aviso | ídem |
| `warehouse-movements-fase4` E-R16 — las páginas de almacenes no muestran claves crudas (i18n) | Que no se filtran claves de traducción sin resolver | ⚠️ **Parcial** — el catálogo de textos es puro (se puede asertar el diccionario); **visual:** el texto pintado | `shared/lib/i18n/__tests__/` (2) |
| `movement-reversal` E-R1 — reversa de Entrada desde el historial | Que revertir una entrada deshace el stock | ⚠️ **Parcial** — la reversa es del servicio; **visual:** el engranaje, la confirmación y el historial | `warehouse-offline-service-fase4.test.ts` |
| `movement-reversal` E-R2 — reversa de Movimiento (`transfer_out`) | Que revertir una transferencia devuelve el stock | ⚠️ **Parcial** — ídem | ídem |
| `movement-reversal` E-R3 — reversa de Salida íntegra elimina la entrada de tienda | Que al revertir una salida se limpia la entrada de tienda | ⚠️ **Parcial** — ídem | ídem |
| `movement-reversal` E-R4 — salida parcialmente consumida bloquea la reversa (D3) | Que no se revierte lo ya consumido | ⚠️ **Parcial** — la guarda es del servicio; **visual:** el Swal | ídem |
| `movement-reversal` E-R5 — edición de Entrada = reversa + nueva compra (F3) | Que editar una compra es reversa + recreación | ⚠️ **Parcial** — ídem | ídem |
| `movement-reversal` E-R6 — edición de Salida consumida bloquea (D3) | Que no se edita una salida ya consumida | ⚠️ **Parcial** — ídem | ídem |
| `movement-reversal` E-R6b — edición de Salida íntegra a menor cantidad | Que una salida intacta sí se puede reducir | ⚠️ **Parcial** — ídem | ídem |
| `movement-reversal` E-R7 — transferencia editada a otro destino | Que editar una transferencia mueve el stock al destino nuevo | ⚠️ **Parcial** — ídem | ídem |
| `movement-reversal` E-R8 — desactivación tras revertir todo (guardia D5/D12) | Que tras revertir todo el almacén se puede desactivar | ⚠️ **Parcial** — ídem | ídem |
| `movement-reversal` E-R9 — un StoreUser no ve engranajes (D6) | Que el usuario de tienda no ve las acciones de reversa | ⚠️ **Parcial** — el permiso es puro (`isUserAuthorized`); **visual:** los engranajes ausentes | `shared/lib/auth/__tests__/` |
| `movement-reversal` E-R10 — el historial distingue reversas (badge + icono propio, F5) | Que una reversa se marca distinto en el historial | ❌ **No** — es presentación (badge/icono) | — |
| `movement-reversal` E-R11 — el sync round-trip lleva la reversa (F7) | Que la reversa viaja en el respaldo | ⚠️ **Parcial** — el round-trip es de los servicios de sync; **visual:** el segundo dispositivo | `warehouse-offline-service-fase4.test.ts`, `sync/lib/services/__tests__/` |
| `movement-reversal` E-R12 — confirmación cancelada (No) no cambia nada | Que cancelar la confirmación no toca el stock | ⚠️ **Parcial** — "no cambió nada" es verificable en el servicio; **visual:** el diálogo | ídem |
| `movement-reversal` E-R14 — reversa de compra con lote parcial (D9) | Que un lote parcialmente consumido se revierte solo en lo que queda | ⚠️ **Parcial** — ídem | ídem |
| `movement-reversal` E-R14b — reversa de compra con lote consumido bloquea | Que con lote consumido no se revierte | ⚠️ **Parcial** — ídem | ídem |
| `movement-reversal` E-R17 — salida multi-lote crea dos filas y dos entradas de tienda (D8) | Que una salida multi-lote genera los movimientos por lote | ⚠️ **Parcial** — ídem | ídem |
| `movement-reversal` E-R17b — transferencia multi-lote acredita lotes exactos (D8) | Que la transferencia multi-lote respeta los lotes | ⚠️ **Parcial** — ídem | ídem |
| `movement-reversal` E-R17c — costo exacto a la tienda: venta FIFO multi-lote (D8) | Que el costo por lote llega exacto a la tienda | ⚠️ **Parcial** — ídem | `warehouse-profit-integration.test.ts` |
| `movement-reversal` E-R17d — reversa de UNA fila multi-lote (D10) | Que se puede revertir una sola fila de un movimiento multi-lote | ⚠️ **Parcial** — ídem | `warehouse-offline-service-fase4.test.ts` |
| `movement-reversal` E-R17e — edición de una fila multi-lote (D10) | Que se puede editar una sola fila multi-lote | ⚠️ **Parcial** — ídem | ídem |
| `elaboration` — receta → 2 lotes → costo real → venta de 1 unidad → ganancia | Que el costo real de una elaboración se descuenta en la primera venta y la ganancia cuadra | ⚠️ **Parcial** — `elaboration-math.ts` es puro y el servicio de elaboración tiene tests; **visual:** las pantallas de receta y lote | `inventory/lib/__tests__/elaboration-math.test.ts`, `recipes.test.tsx`, `elaborations.test.tsx` |

**Ninguno es ✅ Total** con la regla estricta de esta carpeta, pero es la feature donde más fácil sería
llegar: la matemática (`warehouse.ts`, `profit-calculator.ts`, `elaboration-math.ts`) y las reglas de
reversa/tope viven en servicios ya cubiertos, y el E2E solo agrega las pantallas.

- *Actualizado: 2026-09-24.*
