# Integración — Ventas, créditos, formas de pago y monedas

> Specs E2E cubiertos: `create-sale.spec.ts`, `create-credit.spec.ts`, `credits-history.spec.ts`,
> `pay-credit.spec.ts`, `edit-delete-order.spec.ts`, `orders-history.spec.ts`,
> `sale-barcode-scanner.spec.ts`, `sale-category-filter.spec.ts`, `report-consistency.spec.ts`,
> `payment-methods.spec.ts`, `payment-methods-config.spec.ts`,
> `payment-methods-config-multimonedas.spec.ts`, `payment-methods-plan-gate.spec.ts`,
> `payment-history-normalization.spec.ts`, `multimonedas.spec.ts` (42 tests).
>
> **Leyenda**
> - ✅ **Total** — toda la afirmación es lógica de negocio y vive en servicios/repositorios/dominio.
> - ⚠️ **Parcial** — la lógica es probable sin navegador, pero el test además prueba algo que exige
>   render/router/red (se indica qué).
> - ❌ **No** — la afirmación depende del navegador o del backend real.
>
> **Regla del proyecto:** los specs E2E no se tocan sin autorización explícita del usuario.

| Test | Qué prueba | Clasificación | Ya cubierto en |
|---|---|---|---|
| `create-sale` — crear una venta de contado con 1 producto y verificar en Ventas del día | Que una venta de contado se registra y aparece en el día | ⚠️ **Parcial** — la orden es del servicio/repositorio; **visual/red:** el carrito, "Registrar" y el POST | `sales/lib/services/__tests__/order-offline-service*` (13), `shared/lib/stores/__tests__/` (10) |
| `create-sale` — crear venta sin productos muestra error | Que no se puede registrar un carrito vacío | ⚠️ **Parcial** — `validateCartSubmission` es puro; **visual:** el error | `shared/lib/__tests__/` (7), `shared/components/__tests__/cart-shell.test.tsx` |
| `create-sale` — la operación funciona en modo offline | Que se puede vender sin red | ❌ **No** — modo offline del navegador | `shared/lib/offline/__tests__/` (14) |
| `create-sale` — los datos persisten tras recargar | Que la venta sobrevive al reload | ⚠️ **Parcial** — persistencia del repositorio; **visual:** el reload y la lista | ídem |
| `create-credit` S2-C1 — crear venta de crédito genera un crédito visible en Créditos del día | Que una venta a crédito crea el crédito con su cliente | ⚠️ **Parcial** — `sale-credit-offline-service` es del servicio (16 métodos cubiertos); **visual:** el formulario y el listado | `sales/lib/services/__tests__/sale-credit-offline-service*` |
| `create-credit` — crear venta de crédito sin nombre de cliente muestra error | Que el nombre del cliente es obligatorio | ⚠️ **Parcial** — la regla es del dominio/servicio; **visual:** el mensaje | ídem + dominio `sale-credit-errors` |
| `create-credit` — la operación funciona correctamente en modo offline | Que se puede vender a crédito sin red | ❌ **No** — modo offline del navegador | `shared/lib/offline/__tests__/` |
| `credits-history` — la página carga con título y contador de créditos | Que el historial carga con su contador | ⚠️ **Parcial** — el contador es del servicio; **visual:** el título y el número | `sales/lib/services/__tests__/sale-credit-offline-service*` |
| `credits-history` — el acordeón de día expande y colapsa | Que el acordeón de días funciona | ❌ **No** — interacción de interfaz | — |
| `credits-history` — muestra el total de créditos impagos | Que el total impagado se calcula y se pinta | ⚠️ **Parcial** — el agregado es del servicio; **visual:** el texto | ídem |
| `pay-credit` S2-C2 — pagar un crédito desde Créditos del día | Que registrar el pago de un crédito lo actualiza | ⚠️ **Parcial** — el pago/estado del crédito es del servicio; **visual:** el modal de pago y la fila | ídem |
| `edit-delete-order` S2-B2 — editar una orden cambia el tipo de pago | Que la edición de una orden persiste el cambio de pago | ⚠️ **Parcial** — el update es del servicio de órdenes; **visual:** el modal y la lista | `sales/lib/services/__tests__/order-offline-service*` |
| `edit-delete-order` S2-B2 — eliminar una orden la remueve de la lista | Que el soft-delete de la orden funciona | ⚠️ **Parcial** — ídem; **visual:** la confirmación y la lista | ídem |
| `orders-history` — la página carga con título y contador de órdenes | Que el historial carga con su contador | ⚠️ **Parcial** — el contador es del servicio; **visual:** el título | ídem |
| `orders-history` — el filtro de tipo de pago funciona | Que el filtro por forma de pago filtra | ⚠️ **Parcial** — el filtro es del servicio/colección; **visual:** la lista filtrada | `sales/lib/services/__tests__/order-offline-service*` |
| `orders-history` — el filtro de crédito funciona | Ídem para crédito | ⚠️ **Parcial** — ídem | ídem |
| `orders-history` — el acordeón de día expande y colapsa | Que el acordeón funciona | ❌ **No** — interacción de interfaz | — |
| `sale-barcode-scanner` — el punto de entrada del escáner abre el modal rediseñado con el stepper de cantidad | Que el modal del escáner de venta abre con su stepper | ❌ **No** — render de modal | — |
| `sale-category-filter` — la página de venta muestra la pestaña Todos y las categorías con productos | Que las pestañas de categoría se generan desde los productos disponibles | ⚠️ **Parcial** — la colección de categorías con productos es del servicio (`hasAnyAvailableToSaleProduct`); **visual:** las pestañas | `sales/lib/services/__tests__/product-offline-service*` |
| `sale-category-filter` — la página muestra productos cuando Todos está seleccionado | Que "Todos" lista todos los productos | ⚠️ **Parcial** — la consulta es del servicio; **visual:** la lista | ídem |
| `sale-category-filter` — muestra el aviso de sin categorías cuando no hay ninguna | Que sin categorías hay estado vacío | ⚠️ **Parcial** — la condición es pura; **visual:** el aviso | ídem |
| `report-consistency` S4-C1 — el reporte muestra datos después de crear una venta | Que la venta creada aparece en el cuadre del día | ⚠️ **Parcial** — el agregado del día es del servicio; **visual:** el reporte | `sales/lib/services/__tests__/order-offline-service*` |
| `payment-methods` PMF1 — venta CUP muestra Efectivo y Transferencia (CUP), sin Tarjeta, default Efectivo | Que los métodos ofrecidos en el carrito son los reales y el default es Efectivo | ⚠️ **Parcial** — el catálogo y el default son puros (`DEFAULT_SALE_PAYMENT_METHOD`, `paymentMethodOptionsForCurrency`); **visual:** el desplegable | dominio `payment-channel.test.ts`, `shared/components/multipayments/__tests__/` |
| `payment-methods` PMF2 — venta con defaults: total sin regresión y agrupada como Efectivo en el cuadre | Que sin método explícito la venta se agrupa en Efectivo | ⚠️ **Parcial** — la normalización del histórico es pura; **visual:** el cuadre | dominio `payment-tally.test.ts`, `payment-pricing.test.ts` |
| `payment-methods` PMF3 — orden con percent=1 y tax=10 muestra el total ajustado 12.10 CUP en el cuadre | Que el total con percent/tax se calcula bien | ⚠️ **Parcial** — `applyPaymentPricing` es puro y ya está cubierto; **visual:** el número en el cuadre | dominio `payment-pricing.test.ts` |
| `payment-methods` PMF4 — venta con Transferencia (CUP) se agrupa en Pago por Transferencia | Que la venta se agrupa por el método elegido | ⚠️ **Parcial** — la agrupación es pura; **visual:** el bloque del cuadre | ídem |
| `payment-methods` PMF5 — una orden histórica con Tarjeta (paymentType=2) se agrupa como Transferencia | Que el valor histórico "Tarjeta" se normaliza a Transferencia | ⚠️ **Parcial** — la normalización es pura; **visual:** el cuadre | ídem |
| `payment-methods` PMF6 — una orden antigua sin método se interpreta como Efectivo | Que la ausencia de método cae en Efectivo | ⚠️ **Parcial** — ídem | ídem |
| `payment-methods-config` — la sección renderiza con Efectivo fijo y los toggles Zelle/Transferencia | Que la sección de configuración lista los métodos con Efectivo fijo | ⚠️ **Parcial** — `applyStorePaymentMethodsConfig` y el default son puros; **visual:** los toggles | `shared/lib/payment-methods/__tests__/` (1) |
| `payment-methods-config` — default sin configurar: el modal de gasto ofrece Efectivo y Transferencia | Que sin configuración se ofrecen los métodos por defecto | ⚠️ **Parcial** — `DEFAULT_ENABLED_PAYMENT_METHODS` es puro; **visual:** el modal | ídem |
| `payment-methods-config` — desactivar Transferencia la quita del modal; reactivarla la restaura | Que la config por tienda se respeta aguas abajo | ⚠️ **Parcial** — el servicio de config sobre `localStorage` es testeable íntegro; **visual:** el modal | ídem |
| `payment-methods-config-multimonedas` — Zelle visible en USD con el módulo activo; apagado lo quita; reactivado lo restaura | Que Zelle depende del módulo MultiMonedas además de la config | ⚠️ **Parcial** — el gate es puro (`hasMultiMonedasAvailable`); **visual:** los toggles | ídem + `shared/lib/auth/__tests__/` |
| `payment-methods-plan-gate` — Zelle nunca aparece en el modal de gasto aunque la config lo tenga ON | Que el gate de plan manda sobre la config | ⚠️ **Parcial** — el gate es puro; **visual:** el modal | ídem |
| `payment-history-normalization` — el historial muestra solo Efectivo y Transferencia (CUP) en el filtro | Que el filtro del historial no ofrece Tarjeta/Zelle | ⚠️ **Parcial** — la normalización es pura; **visual:** las opciones del filtro | dominio `payment-channel.test.ts` |
| `payment-history-normalization` — las ventas del día muestran el mismo filtro normalizado | Que ambos listados ofrecen el mismo filtro | ⚠️ **Parcial** — ídem | ídem |
| `payment-history-normalization` — el modal de edición de una venta Zelle ofrece Transferencia (CUP), no Zelle | Que una venta histórica Zelle se edita como Transferencia (CUP) | ⚠️ **Parcial** — la normalización es pura; **visual:** el desplegable del modal | `sales/components/__tests__/` (19) |
| `multimonedas` MMF1 — sin el módulo MultiMonedas el selector de moneda NO aparece | Que el selector está gateado por el módulo | ⚠️ **Parcial** — el gate es puro; **visual:** el selector ausente | `shared/components/multimonedas/__tests__/` (2), `shared/lib/auth/__tests__/` |
| `multimonedas` MMF2 — un producto en USD muestra "10 USD" en la venta, sin `$` | Que el precio se pinta con la moneda del producto | ⚠️ **Parcial** — `formatMoneyWithCurrency` es puro; **visual:** el texto | `shared/lib/__tests__/` (7) |
| `multimonedas` MMF3 — el total del carrito lleva la moneda de la venta | Que el total usa la moneda del carrito | ⚠️ **Parcial** — `cartCurrency()` es puro; **visual:** el total | `shared/lib/stores/__tests__/` (10) |
| `multimonedas` MMF4 — no se puede mezclar monedas en el carrito | Que mezclar monedas se bloquea | ⚠️ **Parcial** — `guardCurrency` es puro; **visual:** el aviso | `shared/lib/__tests__/` (currency-guard) |
| `multimonedas` MMF5 — dos productos de la misma moneda se agregan sin bloqueo | Que la misma moneda no se bloquea | ⚠️ **Parcial** — ídem, en positivo | ídem |
| `multimonedas` MMF6 — con el módulo sembrado el selector aparece con las 7 monedas | Que el selector ofrece el catálogo completo de monedas | ⚠️ **Parcial** — el catálogo es del dominio; **visual:** las opciones | dominio `channel-conversion`/`payment-channel` |

**Ninguno es ✅ Total.** Todos los `payment-methods`/`multimonedas` tienen su regla pura ya cubierta en
el dominio y en vitest; el E2E aporta que el carrito, el modal o el cuadre la pinten. Los que
dependen del modo offline del navegador son ❌ No.

- *Actualizado: 2026-09-24.*
