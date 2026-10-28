# Onat — Vector Fiscal configurable por año

Rama: `dev` · Runner: `pnpm vitest` desde `frontend-react/apps/web-store-pos` · Punto 1 del plan
`docs/plans/2026-10-27-onat-brechas-y-vector-fiscal.md`

## Specs

**S1 — Configuración por año.** Cada ejercicio se llena de nuevo: puede haber más o menos actividades y más
o menos tributos. Nada se hereda del año anterior.

**S2 — El import reemplaza todo.** Importar un CSV sustituye íntegramente las obligaciones de ese año. No hay
fusión con lo anterior.

**S3 — Cada tributo lleva su porcentaje.** El cálculo es `base × %`. El porcentaje viene **en el CSV**, porque
en el vector se explica por cada tributo. Si la fila trae importe, ese importe manda y no se calcula nada.

**S4 — El pago es manual.** El Owner paga por fuera y marca la obligación como pagada. No hay integración con
el portal.

**S5 — El CSV define qué tributos aplican.** Los tributos del año son exactamente los códigos del archivo. Si
un tributo no está en el vector, no se usa: no se calcula nada que el documento no declare.

**S6 — Salarios = total del mes.** Varios gastos de tipo `Salario` en un mes se suman; ese total es la base
del tributo de fuerza de trabajo.

**S7 — CSV con las columnas de la tabla más las del cálculo:**
`periodo;vence;codigo;importe;rc04a;porcentaje;base` (`pagado` opcional al exportar). El `porcentaje` se
escribe en por ciento (`10` = 10 %). Una fila sin importe ni porcentaje queda **pendiente de declarar**: es
el caso del `0530222`.

**S8 — Identidad con RC-05 y ejercicio.** La identidad guarda el código de barras del RC-05 (16 dígitos) y el
vector vive bajo un año.

**S9 — La liquidación adicional anual se calcula.** El importe del `0530222` no viene del CSV: sale del
**cierre anual vigente** (`cierreAnual`), con la escala progresiva, el mínimo exento y las deducciones. Se usa
la última versión del cálculo que exista en el repo, no una copia paralela.

**S10 — Reimportar avisa antes de borrar.** El import reemplaza todo, así que la pantalla debe informar
cuántas obligaciones, cuántas marcas de pago y cuántos importes calculados se van a perder antes de escribir.

**S11 — Solo frontend.** Sin backend, sin endpoints. Persistencia por Owner y año en `localStorage`.

**S12 — Escala por año, en código.** Los tramos viven en `ESCALAS_ISR`, indexados por año de ingresos. Un año
sin escala propia usa la última publicada: hoy 2025 rige para 2026 y para los siguientes hasta que se publique
otra. No es un cálculo provisional.

**S13 — Bonificaciones por tipo.** El usuario introduce el dato que corresponde a cada tipo (pronto pago,
pago electrónico) y la aplicación aplica el porcentaje.

**S14 — Gastos sin comprobante.** Casilla que activa la deducción y un valor por defecto **20**, admitido entre
0 y 20. El importe deducible se calcula sobre el total de gastos.

**S15 — Fuera de alcance por ahora.** Sector cañero y las filas 56–68 de la DJ-08 (sector de la cultura).

## Tasks

| ID | Tarea | Specs | Estado |
|---|---|---|---|
| T1 | Modelo `OnatVector`, parser/serializador CSV, persistencia por año, marcar pagado, bonificaciones propias, gastos sin comprobante y correcciones | S1–S11 | done — verificado |
| T2 | UI Configuraciones: selector de año, RC-05, identidad y actividades por año | S1,S8,S11 | done — verificado |
| T3 | UI Vector Fiscal: agenda de obligaciones desde la configuración y marcar pagado | S2,S4,S5 | pendiente |
| T4 | UI import/export del CSV con informe de errores por línea | S2,S7 | pendiente |
| T5 | Verificación: typecheck, lint y suite del feature | todas | pendiente |

## Log

**L1 (2026-10-28)** — Pedido original, verbatim:

> 1. Cada año se llena el formulario porque cada año puede ser un vector fiscal distinto con mas o con
> menos actividades o con mas o menor impuestos. Todo eso debe ser configurable por año y por cada vector
> fiscal. 2. En el import todos los datos que van en el csv se reemplaza todo. [...] cada tipo de impuesto
> teiene que venir con su % para poder calcularlo. Despues segun los ingresos y gastos entonces es que se
> calculan los datos y cuando el Owner hace el pago de forma externa entonces marca que lo pago y ya. [...]
> cuando se carguen el csv esos son los tributos para ese Owner y no tienes que inventar mas nada. [...] lo
> que necesitas no es el total de salarios en el mes?

**L2** — Verificación de T1: `onat-vector.test.ts` 21 tests; suite `app/onat` 114 tests / 5 archivos;
typecheck sin errores.

**L3** — Decisión de alcance: el porcentaje vive en la configuración del año (junto al tributo), no en el
CSV. Son dos piezas del mismo vector y el CSV solo representa la tabla.

**L4 (2026-10-28)** — Correcciones del Owner, verbatim:

> 1. Se debe calcular, pero debes usar el calculo de la ultima porque creo que se hizo cambios. 2. Si el
> usuario va a reimportarlo todo se borra, se debe notificar al usuario que se perderan esos valores y los
> calculos realizados. 3. Asi esta bien

- `0530222` se calcula con el cierre anual vigente. Verificado: la última versión del cálculo es
  `51b025a2 refactor(onat)`; hoy contempla el 5 % de pronto pago y no los dos 3 % de la DJ-08.
- Se añade `impactoDeImportar` para que la UI cuente obligaciones, pagadas y calculadas antes de reemplazar.
- El porcentaje se escribe en por ciento (`10` = 10 %).

**L5** — Verificación de T1: `onat-vector.test.ts` 32 tests; suite `app/onat` 123 tests; typecheck sin
errores.

**L6 (2026-10-28)** — Decisiones del Owner, verbatim:

> calro que la idea es que el usuario introduzca todas esas bonificaciones segun el tipo y nosotros ponemos
> esos % para hacer el calculo. 1. Escala de 2025 y no es provicional, si no hay una nueva para 2026 es la
> que existe y punto. Estos datos de escala donde se almacenan? en codigo no? y tienen que ser por año [...]
> 3. Eso vamos a ponerlo con un checkbox y que el usuario ponga el valor pero por defecto ponemos 20 y tiene
> que estar entre 0 y 20. 4. Dejalo afuera por el momento. 5. Eso esta para el sector de la cultura y vamos a
> dejarlo fuera.

- `ESCALAS_ISR` es un mapa por año en `onat-calculations.ts`; `impuestoEscala` y `cierreAnual` reciben el
  ejercicio y caen a la última escala publicada.
- Canal de pago: se marcará por obligación al pagar, con una explicación en pantalla de por qué se pregunta.
- Gastos sin comprobante: casilla + valor, por defecto 20, rango 0–20.
- Fuera: sector cañero y filas 56–68 (cultura).

**L7** — Verificación: `app/onat` 130 tests, typecheck sin errores.

**L8 (2026-10-28)** — T2 entregado por el worker y verificado por el padre.
- `configurations.tsx` migrado de `onat-storage` a `onat-vector`: selector de año (año actual + 4 anteriores),
  campo RC-05, identidad y actividades por año, y guardado que conserva obligaciones, bonificaciones, gastos
  sin comprobante y correcciones del ejercicio.
- La tabla de tributos con su % **no va en esta pantalla**: el porcentaje viene en el CSV, así que la fila de
  la tarea se corrigió.
- Defecto encontrado por el worker y corregido por el padre: `normalizarBonificaciones` no estrechaba el tipo
  de `valor` y `tsc` fallaba (`TS18046`). Se resolvió con un predicado de tipo.
- Verificación: `pnpm typecheck` OK; `pnpm lint` OK; `app/onat` **143 tests**.
