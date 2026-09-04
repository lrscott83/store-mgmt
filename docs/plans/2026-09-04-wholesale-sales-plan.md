# Plan — Ventas Mayoristas (wholesale sales)

Fecha: 2026-09-04 · Estado: propuesta para revisión (sin implementar)
Ámbito: frontend React (`frontend-react/apps/web-store-pos`), offline-first, mismo patrón que el catálogo/ventas actuales.

## Objetivo

Adicionar una opción de **Ventas Mayoristas** con el mismo guard del feature de Ventas (`EFeatures.Sale`, `featureLoader([EFeatures.Sale])`). Es una venta igual que la normal, pero en lugar de vender por 1 unidad, el producto define un tamaño de empaque configurable (**n unidades por caja/paquete**: 6, 10, 12, 24, 30… según desee el usuario) con otro precio. La deducción de inventario y el precio se calculan con ese empaque.

## Requisito de ejemplo (números configurables, no fijos)

- Una cerveza suelta cuesta 700; una caja de cerveza trae **24** cervezas y el precio sería **680 × 24** por caja.
- Una caja de refrescos (pomos) trae **6** pomos.
- Descuento por volumen (tiers): si se compran **más de 10 cajas** de cerveza → **660 × 24 × cantidad**; si se compran **más de 20 cajas** → **640 × 24 × cantidad**.

Los números (tamaño del paquete, precios y umbrales) son **configurables por producto y por tienda**.

## Decisiones confirmadas

1. **Umbrales/precios**: configurables por producto (los ejemplos 680/660/640, >10 / >20 son solo ejemplos).
2. **Cantidad de venta**: se vende por cantidad de **paquetes** (cajas); cada paquete tiene **n unidades** configurables. La deducción de inventario es `cantidad × n unidades`.
3. **Carrito**: se usa **el mismo carrito** que la venta normal (con `orderType = OrderType.Mayorista`).
4. **Display del detalle**: se muestra como `cantidad × unidades × precio`, p. ej. para la cerveza `12 × 24 × 660` (12 cajas × 24 unidades × 660 por unidad).

## Modelo de datos propuesto

Extender `Product` (`packages/domain/src/models/product.ts`) con campos opcionales (retrocompatibles, no rompen fábricas ni importaciones existentes):

```ts
wholesaleEnabled?: boolean;
// Unidades por paquete/caja: 6, 10, 12, 24, 30…
wholesalePackSize?: number;
// Escalones ordenados por minPacks ascendente; pricePerUnit es el precio de UNA unidad
// dentro del paquete. Ejemplo: [{minPacks:1, pricePerUnit:680}, {minPacks:11, pricePerUnit:660}, {minPacks:21, pricePerUnit:640}]
wholesaleTiers?: { minPacks: number; pricePerUnit: number }[];
```

- `OrderType.Mayorista = 2` **ya existe** en el enum; no hace falta tocar el modelo de órdenes.
- `CartItem.price` (precio por línea) **ya existe** y soporta precio custom (pensado para mayorista); el carrito ya guarda `orderType`.

### Almacenamiento y sync (export/import)

**Los campos van dentro del mismo `products.json`** — son atributos del `Product`, se serializan con el resto del catálogo. **No hay fichero nuevo ni cambios en el serializer/synchronizer** (a diferencia del registro de cambio, que sí requirió `exchange-rates.json`):

- Export: passthrough del JSON almacenado del mapa de productos (los campos viajan solos).
- Import: merge upsert del producto completo → los campos se conservan sin lógica extra.
- Retrocompatible en ambas direcciones: un backup antiguo sin estos campos importa igual y el producto queda sin mayorista; un backup nuevo importado en una app antigua solo ignora los campos desconocidos.

## Lógica de precios (función pura, testeable)

`sales/lib/wholesale.ts`:

```
resolveWholesalePrice(product, packs) -> { unitPrice, total }
  unitPrice = tier con mayor minPacks <= packs  (si no hay tier aplicable, fallback a product.price)
  total = packs × wholesalePackSize × unitPrice
```

High-level example (cerveza, pack 24): vender **12 cajas** con tier `minPacks 11 → 660` da:
- line.quantity = 12 × 24 = **288 unidades**
- line.price = **660** (precio unitario mayorista)
- total = 12 × 24 × 660 = **190.080**

## Flujo de la nueva pantalla

1. Ruta nueva: `/sales/wholesale` con `clientLoader = featureLoader([EFeatures.Sale])` (mismo guard que Ventas).
2. Ítem de menú **"Ventas Mayoristas"** bajo el grupo Ventas (`menu-config.ts`), con icono y texto de ayuda.
3. La pantalla lista únicamente productos con `wholesaleEnabled`.
4. El usuario elige el producto y la **cantidad de paquetes**; el precio por línea se calcula automáticamente con el tier correspondiente.
5. Se agrega al carrito existente con `orderType = OrderType.Mayorista` y `price` = precio unitario del tier.
6. Checkout, métodos de pago y créditos se reutilizan tal cual; `createOrder()` ya acepta `type: OrderType`.

## Configuración por producto (formulario de producto en `products.tsx`)

Sección nueva **"Ventas mayoristas"** dentro del modal de crear/editar producto:

1. **Switch "Vender por mayor"** → activa/desactiva `wholesaleEnabled`. Al desactivarlo, se conservan los datos configurados pero el producto deja de aparecer en la pantalla mayorista.
2. **"Unidades por paquete/caja"** (número entero, `wholesalePackSize`): 6, 10, 12, 24, 30… (default sugerido: 12).
3. **Lista de escalones de precio (tiers)**: filas editables con dos columnas:
   - **"Mínimo de paquetes"** (`minPacks`) — entero ≥ 1.
   - **"Precio por unidad"** (`pricePerUnit`) — decimal > 0, precio de UNA unidad dentro del paquete.
   - Botones **"Agregar escalón"** / eliminar fila. Al habilitar la sección por primera vez se precarga un tier base `minPacks: 1, pricePerUnit: product.price`.

### Validaciones (al guardar el producto)

- Si `wholesaleEnabled` está activo:
  - `wholesalePackSize` obligatorio, entero > 0.
  - Al menos **1 tier**; el **primer tier debe tener `minPacks: 1`** (siempre existe precio base mayorista).
  - Los tiers se **ordenan automáticamente por `minPacks` ascendente** y deben ser **únicos** (sin `minPacks` repetidos).
  - `minPacks` entero ≥ 1 y `pricePerUnit` > 0 en todas las filas.
  - `pricePerUnit` ≤ `product.price` (precio mayorista no puede superar el precio de venta normal; si fuese mayor, no podría ser "menor precio").
- El guardado normaliza: `tiers` ordenados, sin duplicados, números con `round2`.
- Si `wholesaleEnabled` está desactivado, no se validan los campos (quedan guardados como estaban).

## Impacto

| Área | Cambio |
|---|---|
| Domain `Product` | +3 campos opcionales (sin romper fábricas/tests) |
| Backend | Cero (offline-first, como órdenes/gastos) |
| Sync export/import | Nada: campos van en el `products.json` existente; no hay fichero nuevo ni cambios de serializer/synchronizer |
| Órdenes / estadísticas / dashboard | Sin cambios: orden con `type = Mayorista` fluye igual |
| Inventario | Funciona igual: se descuentan `cantidad × n` unidades con el FIFO actual |
| UI | `products.tsx` (sección "Ventas mayoristas" + validaciones de tiers), nueva pantalla `/sales/wholesale`, `menu-config.ts`, `routes.ts`, `es.ts` |
| Tests | Unit: resolver de tiers, validaciones del form, disponibilidad de inventario, carrito, `createOrder` (6 variantes) — E2E: spec nuevo `mayorista-sale.spec.ts` (config, venta feliz, inventario, pagos/crédito, export/import, guard, regresión) — ver sección Tests |

## Tests (frontend React)

### Tests unitarios

**Resolver puro `sales/lib/wholesale.ts` (`wholesale.test.ts`)**
- Tier base: 1 paquete → `unitPrice` del tier `minPacks: 1`.
- Umbral exacto: `packs == minPacks` aplica ese tier; `packs > minPacks` aplica el mayor `minPacks ≤ packs` (11 → tier 660, 21 → tier 640).
- Sin tiers configurados / `wholesaleEnabled` false → fallback a `product.price`.
- Tiers desordenados: el resolver ordena por `minPacks` (o rechaza; se decide con la normalización del form).
- Casos inválidos: `packs <= 0`, `packSize` ausente/0, tiers vacíos → error o total 0, nunca NaN.
- Redondeo: `total = packs × packSize × unitPrice` con `round2` (ej. 12 × 24 × 660 = 190.080).

**Conversión paquete → unidades (`wholesale.test.ts`)**
- 12 cajas × 24 = 288 unidades; 3 cajas × 6 = 18 unidades; cantidad acumulada con el carrito.

**Validaciones del formulario de producto (`product-form-wholesale.test.tsx`)**
- Switch activo sin `packSize` → error; `packSize` no entero o 0 → error.
- Sin tiers → error; primer tier con `minPacks != 1` → error.
- `minPacks` duplicados → error; `minPacks < 1` → error.
- `pricePerUnit <= 0` → error; `pricePerUnit > product.price` → error.
- Normalización al guardar: orden ascendente, sin duplicados, `round2`.
- Switch desactivado → no valida y conserva la configuración guardada.

**Carrito (`cart-store.test.ts`)**
- `addItem(product, packs×packSize, OrderType.Mayorista, unitPrice)` → línea con `price` custom y `orderType = Mayorista`.
- Cantidad acumula en la misma línea; `total()` = packs × packSize × unitPrice (redondeado).
- Mezclar línea normal + mayorista en el mismo carrito: `orderType` queda Mayorista (documentar comportamiento).

**Disponibilidad de inventario (`sale-availability.test.ts`)**
- `hasAvailableProductToSale` con `quantity = packs × packSize` contra `getAvailableQuantity(productId)` + `cartQuantity`.
- Suficiente (120 unidades, 5 cajas × 24) → permite; insuficiente (6 cajas × 24 = 144) → rechaza.
- Sin módulo de inventario o `discountFromInvantory: false` → no bloquea (igual que la venta normal).

**`OrderOfflineService.createOrder` (`order-offline-service.test.ts`)**
- `type = OrderType.Mayorista` persistido; `itemsCount` = suma de unidades (288).
- `line.price` = precio unitario del tier; `line.quantity` = unidades; `productCosts` FIFO normales.
- Variantes generables: `paymentType` Efectivo/Tarjeta/Zelle × `isCredit` true/false; con crédito exige cliente y crea `SaleCredit` (6 combinaciones).

**Pantalla `/sales/wholesale` (`wholesale-sale.test.tsx`)**
- Filtra solo productos con `wholesaleEnabled` (activos y `availableToSale`).
- Seleccionar paquetes → preview del precio = packs × packSize × unitPrice.
- Agregar → carrito con `price` custom y `orderType = Mayorista`.
- Inventario insuficiente → mensaje/dialog bloqueante (mismo contrato que la venta normal).

**Menú / guard (`menu-config` / loaders tests)**
- Ítem "Ventas Mayoristas" visible para el owner con `EFeatures.Sale`; oculto sin el feature.
- `featureLoader([EFeatures.Sale])` redirige a `/login` si el usuario carece del feature.

### Tests E2E (Playwright)

> **Nombre del spec**: usar `mayorista-sale.spec.ts` — el nombre `wholesale-sale.spec.ts` **ya existe** y cubre el flujo de Egreso S2-D2 (pantalla de egresos con selector de tipo Mayorista), no la venta mayorista.

1. **Configuración del producto**: crear/editar un producto con mayorista (packSize 24, tiers 1→680 / 11→660 / 21→640), guardar y verificar que aparece en la pantalla mayorista. Validaciones bloquean guardar sin packSize / sin tier base / precio mayor > retail.
2. **Venta mayorista feliz**: agregar 12 cajas → línea `12 × 24 × 660`, total 190.080; checkout con Efectivo → orden creada con `type = Mayorista`; visible en today-orders y orders-history con el total correcto y el detalle `cantidad × unidades × precio`.
3. **Inventario**: con stock exacto (120 unidades) 5 cajas OK, 6 cajas rechazado con mensaje; agregar dos veces acumula contra `cartQuantity`.
4. **Pagos y crédito**: pedido mayorista con Tarjeta y con Zelle; crédito con cliente genera el `SaleCredit` y aparece en credits.
5. **Export/import**: el backup exportado conserva `wholesaleEnabled/packSize/tiers`; al importar en otra tienda la config sobrevive; un backup antiguo (sin campos) importa sin mayorista.
6. **Guard**: usuario sin `EFeatures.Sale` que entra a `/sales/wholesale` → logout/redirect a `/login`; owner admin con el feature → acceso.
7. **Regresión**: la venta normal (/sales/new) sigue funcionando y no muestra precios mayoristas.

## Chequeo de existencia en inventario (regla de negocio)

- La pantalla mayorista usa el **mismo gate** que la venta normal (`hasAvailableProductToSale`) pero con `quantity = packs × packSize` (unidades) — nunca compara contra paquetes.
- El gate incluye el `cartQuantity` existente: si el cliente ya tiene 2 cajas (48) y agrega 10 más, se valida contra `48 + 240 = 288` unidades.
- Mismo comportamiento que la venta normal cuando no hay módulo de inventario o el producto tiene `discountFromInvantory: false` (no bloquea).

## Órdenes generables (matriz)

Con el mismo carrito/checkout reutilizado, un pedido mayorista puede producir cualquiera de estas órdenes (todas con `type = OrderType.Mayorista`):

| paymentType | isCredit | Cliente | Descripción | SaleCredit |
|---|---|---|---|---|
| Efectivo | false | — | (opcional) | no |
| Tarjeta | false | — | (opcional) | no |
| Zelle | false | — | (opcional) | no |
| Efectivo | true | requerido | = cliente | sí |
| Tarjeta | true | requerido | = cliente | sí |
| Zelle | true | requerido | = cliente | sí |

- Inventario: descuento FIFO normal en unidades por línea; `itemsCount` = total de unidades (288), el detalle muestra `12 × 24 × 660` por línea.
- La pantalla normal (`/sales/new`) sigue generando `type = Normal`; no hay cruce de precios mayoristas en la venta al detalle.

## Supuestos / a confirmar

- Los **umbrales de tier se interpretan en cantidad de paquetes** (cajas), no en unidades totales (coincide con el ejemplo "más de 10 cajas"). Si se prefiere en unidades totales, solo cambia la unidad del `minPacks`.
- Los productos sin `wholesaleEnabled` no aparecen en la pantalla mayorista (fallback a `product.price` si aparecieran).
- V1 solo vende por paquetes (no unidades sueltas) en la pantalla mayorista.
- Opcional (fuera de v1): columnas CSV para importar precios mayoristas.