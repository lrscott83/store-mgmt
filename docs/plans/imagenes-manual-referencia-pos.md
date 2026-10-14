# Imágenes del manual de referencia v3.5 — qué debe mostrar cada captura y su equivalente en el POS

**Fecha:** 2026-10-13
**Origen:** extracción PDF → Markdown del manual de referencia con la herramienta `normas-extrartor`
(`pdf_a_texto.py`, markitdown) de `D:\Projects\Tester\gaceta-cuba\gaceta-cuba-tools`.
El PDF y el Markdown de origen (34 038 caracteres / 557 líneas) viven fuera de este repositorio.

**Actualizado:** 2026-10-14 — el cierre de caja ya existe (feature `cierre-efectivo`, `/sales/cash-closing`):
las capturas 10, 14 y 15 pasan a estar cubiertas.

**Importante:** el Markdown **no contiene las imágenes** (markitdown extrae solo texto). El manual trae
un **Índice de imágenes** con **26 capturas esperadas** y *qué debe mostrar cada una*. Este documento
copia esa especificación y la cruza con las vistas de nuestro POS React
(`frontend-react/apps/web-store-pos`, menú en `app/shared/lib/config/menu-config.ts`).

> **La aplicación de referencia vs. nuestro POS:** mismo dominio (inventario · almacenes · punto de
> venta), pero **no es la misma aplicación**. La de referencia tiene licencia local, ciclo de caja con
> arqueo por denominaciones, auditorías de conteo físico y pantalla de Nube; nuestro POS tiene catálogo
> web, pedidos WhatsApp/online, ventas mayoristas y multi-moneda. Por eso varias capturas no tienen
> equivalente.

## Las 26 capturas

| # | Qué debe mostrar (manual) | Vista equivalente en nuestro POS | Estado |
|---|---|---|---|
| 1 | Inicio de sesión: el teclado numérico y la lista de usuarios; la app recién abierta | `/login` | ⚠️ Parecido pero distinto: nuestro login es usuario/contraseña, no teclado + lista de usuarios |
| 2 | Menú lateral completo, los dos bloques, visto desde un usuario **Dueño** | El sidebar (`menu-config.ts`, rol OwnerAdmin) | ✅ Existe |
| 3 | Activación de licencia: el campo del código y el botón de escanear QR | — | ❌ No existe: nuestro modelo es plan/módulos, no licencia local |
| 4 | Nomencladores: una pestaña (p. ej. Presentaciones) con elementos activos e inactivos y el interruptor | `/management/configurations` | ⚠️ Equivalente aproximado |
| 5 | Formulario de almacén: campos de nombre y selector minorista/mayorista | `/inventory/warehouses` | ✅ Existe |
| 6 | Formulario de producto completo: nombre, categoría, precios y lista de presentaciones | `/sales/products` | ✅ Existe |
| 7 | Usuarios: la lista con varios usuarios de distintos roles | `/management/users` | ✅ Existe |
| 8 | Factura de compra: varias líneas, proveedor, almacén y campos de transporte/estibador | `/inventory/entries` (Entradas) | ⚠️ Equivalente aproximado |
| 9 | Factura en estado **Pendiente**: detalle sin aprobar, con el botón Aprobar y la etiqueta de estado | detalle en `/inventory/entries` | ⚠️ Verificar si nuestro POS aprueba compras |
| 10 | Apertura de caja: el diálogo pidiendo el efectivo inicial | `/sales/cash-closing` (campo Apertura) | ⚠️ Equivalente aproximado: el campo Apertura del Cierre Efectivo, no un diálogo aparte |
| 11 | Pantalla de venta con el carrito: varios productos, etiqueta MIN/MAY y el total abajo | `/sales/new` (+ `/sales/wholesale`) | ✅ Existe |
| 12 | Hoja de cobro: selector de forma de pago y la casilla "Es pago en línea" al elegir Transferencia | El modal de cobro del POS | ⚠️ Verificar la casilla "pago en línea" |
| 13 | Ventana del motivo de descuento: campo obligatorio al aplicar un descuento | Descuento del POS | ⚠️ Verificar que exija motivo |
| 14 | Pantalla de cierre de caja: parte superior, Efectivo esperado y las tres tarjetas de métodos de pago | `/sales/cash-closing` (Cierre Efectivo) | ✅ Existe |
| 15 | Conteo por denominaciones: lista con cantidades cargadas y abajo Total contado y Diferencia | `/sales/cash-closing` (card "Conteo") | ✅ Existe |
| 16 | Configuración de Pagos Electrónicos: interruptor general y los seis parámetros debajo | `/management/configurations` (Métodos de pago) | ⚠️ Equivalente aproximado |
| 17 | Valor de Inventario: resumen abajo y lista de productos con su valor | `/inventory/available` | ⚠️ Equivalente aproximado |
| 18 | Formulario de transferencia: origen, destino, campo de nombre y líneas de producto | `/inventory/warehouse-movements` | ✅ Existe |
| 19 | Vale de salida: un vale con el tipo de salida seleccionado y sus líneas | `/inventory/egress` (Salida) | ✅ Existe |
| 20 | Auditoría en curso: lista con cantidad del sistema, la contada y la diferencia resaltada | — | ❌ No existe |
| 21 | Pantalla de Resultados: período seleccionado y tarjeta de Métodos de pago con las tres vías | `/stats/cuadre-por-fechas` | ✅ Existe |
| 22 | IPV por Sesión: columnas Apertura, Entradas, Ventas, Salidas y Cierre | `/inventory/today-quantities` + `/sales/today-stats` + `/sales/cash-closing` | ⚠️ Repartido en varias vistas |
| 23 | Costo de Productos: lista con costo, precio actual y precio sugerido, y botón para aplicar los sugeridos | `/sales/products` / `/inventory/today-sales-profit` | ⚠️ Equivalente aproximado |
| 24 | Detalle de una venta: productos, subtotal, descuento y forma de pago | `/sales/orders` (detalle) | ✅ Existe |
| 25 | Pantalla de Nube: estado de la conexión, código QR e indicador de espacio consumido | — | ❌ No existe (nuestro sync es export/import) |
| 26 | Pantalla de Respaldo: botones de crear y restaurar, y la fecha del último respaldo | `/sync/export` + `/sync/import` | ✅ Existe |

## Resumen

| Estado | Cantidad | Capturas |
|---|---|---|
| ✅ Equivalente claro | 12 | 2, 5, 6, 7, 11, 14, 15, 18, 19, 21, 24, 26 |
| ⚠️ Equivalente aproximado (revisar el detalle) | 11 | 1, 4, 8, 9, 10, 12, 13, 16, 17, 22, 23 |
| ❌ No existe en nuestro POS | 3 | 3, 20, 25 |

## Reglas del manual para tomar las capturas

> **NOTA · Consejo para las capturas.** Tome las capturas siempre con los mismos datos de ejemplo y con
> el mismo tema (claro u oscuro). Un manual con capturas mezcladas se lee como si fueran versiones
> distintas del programa. Si usa datos reales, revise que no queden a la vista nombres de clientes ni
> montos que prefiera no publicar.

## Pendiente

- Las capturas marcadas ⚠️ requieren revisar la vista real en la app para confirmar si el detalle del
  manual coincide (p. ej. si el descuento exige motivo, si existe la casilla "pago en línea", si se
  aprueban compras).
- Las 3 sin equivalente son features que la aplicación de referencia tiene y nuestro POS no: licencia
  local, auditoría de conteo físico y pantalla de Nube.
