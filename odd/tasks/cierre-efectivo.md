# Cierre Efectivo — cierre de caja diario por efectivo

Feature: **cierre-efectivo**. Branch: `feat/cierre-efectivo`. Delivery: `ask-on-risk`.
Runner: `pnpm --filter @store-mgmt/web-store-pos test` (vitest) + `pnpm --filter @store-mgmt/web-store-pos typecheck`.

Objetivo: una vista de **Cierre Efectivo** que cuadre el **efectivo** del día (solo efectivo,
sin Transferencia ni Zelle), con Apertura + conteo por denominaciones, Esperado/Contado/Diferencia,
estado Abierta→Cerrada y comentario obligatorio cuando no cuadra.

## Specs

- **S1** — El cierre cuadra **solo efectivo**: `"solo el efectivo y nada de las transferencias ni Zelle"`.
  Órdenes del día con método resuelto `Efectivo` y `!isCredit`; nunca Transferencia/Zelle.
- **S2** — Se guarda **por el día actual con estado**: un registro por (día local, moneda), editables
  durante el día (`Abierta`); `"Cerrar Caja"` lo pasa a `Cerrada` (congelado, no editable).
- **S3** — Botón **`"Cerrar Caja"`** en el header **de la vista** (`Cierre Efectivo`), alineado a la
  derecha, que **muestra una confirmación** antes de cerrar.
- **S4** — Si el efectivo **no cuadra** (`Diferencia ≠ 0`) el **comentario es obligatorio** para poder cerrar.
- **S5** — Menú **`"Cierre Caja"`** justo **debajo del menú `"Vender"`** (grupo VENTA, `moduleId: Sales`,
  gate `EFeatures.Sale`, misma autorización que Vender).
- **S6** — Vista con header (título de tarjeta) **`"Cierre Efectivo"`**.
- **S7** — Resumen con **`"Esperado"` (`efectivo de la venta del día + apertura`)**, **`"Contado"`** y **`"Diferencia"`**.
- **S8** — **Diferencia**: negativa se muestra con signo `-` y en **rojo**; positiva o cero en **verde**.
- **S9** — Textbox para el valor de la **Apertura** del día.
- **S10** — Card **`"Conteo"`**: denominaciones de billetes alineadas a la izquierda, en el centro botón `-`,
  textbox de cantidad (empieza en `0` y el `0` se puede borrar), botón `+`, y a la derecha el total
  `denominación × cantidad`.
- **S11** — Denominaciones de **mayor a menor**, y se permite **agregar una denominación nueva**.
  Defaults: `20 000, 10 000, 5 000, 1 000, 500, 200, 100, 50, 20, 10, 5 y 1`.
- **S12** — La vista **puede llenarse durante el día** para que el usuario tenga una idea de cómo va.
- **S13** — (decisión owner) **Multimoneda**: un registro por **día y moneda**; selector de moneda.
  Denominaciones **por moneda**, guardadas **por tienda**: CUP trae los defaults de S11, las demás
  arrancan vacías y se agregan.
- **S14** — (decisión owner) Persistencia **local en el dispositivo + export/import** (nueva entidad
  offline por tienda, opcional en el serializador/sincronizador, encajada en `BUSINESS_ENTITY_NAMES`).

## Assumptions (marcadas, corregibles)

- **A1** — El botón `Cerrar Caja` vive en el header **de la vista** (no en el navbar global): así se
  respondió a la pregunta de visibilidad ("Solo en la vista Cierre Efectivo").
- **A2** — `Contado` = suma de `denominación × cantidad` del conteo.
- **A3** — `Diferencia` = `Contado − Esperado`.
- **A4** — "No cuadra" = `Diferencia ≠ 0` (se compara con tolerancia de centavos).
- **A5** — Comentario opcional cuando cuadra; obligatorio cuando no cuadra.
- **A6** — Sin MultiMonedas (o una sola moneda), la vista trabaja solo en CUP sin selector.

## Tasks

| ID | S# | Ruta | Estado | Evidencia |
|----|----|------|--------|-----------|
| T1 | S1,S2,S9,S11,S13,S14 | inline | done | `app/sales/lib/cash-closing/cash-closing-types.ts`, `.../cash-closing-offline-service.ts`, `BUSINESS_ENTITY_NAMES` — commit `42ee1bfb` |
| T2 | S14 | inline | done | `data-serializer-service.ts`, `data-synchronizer-service.ts`, `sync/routes/{export,import}.tsx` — commit `c96c4a46` |
| T3 | S3,S6,S7,S8,S9,S10,S12 | inline | done | `app/sales/routes/cash-closing.tsx` (+ `denomination-count-card.tsx`) — commit `e3ad2420` |
| T4 | S5,S6 | inline | done | `menu-config.ts`, `i18n/es.ts`, `routes.ts` — commit `e3ad2420` |
| T5 | todas | inline | done | `__tests__/cash-closing-offline-service.test.ts`, `routes/__tests__/cash-closing.test.tsx`, `sync` round-trip tests |
| T6 | todas | inline | done | typecheck + lint + suite completa (5548 passed, 6 skipped) |

## Log

- **L1 (2026-10-14, verbatim)** — "Lo de cerrar la caja con el efectivo de apertura para el cuadre del
  efectivo de la venta del dia, solo el efectivo y nada de las transferencias ni Zelle, que se este
  guardando por el dia actual con el estado porque al final al que decir "Cerrar Caja" que este como
  boton en el header a la derecha y que muestre una confirmación. En caso que no cuadre el efectivo debe
  tener como obligatorio un comentario. Menu "Cierre Caja" debajo del menu Vender. Debe mostrar una vista
  con el header "Cierre Efectivo". Debajo un resumen donde esté el valos "Esperado" (efectivo de la venta
  del dia + apertura), "Contado" y "Diferencia". En el valor de la diferencia si es negativo se pone con
  el sigo de - y en rojo y si es positivo o cero se pone en color verde. Debajo un textbox para poner el
  valor de la Apertura del día. Debajo un card con "Conteo" donde se pondran las denominaciones de los
  Billetes alineado a la izquierda, en el centro boton de -, un textbox para poner la cantidad que es un
  numero que enpieze en 0 pero que se pueda eliminar el cero para poner otro numero y el botón de +, y
  alineado a la derecha la cantidad total que serai denominacion * cantidad. Las denominaciones se pondran
  de mayor a menor y tambien se permitira poner una denominación nueva. Por defecto tendremos: 20 000,
  10 000, 5 000, 1 000, 500, 200, 100, 50, 20, 10, 5 y 1. Esta vista puede irse llenando durante el dia
  para que el usuario tenga una idea de como va la cosa. Si tienes alguna pregunta me dices para no asumir
  nada de nada."
- **L2** — Contexto: existe `docs/plans/sesion-de-caja-apertura-cierre-pos.md` (investigación por turnos,
  2026-07-24) y `docs/plans/imagenes-manual-referencia-pos.md` (capturas 14/15). El pedido de L1 es una
  versión **diaria y más simple**; se implementa L1, no el plan por turnos.
- **L3** — Decisiones del owner (respuestas 2026-10-14): Esperado = solo ventas Efectivo del día;
  **Multimoneda = un registro por día y moneda**; persistencia **local + export/import**; estados
  Abierta→Cerrada congelada; botón solo en la vista; denominación nueva **se guarda por tienda**.
- **L4 (evidencia)** — Verificación inline:
  - `pnpm --filter @store-mgmt/web-store-pos typecheck` → OK.
  - `pnpm --filter @store-mgmt/web-store-pos lint` (`--max-warnings=0`) → OK.
  - `pnpm --filter @store-mgmt/web-store-pos test` → **375 files / 5548 passed, 6 skipped**.
  - Tests nuevos: 13 de servicio (`cash-closing-offline-service.test.ts`), 3 de vista
    (`cash-closing.test.tsx`), 4 de serializador (T11) y 3 de sincronizador — 23 en total.
- **L5 (cambios en tests existentes)** — 4 tests unitarios existentes fijaban la forma exacta del
  registro de entidades y del ZIP de sync; se actualizaron para incluir `cashClosings` /
  `cash-closings.json` (dieciséis→diecisiete entidades; 13→14 entradas de datos). NO se tocó
  ningún E2E ni test de `frontend-react/e2e/`.
- **L6 (riesgo)** — `Risk: none` — entidad y entradas NUEVAS (guardar registros nuevos no es el
  ítem 1); el formato de archivo de sync es aditivo y opcional (archivos legacy importan como store
  vacío), no rompe contratos existentes (ítem 3 no aplica a agregados opcionales). Sin seguridad,
  concurrencia ni entrega implicadas.
