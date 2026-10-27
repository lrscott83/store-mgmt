# Onat — Vector Fiscal

Feature branch: `dev` · Delivery: work units with RDD per commit · Test runner: `pnpm test` (Vitest) desde `frontend-react/`

## Specs

**S1 — Grupo de menú.** Nuevo grupo `MENU.ONAT` en `app/shared/lib/config/menu-config.ts`, colocado **antes** de `MENU.MANAGEMENT`. Dos items, ambos solo para el Owner:
- `Vector Fiscal` → `/onat/vector-fiscal`
- `Configuraciones` → `/onat/configurations`

Los items usan `rolesOnly: (user) => user.isOwnerAdmin && !user.isSuperAdmin` y **no** llevan `featureIds` ni `moduleId` (no se toca backend).

**S2 — Solo el Owner.** Las dos rutas usan un loader nuevo `ownerOnlyLoader` que admite únicamente `isOwnerAdmin && !isSuperAdmin`. Cualquier otro rol es denegado como el resto de loaders (logout + `/login`).

**S3 — Ingresos editables con original congelado.** En Vector Fiscal el Owner puede sobrescribir el ingreso de un mes. Al hacerlo se guarda el valor original de ese instante y la UI muestra `312.500 (antes 298.000)`. El original **no** se recalcula cuando entran ventas nuevas. Una segunda edición conserva el original de la primera.

**S4 — Gastos igual que ingresos.** El gasto mensual se sobrescribe con el mismo patrón: valor + original congelado entre paréntesis.

**S5 — Un vector por Owner.** El vector es único por Owner y consolida **todas las tiendas que muestra el selector**. Sin el módulo MultiStores hay una sola tienda y el consolidado es esa tienda.

**S6 — Tributos.** Por mes se muestran:
- **Calculados**: Impuesto sobre Ventas o Servicios 10 % sobre ingresos (`011402`), Cuota mensual a cuenta del ISP 5 % sobre ingresos que excedan 3.260 CUP (`051012`), Impuesto por la Utilización de la Fuerza de Trabajo 5 % sobre los salarios del mes (`061032`).
- **Pagados**: los gastos registrados con tipo fiscal, cada uno con su código ONAT.

**S7 — Nomencladores.** Se amplía `ExpenseType` **agregando al final** (los valores existentes no se tocan) los tipos fiscales: contribución de zonas, arrendamiento a entidades estatales, exoneración por reparaciones, contribución a la seguridad social, contribución especial, impuesto sobre ventas, cuota mensual, fuerza de trabajo, sellos, anuncios. `Impuesto = 10` queda como "otro tributo".

**S8 — Cierre anual.** Base imponible = ingresos − 39.120 (mínimo exento) − gastos − tributos deducibles − contribución de zonas − arrendamientos − exoneraciones − bonificaciones. Luego escala progresiva de 10 tramos (5 % → 50 %), se restan cuotas y retenciones, se aplican bonificaciones y el resultado negativo se iguala a cero.

**S9 — Crédito.** Una venta a crédito cuenta como ingreso en el **mes en que se cobra** (`SaleCredit.paidDate`), no en el mes de la venta. Una venta no-crédito cuenta en su propia fecha.

**S10 — Moneda.** Todo se consolida en CUP usando las tasas de cambio de la app. No existe convertidor para `Order`/`Expense`; se implementa uno sobre `resolveCurrencyRate`.

**S11 — Configuraciones.** Un formulario por Owner con: nombre, NIT, domicilio fiscal, domicilio legal, municipio, provincia y actividades (nombre + código).

## Tasks

| ID | Tarea | Specs | Ruta | Estado |
|---|---|---|---|---|
| T1 | Dominio y cálculo puro: `ExpenseType` ampliado, taxonomía ONAT, escala y cierre anual, storage de config/overrides | S3,S4,S6,S7,S8,S11 | delegated | done — `ac393f68` |
| T2 | Agregación mensual multi-tienda en CUP (ingresos, gastos, tributos, salarios) | S5,S6,S9,S10 | delegated | done — `52040c4e` |
| T3a | Menú Onat, i18n, ruta, `ownerOnlyLoader` y pantalla Configuraciones | S1,S2,S11 | delegated | done — `d9204273` |
| T3b | Pantalla Vector Fiscal, overrides congelados, cierre anual y predicado `isOwnerOnly` compartido | S3,S4,S5,S6,S8 | delegated | done — `3e09334b` |
| T4 | Verificación: typecheck, lint y tests del feature | todas | inline | done — typecheck 5/5, `app/onat` 68 tests, `app/shared` 1508 tests |
| T5 | Corrección de hallazgos no bloqueantes de la review | S6,S8 | pending | pending |

## Log

**L1 (2026-10-26)** — Pedido original, verbatim:
> Vamos a poner Vector fiscal en un nuevo grupo. Ademas a los ingresos vamos a permitir modificarlos para que el Owner y solo el pueda ver esta vista y esos valores. Dejaremos al lado entre parentesis o de algun modo el valor que habia. Alguna otra duda para que no asumas nada de nada?

**L2** — Ubicación y alcance:
> ese grupo estar antes de Gestion y vamos a ponerle al grupo Onat y al link Vector Fiscal. Es uno por Owner. Ademas vamos a poner otro link para que sea COnfiguraciones para poner el NIT, las actividades, y todos los datos para la configuracion del Vector Fiscal.

**L3** — Gastos y nomencladores:
> los gastos no los tenemos en la POS? esos tributos no son generados? esos otros gastos? ... Esos otros gastos se deben adicionar en los gastos normales. SI no estan esos nomencladores entonces hay que adicionarlos. Revisa si salario es distinto a fuerza de trabajo

**L4** — Corrección de capa (el trabajo es solo frontend):
> de que backend estas hablando, todo esto es frontend papo. ... En el frontend react hay ventas y gastos.

**L5** — Respuestas de producto: (1) fuerza de trabajo **se calcula**; (2) gastos con el **mismo patrón** que ingresos; (3) se guarda **solo el original**; (4) el consolidado es **la suma de todas las tiendas que se muestran en el selector**, y sin MultiStore es una sola tienda.

**L6** — Crédito y moneda:
> el mes en que se cobra y ok con las tasas de cambio

**L7** — Autorización de implementación: `dale`.

**L8** — Proceso: usar subagentes (explorer/worker), codegraph para lo estructural, y RDD en cada commit.

**L9** — Hallazgos del explorer que condicionan el diseño:
- `SaleCredit` guarda un único `paidDate` y un único `paid`; `paidSaleCredit` registra pago completo, **no hay historial de abonos**. Consecuencia asumida: un crédito parcialmente pagado no se puede repartir por mes; solo cuenta al completarse.
- Existe `multi-store-aggregator.ts` con `readStoreActiveOrdersBetween`, `readStorePaidSaleCreditsBetween` y `readStoreActiveExpensesBetween`, pero `sumRangeSummaries` solo devuelve ventas/gastos/ganancias.
- No existe ningún guard "OwnerAdmin y no SuperAdmin": se crea `ownerOnlyLoader`.
- No existe persistencia frontend por Owner cifrada; solo hay precedente de JSON plano por usuario (`store-usage-tracker`). Se usa JSON plano con clave por `userId` y se documenta como decisión.
- No existe conversor `Order`/`Expense` → CUP; se implementa sobre `resolveCurrencyRate` (cents, redondeo HALF-UP).

**L10** — Cierre de la primera pasada (2026-10-27). Review nativa de Gentle AI sobre los cuatro commits: `approved` y autoridad consumida. Hallazgos no bloqueantes que quedan en T5:
- **R3-double-deduction (el más importante):** el cierre anual resta dos veces los mismos gastos fiscales, porque `gastos` ya los incluye y además se pasan como `tributosDeducibles`/`contribucionZonas`/`arrendamientos`/`exoneraciones`.
- **R3-paid-tributes-surface:** la columna Tributos solo muestra lo calculado; los tributos pagados por gasto no tienen superficie en pantalla.
- **R2-dup-expense-type-keys:** el mapa `EXPENSE_TYPE_KEYS` sigue duplicado en cuatro componentes.
- **R2-cuota-label-contradiction:** la etiqueta de `CuotaMensual` nombra un impuesto distinto al de la taxonomía.
- **R1-EXPENSE-ENUM-DRIFT:** los valores 11–20 del enum compartido no existen en el backend; hoy no hay endpoint que los reciba.
