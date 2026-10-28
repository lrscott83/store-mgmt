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

**S9 — Solo frontend.** Sin backend, sin endpoints. Persistencia por Owner y año en `localStorage`.

## Tasks

| ID | Tarea | Specs | Estado |
|---|---|---|---|
| T1 | Modelo `OnatVector`, parser/serializador CSV, persistencia por año, marcar pagado | S1–S8 | done — verificado |
| T2 | UI Configuraciones: selector de año, RC-05, tabla de tributos con su % | S1,S3,S8 | pendiente |
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
