# Integración — Venta mayorista

> Specs E2E cubiertos: `mayorista-sale.spec.ts`, `wholesale-cart-floor.spec.ts`,
> `wholesale-plan-gate.spec.ts`, `wholesale-sale.spec.ts`, `wholesale-scanner.spec.ts` (15 tests).
>
> **Leyenda**
> - ✅ **Total** — toda la afirmación es lógica de negocio y vive en servicios/repositorios/dominio.
> - ⚠️ **Parcial** — la lógica es probable sin navegador, pero el test además prueba algo que exige
>   render/router/red (se indica qué).
> - ❌ **No** — la afirmación depende del navegador o del backend real.
>
> **Regla del proyecto:** los specs E2E no se tocan sin autorización explícita del usuario.

La aritmética mayorista (unidades = paquetes × tamaño, escalón aplicable, piso del primer rango) es
toda pura: `sales/lib/wholesale.ts`, con 40+ casos en `sales/lib/__tests__/wholesale.test.ts`.

| Test | Qué prueba | Clasificación | Ya cubierto en |
|---|---|---|---|
| `mayorista-sale` — configurar producto mayorista y vender 12 paquetes como 288 unidades | Que 12 paquetes entran al carrito como 288 unidades con el precio del escalón | ⚠️ **Parcial** — `wholesaleUnits` + `resolveWholesalePrice` + el carrito son lógica; **visual:** el input de paquetes, el botón de agregar y el badge | `sales/lib/__tests__/wholesale.test.ts`, `shared/lib/stores/__tests__/cart-store-wholesale.test.ts` |
| `mayorista-sale` — venta mayorista con Transferencia (CUP) queda filtrable por método de pago | Que el método de pago elegido persiste y filtra en el historial | ⚠️ **Parcial** — el método es un campo del carrito/orden; **visual:** el select y el filtro del historial | `shared/lib/stores/__tests__/`, `sales/lib/services/__tests__/order-offline-service*` |
| `mayorista-sale` — venta mayorista a crédito genera un crédito con el cliente | Que una venta mayorista a crédito crea el crédito con el nombre del cliente | ⚠️ **Parcial** — la creación del crédito es del servicio; **visual:** el formulario de crédito y el listado | `sales/lib/services/__tests__/sale-credit-offline-service*` |
| `mayorista-sale` — solicitar más unidades de las disponibles bloquea la venta mayorista | Que no se puede vender más stock del disponible | ⚠️ **Parcial** — la validación contra inventario es de los servicios; **visual:** el aviso | `inventory/lib/services/__tests__/` (9) |
| `mayorista-sale` — el icono de info abre el popup readonly con los rangos y precios | Que el popup muestra los escalones configurados | ⚠️ **Parcial** — los rangos salen de `getWholesaleConfig`; **visual:** el popup readonly | `sales/lib/__tests__/wholesale.test.ts` |
| `mayorista-sale` — una cantidad menor al primer rango se bloquea con el error de mínimo | Que por debajo del primer rango no se agrega | ⚠️ **Parcial** — `getWholesaleMinPacks` es puro; **visual:** el error en pantalla | `sales/lib/__tests__/wholesale.test.ts` |
| `wholesale-cart-floor` — el − no baja del menor rango: al quedar por debajo, la línea se elimina del carrito | El piso: pasar por debajo del primer rango saca la línea del carrito | ⚠️ **Parcial** — los predicados son puros (`getWholesaleMinPacks`); **visual:** que la línea desaparezca de la lista y el carrito quede vacío | `sales/lib/__tests__/wholesale.test.ts`, `shared/components/__tests__/cart-shell.test.tsx` |
| `wholesale-cart-floor` — ± cruza de rango y el precio de la línea se recalcula al rango aplicable | Que al cambiar de escalón cambia el precio por unidad de la línea | ⚠️ **Parcial** — `wholesaleTierUnitPrice` es puro; **visual:** los textos "Paquetes: 11 · Precio: $144" | ídem |
| `wholesale-plan-gate` — tienda Pago: el sidebar NO muestra el enlace a Ventas Mayoristas | Que sin el módulo 12 no aparece el enlace | ⚠️ **Parcial** — el gate es puro (`isModuleAvailable`); **visual:** el sidebar | `shared/lib/auth/__tests__/` |
| `wholesale-plan-gate` — tienda Pago: la ruta `/sales/wholesale` redirige al home sin pasar por /login | Que la ruta gateada redirige sin cerrar sesión | ⚠️ **Parcial** — el loader decide (puro); **visual:** la redirección | `auth/routes/__tests__/loaders.test.ts` |
| `wholesale-plan-gate` — tienda Superior (módulo 12 + feature 39): la ruta carga y el sidebar muestra el enlace | Que con el plan correcto sí se accede | ⚠️ **Parcial** — ídem, en positivo | ídem |
| `wholesale-sale` — la página de egresos carga con selector de tipo Mayorista | Que la pantalla de egresos ofrece el tipo Mayorista | ❌ **No** — aserción de pantalla | — |
| `wholesale-sale` — cambiar tipo de orden actualiza el selector | Que el tipo de orden cambia y el carrito lo respeta | ⚠️ **Parcial** — `guardOrderType`/`orderType` del carrito son puros; **visual:** el select | `sales/lib/__tests__/` (order-type-guard), `shared/lib/stores/__tests__/cart-store-wholesale.test.ts` |
| `wholesale-scanner` — el punto de entrada del escáner abre el modal rediseñado | Que el modal del escáner mayorista abre con su diseño | ❌ **No** — render de modal | — |
| `wholesale-scanner` — el switch "Todos" ON busca en todas las categorías; OFF restringe a la seleccionada | Que el filtro de categorías del escáner funciona | ⚠️ **Parcial** — el filtrado por categoría es del servicio/colección; **visual:** la lista de resultados | `sales/lib/services/__tests__/product-offline-service*` |

**Ninguno es ✅ Total** con la regla estricta de esta carpeta: en todos, además del cálculo, el spec
aserta el carrito o la pantalla renderizada. La excepción favorable es `wholesale-cart-floor`: si se
quisiera, su regla de piso y su reprecio se pueden probar completos con `sales/lib/wholesale.ts` +
el `cart-store`, sin render (hoy esa lógica ya está cubierta por unit tests).

- *Actualizado: 2026-09-24.*
