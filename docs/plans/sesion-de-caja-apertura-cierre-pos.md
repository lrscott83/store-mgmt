# Sesión de caja POS — Apertura y cierre

**Fecha:** 2026-07-24
**Estado:** Investigación + diseño propuesto (previo a SDD)
**Alcance:** Diseñar la feature de **sesión de caja** (apertura con fondo inicial → operación → cierre con arqueo) para el frontend React (`frontend-react/apps/web-store-pos`), tomando como referencia cómo lo resuelven Odoo y 6 aplicaciones POS más.

> Este documento es la versión detallada del relevamiento. Cada punto del resumen se desarrolla acá con su evidencia y su fuente.

---

## 1. Objetivo y contexto

El React actual **no tiene** un ciclo de sesión de caja. Lo que existe es **"Cuadre del día"** (`sales/routes/today-stats.tsx`), una vista que calcula los totales del día (ventas, gastos, créditos) pero sin el *ciclo* que los acota a un turno con **fondo inicial** y **arqueo de cierre**.

La diferencia conceptual clave:

- **Cuadre del día (hoy):** un reporte de totales del día calendario.
- **Sesión de caja (propuesto):** un ciclo con estados (abrir → operar → cerrar) que arranca declarando el efectivo con el que se abre la caja, acumula los movimientos, y al cerrar compara el **efectivo esperado** contra el **efectivo contado**, exponiendo la **diferencia**.

Las cifras que hoy calcula `today-stats` son, en la práctica, **el "esperado" de una sesión**. La feature es en gran parte *envolver esos totales en un ciclo de vida*, no inventar cálculo nuevo.

### Estado actual relevante del React

| Pieza | Archivo | Rol en esta feature |
|---|---|---|
| Reconciliación diaria | `app/sales/routes/today-stats.tsx` | Fuente del "esperado" |
| Carrito / venta | `app/shared/components/cart-shell.tsx` | Punto donde se **gatea** la venta si no hay sesión abierta |
| Persistencia offline | `app/sales/lib/services/order-offline-service.ts` | **Patrón a espejar** para la sesión (offline-first + sync) |
| Store de auth | `app/shared/lib/stores/auth-store.ts` | `selectedStoreId` + cajero actual |
| Autorización | `app/shared/lib/auth/authorization-service.ts` | Gate de roles (abrir vs cerrar) |

---

## 2. Relevamiento de referencia

Se relevaron **7 productos**: Odoo (referencia canónica) + Square, Shopify, Loyverse, Toast, Lightspeed y Clover.

### 2.1 Odoo POS — el modelo canónico

Es el más completo y el único cuyo comportamiento pudo verificarse **contra su código fuente** (`pos_session.py`), no solo contra la documentación.

**State machine** (constante `POS_SESSION_STATE` en el source):

```
opening_control → opened → closing_control → closed
```

**Apertura ("Opening Control")**
- Al iniciar, si Cash Control está activo, aparece un diálogo que **exige verificar el fondo inicial** ("Opening cash amount") antes de "Open Register".
- El monto viene **pre-cargado con el cierre de la sesión anterior**, pero es editable.
- Cash Control es **opt-in** (Configuración → Ajustes → Pagos). Si está apagado, la sesión abre directo sin pedir fondo.
- **Una sola sesión activa por usuario** — el modelo aplica una constraint `_check_unicity` que impide dos sesiones concurrentes en estado distinto de `closed`/`closing_control` para el mismo usuario.
- Con Multi-Employee login, varios empleados pueden usar la misma sesión/terminal una vez abierta (badge, PIN, o selección manual).

**Durante la sesión**
- Movimientos vía **Cash In / Cash Out**: menú → elegir tipo → monto + **razón** → confirmar.
- Reportable en Reporting → POS Cash In Out; se postea al asiento contable junto al resto al cerrar.
- Se registra qué empleado hizo cada orden dentro de una sesión compartida (analítica por cajero).

**Cierre ("Closing Control")**
- El pop-up muestra **tres cifras**:
  - **Teórico** (`cash_register_balance_end`): el esperado calculado.
  - **Contado real** (`cash_register_balance_end_real`): lo físicamente contado, ingresado **por denominación** (el doc 14.0 muestra un formulario de conteo) **o como total**.
  - **Diferencia** (`cash_register_difference`): la variación.
- **Gate duro:** `_cannot_close_session()` **bloquea el cierre** si quedan órdenes en borrador/impagas, o si faltan las cuentas de pérdida/ganancia requeridas.

**Manejo de discrepancia (lo más rico de todo el relevamiento)**
- Política **escalonada**:
  - Diferencia chica → se acepta y Odoo genera un asiento **"Difference at closing PoS session"** contra las cuentas de pérdida/ganancia del diario de caja (`_post_statement_difference()`), para que la contabilidad cierre balanceada.
  - Diferencia **mayor a un umbral configurable** (`amount_authorized_diff` en `pos.config`, opción "Set Maximum Difference") → el Closing Control **se bloquea y un manager debe aprobar/forzar** el cierre.
- El cajero puede **cancelar** el pop-up de confirmación para volver a recontar en vez de forzar.

**Roles**
- Abrir/vender/bloquear = **permisos básicos**.
- **Cerrar = permisos avanzados** (+ acceso al backend).
- Es decir: separan explícitamente **"operar"** de **"cuadrar la caja"**.

**Reportes / posteo**
- Al cerrar OK, la sesión pasa a `closed` y se postea un asiento por método de pago (incluye cash in/out y, si no es cero, la diferencia).
- Hay un **"Session Report"** imprimible (estilo Z-report): balances de apertura/cierre, ventas brutas/netas, impuestos, descuentos, desgloses por producto/categoría, por método de pago, y cash in/out.
- Una vez `closed` y posteada, la sesión queda **bloqueada** para ediciones normales; corregir requiere intervención en el backend/contabilidad (no hay "reabrir y editar" nativo).

**Campos del modelo `pos.session`** (del source):
`state`, `user_id` (responsable), `start_at`, `stop_at`, `cash_register_balance_start` (fondo), `cash_register_balance_end` (teórico), `cash_register_balance_end_real` (contado), `cash_register_difference`.
En `pos.config`: toggle de cash control y `amount_authorized_diff` (máxima diferencia sin aprobación de manager).

> **Confianza:** state machine y campos verificados directamente contra `pos_session.py` (18.0). La copy de la UI cambia entre versiones 14–19 (ej. "Set Opening Balance" vs "Opening cash amount"/"Open Register"). Los campos exactos del Z-report provienen de fuentes de ecosistema (vendors), no del doc core.

*Fuentes:* ver [§5 Referencias — Odoo](#odoo).

---

### 2.2 Square POS

- **Concepto:** *Cash Drawer session*. Estados: **Active** (tras "Start Drawer") → **Ended** ("End Drawer") → **Closed** (al ingresar el contado real). Square distingue *ending* de *closing*. Auto-cierra sesiones tras 30+ días con 7+ de inactividad.
- **Apertura:** "Starting Cash" como **total** (no por denominación) + descripción opcional → "Start Drawer". Por dispositivo, según el staff logueado.
- **Durante:** **Pay In / Pay Out** con descripción libre; cada entrada actualiza el total corriente y queda en el historial.
- **Cierre:** muestra el **esperado** (fondo + ventas cash + pay-ins − pay-outs − reembolsos) y el cajero ingresa el **contado como total**. **No** hay conteo por denominación nativo (es un pedido recurrente de la comunidad, sin shipear). El over/short es el delta; **no bloquea** ni exige justificación (reconciliación manual del manager).
- **Reporte:** Cash Drawer report (Dashboard → Reports → Payments → Cash drawers): fondo, ventas cash, reembolsos, pay in/out con descripción, esperado. Filtrable por dispositivo/local. **No exportable.**
- **Multi-caja:** estrictamente **atado al dispositivo**; no hay caja lógica compartida entre dispositivos.
- **UX notable:** el split terminológico *ending ≠ closing* (podés "terminar" una sesión administrativamente sin registrar el conteo real).

*Fuentes:* ver [§5 — Square](#square).

---

### 2.3 Shopify POS

- **Concepto:** *register session* (cash tracking session). Estados: **Open** / **Closed** — "una vez cerrada, no se puede reabrir ni editar". Una sesión por dispositivo a la vez.
- **Apertura:** **manual** (ingresa "Current amount in drawer", opcionalmente **por denominación** con controles +/−) o **automática** (arrastra el cierre calculado de la sesión anterior; 0 en la primera sesión). Toggle configurable **"Require cash counting at session start and end"** → por defecto opcional, puede hacerse obligatorio por tienda.
- **Durante:** loguea "cash added or removed" con timestamp en el historial de actividad de la sesión.
- **Cierre:** ingresa el **contado real** (opcional por denominación), revisa un resumen, elige cuánto **dejar como fondo** para la próxima sesión y cuánto retirar/depositar. La discrepancia aparece en los reportes, **no** en un diálogo bloqueante; Shopify recomienda blind counts y buenas prácticas *por fuera* del producto.
- **Reporte:** dos al cerrar — **Cash tracking** y **Session** — con fondo, movimientos, conteo final, varianza esperado-vs-actual, y totales netos por método de pago. Imprimibles.
- **Multi-caja:** **por dispositivo** ("las sesiones de un dispositivo no se ven en otro"). La visibilidad centralizada cross-device requiere **Shopify POS Pro**.
- **UX notable:** el toggle "require cash counting" permite subir/bajar el rigor del conteo por negocio.

*Fuentes:* ver [§5 — Shopify](#shopify).

---

### 2.4 Loyverse POS

- **Concepto:** *Shift* (opt-in en Back Office → Settings). Estados: **open** ("Open shift") / **closed** ("Close shift", que imprime un Z-report automático).
- **Apertura:** el cajero **debe** especificar el efectivo de apertura (obligatorio con Shifts activo) → "Open shift". Sin desglose por denominación (total único).
- **Durante:** Cash management → **Pay In** (efectivo agregado sin venta, ej. dar cambio) / **Pay Out** (efectivo retirado, ej. gasto menor). Todo queda en el historial.
- **Cierre:** "Close shift" → ingresa el **efectivo real contado** → confirma. El sistema calcula el **esperado** y muestra la **diferencia** (over/short). Sin conteo por denominación documentado.
- **Reporte:** al cerrar **auto-imprime un Z-report**: totales de caja al cierre, resumen de ventas del turno, esperado, contado, y diferencia. El Shift History del Back Office lista por turno: POS, horarios apertura/cierre, esperado, contado y delta.
- **Multi-caja:** el turno está atado al **dispositivo POS**, no a un empleado; varios staff pueden entrar/salir del mismo dispositivo por PIN. No consolida nativamente varios turnos simultáneos en un único reporte de fin de día.
- **UX notable:** cerrar el turno y generar el documento de auditoría (Z-report) son **una sola acción** (auto-imprime si hay impresora).

*Fuentes:* ver [§5 — Loyverse](#loyverse).

---

### 2.5 Toast POS

- **Concepto:** *Cash Drawer* dentro de un *Shift Review* (flujo de fin de turno del empleado). Estados: **Active** → **Paused** ("contar después", no acepta más efectivo) → **Closed**.
- **Apertura:** balance inicial configurado por admin (Finance → Settings → Cash overview), en modo **Automatic** (aplica el default) o **Manual** (el staff tipea cada vez). Efectivamente obligatorio: no hay drawer sin balance inicial.
- **Durante:** dos familias, ambas con comentario opcional:
  - *In:* **Add Cash**, **Cash Collected** (traer efectivo de un empleado, ej. server banking).
  - *Out:* **Cash Out**, **Payout** (con código de razón), **Tip Out**, **Cash Drop** (a caja fuerte/otro local).
- **Cierre:** "Close Drawer" → aceptar el balance pre-calculado **o "Count Bills"** (calculadora de billetes/monedas que totaliza **por denominación**). Genera un comentario de varianza (over/short/exacto) pero **no bloquea** el cierre.
  - **Blind count real:** el permiso **"3.17 Cash Drawers (Blind)"** oculta el esperado al empleado que cierra; el Closed Drawer report también le esconde el esperado/overage (patrón de prevención de pérdidas).
  - El Shift Review completo es configurable como requerido u opcional a nivel compañía.
- **Reporte:** Drawer History con Starting Cash, Cash Payments, In/Out/Collected/Payout/Drop/Tips, **Expected Closeout**, **Actual Closeout**, **Overage/Shortage**, **Expected Deposit** (= actual − fondo), **Actual Deposit**, y **Deposit Overage/Shortage**. Más un Cash Activity Audit y, multi-local, un Cash Drawer Overview.
- **UX notable:** separa **"cierre de caja"** (till físico) del **"depósito"** (total al banco) → **dos varianzas independientes**, más granular que el resto.

*Fuentes:* ver [§5 — Toast](#toast).

---

### 2.6 Lightspeed (Retail / X-Series / S-Series, ex-Vend/ShopKeep)

- **Concepto:** *float* (opening/closing float) atado a un *register shift*. Estados: **Open Register / Closed Register** (X-Series) u **Open Shift / Close Shift** (S-Series). "Float Adjustment" = delta si se edita el float a mitad de ciclo.
- **Apertura:** el float es el efectivo contado al abrir; en S-Series un **Register Manager** tipea el monto y abre. **El monto de apertura NO se puede cambiar después de abrir** (control más estricto que Toast/Clover). Abrir es obligatorio para transaccionar; es acción del till, no del BackOffice.
- **Durante:** **spot-check** (X-Series) — verificar/contar efectivo a mitad de turno **sin cerrar** la caja (chequeo liviano).
- **Cierre:** ingresa **Counted ($)** contra el **Expected** por método de pago; el campo **Difference** se actualiza en vivo. Shortfall/overage. **Blind count real:** setting documentado **"How to hide expected cash when closing the register"** (Setup → Payment Types). Si hay discrepancia post-cierre, se ajusta después (Settings → Adjust Payment Types, o Reports → Closing Counts) → el cierre **no está hard-blocked**. Conteo por **total por método de pago**, no por denominación.
- **Reporte:** Register Closure Report (X-Series) / Z Report + Shifts Summary (S-Series): varianza actual-vs-esperado, desglose de movimientos (float, ventas, cash in/out), over/under.
- **UX notable:** el **float irreversible** fuerza precisión al abrir y empuja toda corrección a herramientas de ajuste post-cierre.

> **Confianza:** `x-series-support.lightspeedhq.com` bloqueó el fetch directo (403); esta sección se reconstruyó de resúmenes de búsqueda sobre títulos de artículos específicos (hide-expected-cash, float irreversible, conteo por total). Copy granular = aproximada.

*Fuentes:* ver [§5 — Lightspeed](#lightspeed).

---

### 2.7 Clover POS

- **Concepto:** el nativo de primera parte es un **Cash Log** (Sales activity → Cash log) — un rastro pasivo de aperturas de cajón y cash in/out, **no** un flujo formal de esperado-vs-contado. La app nativa **Shifts** es sobre todo un **reloj de fichaje** (clock in/out) con un check opcional de "retengo mi efectivo durante el turno". La reconciliación real basada en float vive en **apps del marketplace**, principalmente **Cash Track** (paga).
- **Apertura (Cash Track):** "Starting Bank" **por caja o por empleado**. Por defecto **solo un manager** inicia el turno; un setting "Allow Employee Manages Shifts" delega a staff.
- **Durante:** Cash Track trackea cash-out en tiempo real por caja/empleado; el Cash Log nativo registra cada apertura y movimiento con el empleado que lo disparó.
- **Cierre:** el empleado cuenta **por denominación** ("View & Count"). Clover corre **dos conteos independientes** — el del **empleado** y el del **manager** — reconciliados entre sí y contra el shift report. Ese doble conteo es un **blind count estructural** (el número del empleado no se compara en vivo contra "esperado", sino contra un segundo humano). Tras el conteo del manager, se registra depósito (monto, N° de bolsa, N° de slip).
- **Reporte:** Cash Log (filtrable por empleado/dispositivo/fecha) + el shift report de Cash Track (empleado vs manager vs esperado + campos de depósito).
- **UX notable:** Clover es el **outlier** — la reconciliación no es un módulo core monolítico sino que se **ensambla** de reloj de fichaje + app del marketplace.

> **Confianza:** el help de Clover renderiza como SPA JS que el fetch no pudo extraer. Sección apoyada en resúmenes de búsqueda + un PDF de marketplace. **No se pudo confirmar si una discrepancia bloquea el cierre.** El "blind count" de Clover es **inferido** (doble conteo), no un toggle documentado.

*Fuentes:* ver [§5 — Clover](#clover).

---

### 2.8 Tabla comparativa

| App | Concepto | Fondo apertura | Conteo por denominación | Blind count | ¿Diferencia bloquea cierre? | Cash in/out | Scope |
|---|---|---|:---:|:---:|---|:---:|---|
| **Odoo** | `pos.session` | Sí, editable (pre-carga cierre previo) | Sí (o total) | No | **Sí**, sobre umbral → manager | Sí (+razón) | Usuario/terminal |
| **Square** | Cash Drawer | Total | No | No | No (se reporta) | Pay In/Out | Dispositivo |
| **Shopify** | Register session | Total u opcional ×denom | Opcional (toggle) | No | No | Sí (log) | Dispositivo |
| **Loyverse** | Shift | Total (obligatorio) | No | No | No | Pay In/Out | Dispositivo |
| **Toast** | Cash Drawer + Shift Review | Auto o manual | **Sí (Count Bills)** | **Sí (perm 3.17)** | No (flag) | Muchos tipos | Caja |
| **Lightspeed** | Float / register shift | Sí, **irreversible** | No (total ×método) | **Sí (toggle)** | No (ajuste post) | Sí + spot-check | Caja/registro |
| **Clover** | Cash Log + Cash Track | Starting Bank | **Sí** | Estructural (doble conteo) | Incierto | Sí | Caja/empleado |

---

### 2.9 Patrón común (donde coinciden los 7)

1. **Sesión con estados** (open → closed): no hay movimiento de caja sin sesión abierta.
2. **Fondo inicial** al abrir + **conteo real** al cerrar → el sistema calcula el **esperado** (`fondo + ventas cash + pay-ins − pay-outs − reembolsos`) y muestra la **variación (over/short)** automáticamente.
3. **Pay In / Pay Out** como primitivas de movimiento intra-sesión, siempre con nota/razón.
4. **Reporte de cierre (Z-report)** como documento de auditoría: fondo, ventas por método de pago, movimientos, esperado, contado, diferencia.
5. **Scope por dispositivo/caja**, no por empleado ni por organización.
6. **Casi ninguno bloquea el cierre** por diferencia. **Odoo es el único** con un gate real (umbral + aprobación de manager).

**Diferenciadores que valen la pena:**
- **Blind count** (Toast, Lightspeed): el cajero no ve el esperado → evita "cuadrar a ojo". Control de prevención de pérdidas.
- **Umbral + aprobación** (Odoo): el único freno duro a diferencias grandes.
- **Conteo por denominación** (Odoo, Toast, Clover): mejor arqueo que el total único.
- **Doble varianza caja/depósito** (Toast): separa el till del total bancario.

---

## 3. Diseño propuesto para React — sesión **por turno**

> Decisión tomada: la sesión es **por turno** (varias por día, cada una con su fondo y arqueo, atribuida a un cajero) — modelo **Odoo/Toast**. Convive con "Cuadre del día", que pasa a ser el cálculo del **esperado de la sesión activa** en vez de un total de día calendario.

### 3.1 State machine

```
abierta → en_cierre → cerrada
```

- Una sola sesión `abierta` por **dispositivo + `storeId`** (espeja la constraint `_check_unicity` de Odoo).
- `en_cierre`: estado intermedio mientras se cuenta (permite pausar el arqueo sin perder el estado, como el "Paused" de Toast).
- `cerrada`: bloqueada para edición (como Odoo/Shopify: "no se reabre ni edita").

### 3.2 Apertura

- **Modal al iniciar turno:**
  - **Fondo inicial**, **pre-cargado con el cierre de la sesión anterior** de esa tienda (editable). Patrón Odoo/Shopify.
  - Cajero tomado del `auth-store` (usuario logueado).
- **Gate en `cart-shell`:** no se puede vender sin una sesión `abierta`. Si no hay, se ofrece abrir.
- **Rol:** abrir = cualquier cajero.

### 3.3 Durante la sesión

- **Pay In / Pay Out** con **razón obligatoria** (primitiva universal; patrón Odoo/Loyverse/Square). Cada movimiento queda con timestamp, monto, razón y cajero.
- `today-stats` se recalcula **scoped a la sesión activa** (desde `openedAt`), no al día calendario → es la base del **esperado**.
- (Opcional futuro) **spot-check** estilo Lightspeed: contar sin cerrar.

### 3.4 Cierre

- **Modal de arqueo** con el **triple de Odoo**:
  - **Esperado** (calculado): `fondo + ventas efectivo + pay-ins − pay-outs − reembolsos/vueltos`.
  - **Contado real**: ingresado con una **grilla de denominaciones** (billete/moneda × cantidad, que suma al total). Patrón Toast/Odoo.
  - **Diferencia**: badge en color (verde exacto / rojo faltante / ámbar sobrante), actualizada en vivo.
- **Gate de cierre:** no cerrar con **órdenes pendientes de sync** — el equivalente offline al "draft orders" que bloquea a Odoo (`_cannot_close_session`).
- **Z-report** al cerrar: resumen del turno (ventas por método de pago, movimientos, esperado, contado, diferencia, apertura/cierre y cajero).

### 3.5 Controles (defaults recomendados, configurables por tienda)

| Decisión | Default propuesto | Detalle / razón |
|---|---|---|
| **Diferencia** | Se **registra siempre**; sobre un **umbral configurable** → requiere **rol elevado** para cerrar | Es el único gate real del mercado (Odoo `amount_authorized_diff`). Diferencia chica: se acepta y se deja registrada. Diferencia grande: bloquea hasta aprobación de owner-admin. |
| **Blind count** | **Toggle por tienda, OFF** al inicio | Control avanzado (Toast perm 3.17 / Lightspeed toggle). Arrancar simple; habilitarlo esconde el "esperado" al cajero durante el arqueo. |
| **Roles** | Abrir = cajero · **Cerrar = owner-admin** | Separa "operar" de "cuadrar la caja" (patrón Odoo). Ya soportado por `authorization-service`. |
| **Denominaciones** | **Sí** | Mejor arqueo, evita cuadrar a ojo (Toast/Odoo/Clover). Con fallback a total único. |
| **Cash in/out** | **Sí, con razón** | Primitiva universal presente en los 7. |

### 3.6 Modelo de datos

`cash-session-offline-service` **espejando** `order-offline-service` (offline-first + sync). Entidad principal:

| Campo | Tipo | Notas |
|---|---|---|
| `id` | string | |
| `storeId` | string | de `auth-store` |
| `deviceId` | string | scope por dispositivo |
| `cashierId` | string | usuario que abre |
| `state` | `'abierta' \| 'en_cierre' \| 'cerrada'` | |
| `openingFloat` | number | fondo inicial |
| `openedAt` / `closedAt` | ISO string | timestamps |
| `expected` | number | calculado al cerrar |
| `countedReal` | number | del arqueo |
| `difference` | number | `countedReal − expected` |
| `closedBy` | string | quién cerró (para el gate de rol) |
| `movements` | `Movement[]` | pay-in/out |

`Movement`: `{ id, type: 'pay_in' | 'pay_out', amount, reason, at, by }`.
(Opcional) `denominations`: `{ value, count }[]` para el arqueo detallado.

### 3.7 Integración con lo existente

- **`cart-shell`**: gate de "sesión abierta" antes de habilitar la venta.
- **`today-stats`**: pasa a leer el rango de la sesión activa; es la fuente del `expected`.
- **`order-offline-service`**: modelo a copiar para la persistencia offline + sync de la sesión.
- **`auth-store` / `authorization-service`**: cajero actual + gate de rol para cerrar.

### 3.8 Decisiones abiertas (a confirmar en el SDD)

1. **Umbral de diferencia:** ¿monto fijo por tienda, o % sobre el esperado?
2. **Denominaciones:** ¿cargar el set de billetes/monedas de la moneda local como config, o dejar total único en v1?
3. **Blind count:** ¿entra en v1 (aunque OFF) o se difiere?
4. **Sesión huérfana:** ¿qué pasa si un turno queda abierto de un día para otro (auto-cerrar como Square, o forzar cierre manual)?
5. **Multi-dispositivo:** ¿una tienda puede tener 2 sesiones abiertas en 2 dispositivos a la vez (patrón universal: sí, scope por dispositivo)?

---

## 4. Próximos pasos

1. **`/sdd-new`** con este documento como base: brainstorming → proposal → design → tasks.
2. Resolver las 5 decisiones abiertas de §3.8 en la fase de proposal/design.
3. Implementar con TDD estricto (patrón del proyecto), espejando `order-offline-service`.

---

## 5. Referencias

### Odoo
- Cash control (14.0): https://www.odoo.com/documentation/14.0/applications/sales/point_of_sale/shop/cash_control.html
- Point of Sale (18.0): https://www.odoo.com/documentation/18.0/applications/sales/point_of_sale.html
- Employee login (18.0): https://www.odoo.com/documentation/18.0/applications/sales/point_of_sale/employee_login.html
- Workflow / uso (19.0): https://www.odoo.com/documentation/19.0/applications/sales/point_of_sale/use.html
- **Source `pos_session.py` (18.0):** https://github.com/odoo/odoo/blob/18.0/addons/point_of_sale/models/pos_session.py
- "Difference at closing" (foro): https://www.odoo.com/forum/help-1/pos-journal-entry-with-difference-at-closing-pos-session-label-235207
- Set Maximum Difference (Hibou): https://hibou.io/docs/point-of-sale-pos-67/pos-set-maximum-difference-previously-advanced-cash-control-1335
- Closing Cash Control 18 (Cybrosys): https://www.cybrosys.com/blog/how-to-manage-the-closing-cash-control-in-odoo-18-pos

### Square
- Start and end a cash drawer session: https://squareup.com/help/us/en/article/8344-start-and-end-a-cash-drawer-session
- View cash drawer reports: https://squareup.com/help/us/en/article/8358-view-cash-drawer-reports
- Denomination count (feature request): https://community.squareup.com/t5/Feature-Requests/Register-Count-by-Denomination-Cash-Drawer/idi-p/680746

### Shopify
- Register sessions: https://help.shopify.com/manual/sell-in-person/setup/register-shifts/
- Cash tracking: https://help.shopify.com/en/manual/sell-in-person/shopify-pos/cash-register-management/cash-tracking
- Balancing a cash drawer (blog): https://www.shopify.com/blog/balancing-a-cash-drawer

### Loyverse
- Shift Management: https://help.loyverse.com/help/shift-management-loyverse-pos
- Shift Report / Sales Summary: https://help.loyverse.com/help/shift-report-sales-summary-pos
- Shift History en el POS: https://help.loyverse.com/help/how-work-shift-history-pos

### Toast
- Use Cash Drawers (New Experience): https://support.toasttab.com/en/article/Use-Cash-Drawers-New-Experience
- Cash Drawer Reports Overview: https://support.toasttab.com/en/article/Cash-Drawer-Reports-Overview
- Closed Drawer Report: https://support.toasttab.com/en/article/Closed-Drawer-Report-1492723816056
- Job Roles (permiso 3.17 Cash Drawers Blind): https://support.toasttab.com/en/article/Creating-and-Editing-Job-Roles

### Lightspeed
- Opening/closing register shifts (S-Series): https://shopkeep-support.lightspeedhq.com/hc/en-us/articles/47479978110491-Opening-and-closing-register-shifts
- What is the float (X-Series): https://x-series-support.lightspeedhq.com/hc/en-us/articles/25534311609243-What-is-the-float
- Hide expected cash when closing (blind count): https://x-series-support.lightspeedhq.com/hc/en-us/articles/25534307257243-How-to-hide-expected-cash-when-closing-the-register

### Clover
- Run cash log report: https://www.clover.com/en-US/help/run-cash-log-report
- Cash Track (one-sheet PDF): https://help.clover.com/wp-content/uploads/app-one-sheet-cashtrack.pdf
- Shifts app: https://www.eu.clover.com/en-gb/help/shifts-app

> **Nota de confianza general:** los datos de Odoo (state machine + campos) están verificados contra el source. Lightspeed y Clover tienen menor confianza por bloqueos de fetch (403 / SPA) y se apoyan en resúmenes de búsqueda sobre títulos de artículos específicos. El resto proviene de documentación oficial de cada vendor.
