# Pagos y canales de pago — modelo nuevo

> **Nomenclatura**: en este documento la moneda nacional se llama **CUP**. Es la única
> diferencia con la aplicación, donde esa misma moneda lleva otro nombre de tres letras.
> El cambio es **solo de este documento** y no afecta a la app.

**Alcance**: el modelo **nuevo** de pagos y canales (dominio + API + base de datos).
No incluye el modelo viejo del cockpit demo ni el flujo de crédito.

---

## 1. Requerimientos funcionales

### RF-01 — Todo monto es un valor monetario con su moneda

Cada importe del sistema es un valor compuesto **monto + moneda**; un número suelto nunca
representa dinero. Los montos son decimales exactos (nunca punto flotante) en base de datos,
en la matemática del dominio y en la API.

- Monedas soportadas: **USD, EUR, CUP** — exactamente tres.
- Escala decimal: **2** para las tres monedas.
- **Una sola regla de redondeo en todo el sistema: HALF-UP, aplicada una sola vez** al final.
  Nunca se redondea en pasos intermedios.
- La suma directa de montos de distinta moneda **es imposible** sin una conversión explícita.

### RF-02 — Catálogo de monedas con pivote USD

Las tasas se guardan **siempre contra USD**, sin importar la moneda en que se cobró o se
cotizó el producto. USD es el pivote interno del sistema.

- Una tasa expresa **cuántas unidades de la moneda equivalen a 1 USD** (moneda-por-USD).
- Ejemplo: una tasa de `350` para CUP significa 350 CUP = 1 USD.

### RF-03 — Canales de pago: cinco, con moneda de liquidación fija

Existen exactamente **cinco** canales, y cada uno liquida en **una sola moneda**:

| Canal | Moneda de liquidación |
|---|---|
| `ZELLE` | USD |
| `USD_CASH` | USD |
| `EUR_CASH` | EUR |
| `CUP_TRANSFER` | CUP |
| `CUP_CASH` | CUP |

Reglas:
- La lista es **cerrada**: un canal fuera de esos cinco se rechaza; el sistema **nunca** lo
  reemplaza por uno conocido.
- Agregar un canal es un cambio de código, no un dato de configuración.
- Cada canal tiene su etiqueta de interfaz en español: *Zelle*, *USD en efectivo*,
  *EUR en efectivo*, *Transferencia en CUP*, *CUP en efectivo*.

### RF-04 — Pago dividido multi-canal (0..N pagos por orden)

Una orden puede registrarse con **cero, uno o varios pagos**, cada uno en un canal distinto
o repetido. Cada pago lleva:

- `channel`: el canal utilizado
- `amount`: el monto **en la moneda del canal**
- `rateApplied` + vigencia: la tasa congelada al momento de la venta
- `amountInOrderCurrency`: la conversión de ese pago a la moneda de la orden, también congelada

**Invariante central (se cumple o la orden no existe):**

```
Σ amountInOrderCurrency  =  Order.total
```

Reglas:
- El monto de cada pago debe estar en la moneda del canal; si no, se rechaza.
- El monto de cada pago debe ser estrictamente positivo.
- No hay límite de cantidad de pagos ni restricción de canales repetidos.
- Una orden **sin pagos** solo es válida si su total es cero (ver §6, punto abierto).

### RF-05 — Congelamiento de la tasa por pago

La tasa aplicada a cada pago queda **congelada** en el momento de creación de la orden, junto
con la fecha desde la que esa tasa rige. Cambiar las tasas del sistema **no** recalcula
pagos ya registrados: las tasas nuevas solo aplican a órdenes creadas después.

### RF-06 — Historial de tasas de solo-agregado (append-only)

- Cada cambio de tasa es una **fila nueva**; las filas existentes **nunca** se editan ni se borran.
- La tasa vigente en un momento T es la **última fila cuya vigencia sea ≤ T**.
- Cada tasa es **un solo valor**: no hay spread de compra/venta.
- La tasa se guarda con precisión de **6 decimales**.

### RF-07 — Resolución de tasas por cascada (función pura)

La resolución de la tasa es una función **pura** (sin acceso a datos ni red) que busca en
este orden:

1. La tasa **propia del canal** (ej. `ZELLE`).
2. Si no existe, la tasa **de la moneda del canal** (ej. `USD_CASH` → pivote USD = 1).
3. Si ninguna existe, **error explícito**.

**Nunca devuelve 0 ni nulo.**

### RF-08 — Conversión de dinero vía pivote USD

La conversión toma un monto, un canal y una moneda destino, y calcula pasando por USD
(origen → USD → destino), con **un único redondeo HALF-UP** al final.

Reglas por caso:
- **Misma moneda con tasa disponible**: se consulta la tasa y **se aplica**. No es un
  passthrough automático.
- **Misma moneda sin tasa disponible**: se usa identidad 1×1.
- **Monedas distintas sin tasa resoluble**: **error** — jamás se asume 1×1.

### RF-09 — Conversión sin canal (para líneas de la orden)

Existe también una conversión **canal-independiente** (solo moneda origen → moneda destino),
usada para convertir el precio de una línea de producto a la moneda de la orden. Sigue las
mismas reglas del RF-08 y no requiere canal.

### RF-10 — Errores nombrados, nunca valores inventados

El principio es *"grita, no adivina"*: ninguna conversión implícita, ningún `0` silencioso,
ningún `null` de relleno. Cada violación tiene su error tipado y un código HTTP definido:

| Situación | Resultado |
|---|---|
| Moneda del monto ≠ moneda del canal | Error de orden inválida → **400** |
| Monto de pago ≤ 0 | Error de orden inválida → **400** |
| Σ pagos ≠ total de la orden | Error de orden inválida → **400** (409 al verificar) |
| Canal desconocido | **400** con mensaje que nombra el canal |
| Moneda desconocida | **400** |
| Tasa no resoluble para canal/momento | Error tipado de tasa no encontrada → **404** |
| Orden sin líneas | Error de orden inválida → **400** |
| Modo de entrega ausente o inválido | Error de orden inválida → **400** |

### RF-11 — Los pagos son inmutables después de crear la orden

- Los pagos se registran **al crear** la orden.
- **No existe endpoint** para agregar, editar ni borrar pagos luego.
- La única edición permitida de una orden creada (mientras siga en estado inicial) toca
  **solo** almacén y modo de entrega.
- Al verificar la orden, el agregado queda congelado (tasas y totales incluidos).

### RF-12 — Contrato HTTP de pagos y tasas

- **Crear orden**: recibe cliente, almacén, modo de entrega, líneas y una lista **opcional**
  de pagos (`channel` + `amount`). El total y la moneda **nunca** se aceptan del cliente:
  se derivan de las líneas.
- **Tasas**: se registran por canal (solo dueño/administrador) y se consultan por canal y
  momento.
- **Conversión**: expuesta como consulta con monto, canal, moneda origen, moneda destino y
  momento.
- **Todos los montos y tasas viajan como texto (string) en JSON**, nunca como número, para
  no perder precisión decimal.

---

## 2. Modelación

### 2.1 Valores y entidades del dominio

| Elemento | Naturaleza | Contenido |
|---|---|---|
| `Money` | Valor | monto exacto (entero en unidades mínimas) + moneda |
| `Currency` | Enumeración | `USD`, `EUR`, `CUP` |
| `PaymentChannel` | Enumeración cerrada | los 5 canales |
| `ExchangeRate` | Valor | canal, valor de la tasa, fecha de vigencia |
| `OrderPayment` | Entidad hija de la orden | canal, monto en moneda del canal, tasa congelada, monto en moneda de la orden |
| `Order` | Raíz de agregado | líneas + **colección de pagos (0..N)** + totales derivados |

### 2.2 Derivaciones (nada de esto se acepta como entrada)

| Dato | Cómo se deriva |
|---|---|
| Moneda de la orden | Si **alguna** línea está en USD → `USD`; si no → `CUP`. EUR nunca es la moneda de la orden |
| Total de la orden | Suma de los totales de línea, ya convertidos a la moneda de la orden |
| Subtotal | Total + descuentos |
| Moneda de cada pago | La moneda fija del canal elegido |
| Monto en moneda de la orden | Conversión con la tasa congelada del canal |

### 2.3 Persistencia

**Tasas de cambio**

| Campo | Tipo | Nota |
|---|---|---|
| canal | enumeración (los 5) | |
| tasa | decimal (18, **6**) | valor moneda-por-USD |
| vigente desde | fecha-hora | define qué tasa aplica en cada momento |
| creado | fecha-hora | historial: nunca se edita ni se borra |

**Pagos de la orden** (una fila por pago → una orden puede tener N)

| Campo | Tipo | Nota |
|---|---|---|
| id | UUID | |
| orden | UUID (FK → orden) | **relación uno-a-muchos**; borrar la orden borra sus pagos |
| canal | enumeración (los 5) | |
| monto | decimal (18, **2**) | **en la moneda del canal**; la moneda no se guarda porque es derivable del canal |
| tasa aplicada | decimal (18, **6**) | congelada |
| canal de la tasa | enumeración | canal con el que se resolvió la tasa |
| vigencia de la tasa | fecha-hora | congelada |
| monto en moneda de la orden | decimal (18, **2**) | congelado |

El enum de canales existe también a nivel de base de datos con los mismos cinco valores: la
lista cerrada está garantizada **en el dominio y en el motor**.

---

## 3. Seeds (datos demo del modelo nuevo)

Los seeds son **idempotentes**: cada registro demo se busca por un identificador determinista
antes de insertarse; volver a correrlos no duplica nada. Además se construyen **pasando por la
misma fábrica de órdenes** que usa la aplicación (no por inserciones manuales), de modo que el
stock y los estados quedan consistentes.

### 3.1 Tasa sembrada

| Canal | Tasa | Vigente desde |
|---|---|---|
| `CUP_TRANSFER` | `350.000000` | 2026-01-01 |

(solo se siembra si el canal no tiene ya una tasa registrada)

### 3.2 Productos demo usados por las órdenes

| Producto | Precio | Moneda | Costo |
|---|---|---|---|
| Producto Demo USD | 100.00 | USD | 60.00 |
| Producto Demo CUP | 35 000.00 | CUP | 21 000.00 |

Ambos en una categoría demo propia (`Ventas Demo`), con orden de exhibición 1 y 2.

### 3.3 Órdenes demo

Todas se crean con fecha fija `2026-07-22`, entrega en tienda (salvo la de crédito),
y atribuidas al agente de ventas del tenant.

| # | Escenario | Líneas | Pagos | Estado final |
|---|---|---|---|---|
| 1 | **Moneda única (USD)** | 1 × Producto Demo USD (100.00 USD) | `ZELLE` 100.00 USD | `created` |
| 2 | **Mixta USD/CUP** | 1 × USD 100.00 + 1 × CUP 3 500.00 | `ZELLE` 200.00 USD | `verified` (reserva stock) |
| 3 | **Pago dividido, dos canales** | 2 × Producto Demo USD (200.00 USD) | `ZELLE` 120.00 USD + `CUP_CASH` 2 800.00 CUP (= 80.00 USD a tasa 350) | `delivered` (reserva y consume stock) |
| 4 | Venta a crédito | — | — | **fuera de alcance de este documento** |

**Lectura clave de la orden 3**: es la prueba viva de que **una orden admite múltiples pagos
en canales distintos**, y que la suma de sus equivalentes en la moneda de la orden iguala
exactamente el total.

---

## 4. Cobertura de tests

### 4.1 Unitarios (dominio, sin base de datos)

**Canales y monedas**
- Cubre exactamente los 5 canales confirmados.
- Mapea `ZELLE` y `USD_CASH` → USD; `EUR_CASH` → EUR; `CUP_TRANSFER` y `CUP_CASH` → CUP.
- Un canal no reconocido es un **error de compilación**, nunca un valor por defecto en runtime.
- Cada canal tiene su etiqueta en español; la búsqueda de etiqueta usa el mismo mapa.

**Dinero**
- Las tres monedas usan escala 2.
- Ida y vuelta de montos positivos, negativos y sin decimales; relleno de un solo decimal.
- Rechaza más decimales que la escala de la moneda y rechaza texto no numérico.
- Suma montos de la misma moneda; **falla al sumar EUR con CUP** directamente.

**Tasas y conversión**
- Una tasa concreta del canal se devuelve tal cual; una fila persistida conserva su identificador real.
- Se elige la fila más reciente vigente **hasta** el momento consultado.
- `USD_CASH` sin tasa propia cae al pivote USD (=1), nunca a error.
- La tasa sintética del pivote USD **no tiene identificador** (no se fabrican valores persistidos).
- Cae a **otro canal de la misma moneda** cuando el canal consultado no tiene tasa propia.
- Lanza error tipado cuando ni el canal ni su moneda resuelven; **nunca devuelve 0 ni nulo**.
- Convierte EUR → CUP pasando por USD con tasas expresadas como moneda-por-USD.
- Guardia de regresión: si se invirtiera la dirección de la tasa, el resultado se corrompería
  silenciosamente (por eso está cubierto).
- Redondea un límite exacto de medio centavo **HALF-UP** y coincide con el resultado de
  **un solo redondeo**, no con el de dos pasos.
- Calcula exactamente con enteros grandes donde el equivalente en punto flotante se desborda.
- Misma moneda con tasa disponible: **aplica la tasa**, no un passthrough.
- Misma moneda sin tasa: identidad 1×1 en lugar de error.
- Distinta moneda sin tasa: **error**, nunca 1×1 (guardia de regresión).

**Pagos**
- Misma moneda (Zelle liquidando USD en orden USD): el monto pasa sin cambios con tasa identidad.
- Convierte el monto a la moneda de la orden y **estampa la tasa del lado destino**.
- Rechaza un monto cuya moneda no coincide con la moneda del canal.
- Rechaza monto cero o negativo.

**Agregado de la orden**
- Cualquier línea en USD fuerza la moneda de la orden a USD, aun mezclada con una línea en CUP.
- Líneas solo en CUP/EUR derivan CUP.
- Exige al menos una línea; rechaza modo de entrega ausente o inválido.
- Nace en estado inicial, sin marcas de verificación ni entrega.
- Estampa la atribución al agente desde la entrada y nunca la deja nula.
- Ignora un total explícito y siempre recalcula desde las líneas.
- **Rechaza cuando la suma de pagos es menor que el total derivado.**
- **Rechaza cuando la suma de pagos excede el total derivado.**

### 4.2 Integración (con base de datos real)

- Persiste orden + líneas + **pagos** en un solo viaje; el modo de entrega es obligatorio y el
  estado inicial es el correcto.
- La **verificación** congela tasa y totales y reserva stock por línea, sin tocar el stock
  físico disponible.
- Registrar una tasa **posterior** no mueve la tasa ni los totales congelados de una orden
  ya verificada.
- La lectura y reconstrucción de una orden devuelve la colección completa de pagos con sus
  montos y tasas congeladas.

### 4.3 End-to-end (API completa contra base de datos real)

- **Crea una orden con pago dividido que suma exactamente el total.**
- La confirmación reserva stock y congela la tasa sin alterar el stock físico.
- Una línea o pago cross-currency **sin tasa resoluble** devuelve error de tasa (409) y **no
  deja escritura parcial**.
- Rechaza un canal de pago desconocido con 400 **antes** de llegar al servicio.
- La API de monedas responde 201 al registrar una tasa, con todos los campos monetarios como
  **texto**, y devuelve 404 cuando no hay tasa resoluble (nunca un cuerpo con 0 o nulo).
- Rechaza con 403 a un usuario común que intente registrar una tasa; admite al dueño.

---

## 5. Resumen de la lógica en una vista

```
Pago recibido (canal + monto)
        │
        ├─ ¿el monto está en la moneda del canal? ── no → ERROR
        ├─ ¿el monto es > 0? ────────────────────── no → ERROR
        │
        ├─ resolver tasa del canal (cascada: canal → moneda del canal → ERROR)
        ├─ convertir el monto a la moneda de la orden (vía USD, un solo redondeo HALF-UP)
        └─ congelar tasa + vigencia + monto convertido
        │
        ▼
¿Σ montos convertidos == total de la orden? ── no → ERROR
        │
       sí → la orden existe con N pagos inmutables
```

---

## 6. Puntos abiertos del modelo nuevo

1. **Orden sin pagos**: el invariante se evalúa siempre, así que una orden con total mayor a
   cero **no puede** quedar sin pagos. Una venta totalmente a crédito necesitaría total cero
   para pasar hoy.
2. **Sin límite de pagos por orden**: no hay tope de cantidad ni restricción de canales repetidos.
3. **Pagos inmutables**: no existe forma de corregir un pago mal cargado; habría que cancelar
   la orden y crear otra.
4. **Tasas sin valor por defecto**: al provisionar una tienda **no se siembran tasas**. Sin
   una tasa registrada para el canal, la consulta falla explícitamente (no hay valor implícito).
