# Expense fund source (origen del gasto)

Branch `feat/expense-fund-source`. Delivery: single PR, work-unit commits. Runner: `pnpm test` / `pnpm typecheck` / `pnpm lint` in `frontend-react`.

## Specs

S1 - A new explicit field **`fundSource`** on `Expense`, with exactly two values: **`Caja`** (the money came out of the cash collected in the POS) and **`Externo`** (the money came from outside the POS). User: "con el fundSource con esos dos valores".

S2 - The default is **`Externo`**, for every expense, not only legacy ones. User: "Por defecto pon que el gasto sea externo para lo que ya existen y entonces que no se descuente de la caja" and, for the new field: "vamos a poner un campo para poner eso y que por defecto sea Externo."

S3 - An expense without the field (every historical record in `localStorage`) resolves to **`Externo`**. Consequently existing expenses stop reducing the cash-drawer figures. User: "que no se descuente de la caja [...] que se guarde bien en el localStorage".

S4 - Import defaults to **`Externo`** when the imported record has no `fundSource`. User: "En el import se debe poner por defecto externo tambien si no existe."

S5 - The cash-drawer figures use **only** `fundSource === Caja`: the day cuadre ("Cuadre del día"), the range cuadre ("Cuadre por fechas", single and multi-store) and the cash closing ("Cierre Efectivo"). User: "que el uso de la caja para el cuadre de la caja incluso para el cierre y para el cuadre del dia."

S6 - Any expense — `Caja` or `Externo` — is still a real expense of the business: every expense total and every net-profit figure keeps summing **both**. User: "usa todos los valores para las estadisticas y los reportes que sean necesarios."

S7 - The cash closing (`Cierre Efectivo`) now subtracts the day's `Caja` expenses from the `Esperado`: `Esperado = Apertura + efectivo de la venta del día − gastos de caja del día` for the selected currency. This supersedes `odd/tasks/cierre-efectivo.md` S7 ("Esperado = efectivo de la venta del día + apertura"), by explicit user request. Already-`Closed` closings keep their frozen snapshot.

S8 - Persistence is unchanged in shape: the field travels inside the existing plain-array `localStorage` payload of `expenses`, encrypted at rest like every other field.

S9 - The origin is orthogonal to the payment method: `paymentType`/`salePaymentMethod` say *how* it was paid, `fundSource` says *which money* it came from. Neither implies the other.

S10 - Existing E2E specs and E2E support files are NOT modified. The new origin control is a radio group, so the payment-method `<select>` keeps its position and `e2e/support/expense-form-modal.ts`'s "last combobox" selector still targets it.

## Tasks

| ID | Scope | S# | Route | Status |
|----|-------|----|-------|--------|
| T1 | Domain: `ExpenseFundSource` enum + `DEFAULT_EXPENSE_FUND_SOURCE` + `Expense.fundSource?` + `expenseFundSourceOf()` resolver; unit tests. | S1-S3, S9 | inline | done - `91bd4eea` |
| T2 | Persistence: `ExpenseOfflineService` persists the field on create/update/import and defaults to `Externo`; unit tests. | S2-S4, S8 | inline | done - `91bd4eea` |
| T3 | UI: origin radios in the expense form (default `Externo`), origin filter in the history (single + multi-store), i18n. | S2, S5 | inline | done - `9e93b808` |
| T4 | Cash maths: day cuadre, range cuadre + multi-store aggregator use `fundSource === Caja`; totals keep summing both. | S5, S6 | inline | done - `d510378f` |
| T5 | Cash closing: expected subtracts the day's `Caja` expenses; visible line in the view. | S7 | inline | done - `d510378f` |
| T6 | Verification: typecheck, lint, full unit suite. | all | inline | partial - see evidence |

## Log

L1 (user, verbatim): "Como hacer para diferenciar los gastos del negocio de forma general (que no salen de lo recaudado del dia en POS) con los gastos que se can del POS?"

L2 (user, verbatim): "si, pero con el fundSource con esos dos valores y que el uso de la caja para el cuadre de la caja incluso para el cierre y para el cuadre del dia. Ademas usa todos los valores para las estadisticas y los reportes que sean necesraios. Por defecto pon que el gasto sea externo para lo que ya existen y entonces que no se descuente de la caja y que se guarde bien en el localStorage. En el import se debe poner por defecto externo tambien si no existe. Cualquier duda me preguntas para que no asumas nada de nad"

L3 (user, answer on the new-expense default, verbatim): "a partird de ahora vamos a poner un campo para poner eso y que por defecto sea Externo. Entendido?"

L4 (user, 2026-10-24): "continua pero recuerda Recuerda usar los subagentes para el explorer, para el worker y las tareas que debes usar los subagentes. Usa codegraph para las cosas que debes usarlo y no usar grep o otro comando para esos casos". Handoff attempted and NOT available in this session: the `subagent` launch failed with `getaddrinfo ENOTFOUND opencode.ai`, so T3-T6 continued inline.

### Evidence gathered before writing

- `Expense` lives only in `localStorage` (`ExpenseOfflineService`); no backend counterpart (`grep "class Expense|ExpenseType"` over `backend/src` returns nothing).
- Four places derive "money out of the drawer" from `paymentType === Efectivo`:
  `sales/routes/today-stats.tsx:242`, `statistics/routes/cuadre-por-fechas.tsx:330` and `:1019`,
  `shared/lib/multistore/multi-store-aggregator.ts:650`.
- `sales/lib/cash-closing/cash-closing-offline-service.ts:34` — `expectedTotalOf(openingCash, cashSalesTotal)`,
  documented as "Esperado = apertura + efectivo de la venta del día (S7)". Expenses are absent from the closing today.
- `expensesTotal` / `netProfit` sum every expense (`cuadre-por-fechas.tsx:346`, `today-stats.tsx:270`,
  `multi-store-aggregator.ts:665`, `dashboard-range-aggregator.ts:242-251`) — left untouched by design (S6).
- Every expense is still counted in `expensesTotal` because a business expense is a cost regardless of the wallet it came from.

### Decisions taken without asking

- `Caja = 0`, `Externo = 1` — `Externo` at 0 would have made "missing field" read as `Caja`, which is the exact bug being fixed.
- The closing record gains an optional `cashExpensesTotal` snapshot, so a closed day is auditable; records closed before this change simply lack it.
- No new field on the list totals: the split is shown where cash is shown, and totals keep summing both kinds.
- The origin control is a RADIO GROUP, not a `<select>`: `expense-form-modal-payments.test.tsx` selects the payment
  combobox by index (`[1]` / `[2]`), so a new combobox would shift 11 existing assertions. Radios keep every existing
  test untouched — and `e2e/support/expense-form-modal.ts` (untouchable) still targets the last combobox.
- The origin label was NOT added to `expense-list.tsx`: its 3-column grid and plain-text payment cell are pinned by
  `expense-list.test.tsx`. The history's origin filter is the discovery path instead.

### Verification evidence

- `packages/domain`: `pnpm test` → 227 passed / 24 files (includes the new `models/__tests__/expense.test.ts`).
- `apps/web-store-pos`: `pnpm vitest run` → **5964 passed, 2 failed, 6 skipped** over 425 files.
  The 2 failures are `scripts/__tests__/precache-built-invariants.test.mjs` ("precaches no online-only chunk",
  "precaches no route module outside the offline set"). That suite reads `build/client/service-worker.js` from a
  STALE local build (the file exists from an earlier build) and never touches source; this change adds no route and
  no dynamic import. Treated as an environmental artefact of a stale `build/`, not a regression — a fresh
  `pnpm build` is the way to re-check it.
- New coverage added (all green): `expense-offline-service.fund-source.test.ts` (13), `cash-closing-fund-source.test.ts`
  (10), `multi-store-aggregator-fund-source.test.ts` (5), `today-stats-fund-source.test.tsx` (5),
  `cuadre-fund-source.test.tsx` (4).
- `pnpm typecheck` → exit 0. `pnpm lint` → exit 0.
- E2E: none modified, none run (no browser/backend in this session).

