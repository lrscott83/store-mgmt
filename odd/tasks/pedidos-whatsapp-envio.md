# Pedidos WhatsApp — envío por WhatsApp (F4)

## Objetivo

Construir el enlace **`wa.me`** que el cliente abre para enviar el pedido a la tienda: resumen de
líneas + **código de pedido**, apuntando al número de WhatsApp configurado. El pedido se **persiste
antes** de abrir WhatsApp. Si la tienda no tiene número configurado, el envío queda **bloqueado**.
Sin API de WhatsApp.

## Problema

Tras crear el pedido en el servidor (F3), la tienda todavía no se entera: no existe ningún mecanismo
que lleve el resumen al WhatsApp del dueño. Tampoco hay regla sobre qué pasa si falta el número.

## Por qué

- El enlace `wa.me` (D2) es la vía acordada: **sin** API de WhatsApp ni Twilio/SMS, sin coste de
  proveedor y con el cliente como emisor.
- Persistir **antes** de abrir WhatsApp garantiza que un cierre de la pestaña o un fallo de red no
  pierda el pedido: la tienda lo ve en el panel aunque el mensaje no llegue.
- Bloquear si no hay número evita prometer un canal que la tienda no puede recibir.

## Alcance

### Autorizado

- UI React: helper que construye la URL `wa.me` y el texto; apertura de la ventana/pestaña; estado
  "bloqueado" cuando falta el número.
- Reutiliza la config (F1) y la respuesta de creación de pedido (F3).
- Tests unitarios nuevos de la construcción del enlace y del texto.

### Fuera de alcance

- **No** se integra ninguna API de WhatsApp/Twilio/SMS (D2).
- No se generan plantillas enviadas automáticamente por el servidor.
- No se crea pedido aquí (eso es F3); este feature solo compone y abre el enlace.
- No se modifica el catálogo web.

## Dependencias

- F2: `Code` del pedido, `OrderType = WhatsApp` y su persistencia.
- F3: `POST .../orders` devuelve `{ id, code, total, currency }` (moneda del catálogo) y el
  carrito/checkout.
- F1: `WhatsappNumber` en `StoreCatalogSettings` (decidir si viaja en el config público o en la
  respuesta de creación — **pendiente de confirmar**).

## Decisiones del owner aplicables

| # | Decisión | Cómo aplica a F4 |
| --- | --- | --- |
| D2 | Enlace `wa.me` del cliente; sin API de WhatsApp | Núcleo de esta feature. |
| D4 | Cliente anónimo | El resumen usa nombre/teléfono/dirección del checkout. |
| D6 | Snapshot en `OrderItem` | El resumen toma los datos persistidos, no los del cliente. |
| D7 | Config por tienda | `StoreCatalogSettings.WhatsappNumber` es la fuente del enlace. |
| D11 | Estados | El pedido ya está `New` al abrir WhatsApp. |
| D18 | Sin estado "En camino" | El resumen no menciona ese estado. |
| — | Precios/moneda | **Fuera de alcance**: los montos y la moneda vienen del catálogo. |

## Decisiones resueltas y notas

**No quedan decisiones abiertas bloqueantes para F4.** Las antiguas A3/A6 quedaron resueltas así:

- **A3 → ELIMINADA**: el resumen formatea montos con la **moneda del catálogo** devuelta por la
  creación del pedido; no hay moneda configurable de pedidos.
- **A6 → confirmado**: los nombres de las vistas ("Pedidos WhatsApp", "Pedidos", "Ventas",
  "Repartidores") no afectan al enlace, solo al flujo de origen.

Queda una **propuesta (pendiente de confirmar)**: de dónde sale el número de WhatsApp — del config
público o de la respuesta de creación del pedido (ver T2). Por defecto **no** se publica en el config
público.

## Diseño técnico

### Construcción del enlace (propuesta)

- Helper `buildWhatsAppOrderLink({ whatsappNumber, order, config })` en
  `app/catalog/lib/whatsapp-order-link.ts` (propuesta).
- Normalizar el número (solo dígitos, con código de país; sin `+`, espacios ni guiones) para la URL
  `https://wa.me/<numero>?text=<texto>`.
- El texto (resumen) se arma con `encodeURIComponent` e incluye:
  - Encabezado con nombre de la tienda.
  - **Código de pedido** destacado.
  - Líneas: `cantidad × nombre — precio` (snapshot persistido).
  - Subtotal, envío (si aplica) y **total** (calculado por el servidor).
  - Tipo de entrega, dirección (si domicilio), nombre y teléfono del cliente, notas.
- Texto en español, sin HTML (texto plano).

Esqueleto propuesto del mensaje:

```
Pedido <CODE> — <NombreTienda>
Cliente: <Nombre> (<Teléfono>)
Entrega: <Recojo en tienda | A domicilio — <Dirección>>
Notas: <notas>

1 × <Producto> — <precio>
2 × <Producto> — <precio>
Subtotal: <…>
Envío: <…>
TOTAL: <…>

Estado del pedido: <link consulta si aplica>
```

### Flujo

1. Checkout (F3) envía `POST .../orders`.
2. Se **persiste** el `Order` y se obtiene `code` (F2/F3).
3. Se construye el enlace con el `whatsappNumber` configurado.
4. Si **no** hay número → estado "bloqueado": no se abre WhatsApp y se informa al cliente/tienda; el
   pedido **ya está guardado** igualmente.
5. Si hay número → abrir `wa.me` (propuesta: `window.open` en nueva pestaña, con fallback de enlace
   visible si el navegador bloquea popups).
6. La vista de éxito muestra el código y el estado "pendiente de confirmación por WhatsApp".

### UI React

- Integración en el flujo de checkout/éxito de `app/catalog/` (F3); sin tocar la vista de catálogo
  más allá de los puntos ya previstos en F3.
- Mensaje de bloqueo cuando `WhatsappNumber` está vacío (**propuesta**, texto i18n).

## Tareas

- [ ] **T1** — Helper `buildWhatsAppOrderLink` (normalización de número + texto resumen).
- [ ] **T2** — Decidir y fijar de dónde sale el número (config público vs. respuesta de pedido) —
  **pendiente de confirmar**; por defecto no en el config público.
- [ ] **T3** — Integrar apertura del enlace tras el `POST` exitoso.
- [ ] **T4** — Estado "bloqueado" cuando no hay número.
- [ ] **T5** — Claves i18n del resumen y del bloqueo.
- [ ] **T6** — Tests unitarios del enlace (número con `+`, espacios, sin número) y del texto.
- [ ] **T7** — Verificación (`typecheck`/`lint`/`vitest`).

## Criterios de aceptación

1. El pedido se guarda **antes** de intentar abrir WhatsApp.
2. El enlace apunta a `wa.me/<número normalizado>` con el resumen y el **código** incluidos.
3. Con la tienda sin número, el envío queda bloqueado con aviso claro y el pedido sigue persistido.
4. El resumen no contiene HTML y usa la moneda del catálogo.
5. No se llama a ninguna API de WhatsApp.

## Comandos de verificación

```bash
cd frontend-react/apps/web-store-pos
pnpm typecheck
pnpm lint
pnpm vitest run app/catalog/
```

## Riesgos

- **Número mal normalizado** produce enlaces rotos: cubrir con tests.
- **Popups bloqueados**: ofrecer enlace visible si `window.open` falla.
- **Pedido sin WhatsApp**: el pedido existe igualmente; la tienda lo ve en el panel (F5).
- **Exposición del número**: decidir si se publica en el config público (ver F1); por defecto no.

## Siguiente paso

Confirmar el origen del número; implementar F4 tras F3.

## Progreso

- 2026-10-06 — Feature creado (documento de diseño). Sin implementación.
- 2026-10-06 — Sincronizado con el maestro: moneda del catálogo (A3 eliminada); sin "En camino"
  (D18); nombres de vistas confirmados (A6); "Decisiones abiertas" → "Decisiones resueltas y notas".
  Sin implementación.
