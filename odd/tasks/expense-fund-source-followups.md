# Expense fund source — RDD follow-ups

Branch `feat/expense-fund-source`. Delivery: work-unit commits. Runner: `pnpm test` / `pnpm typecheck` / `pnpm lint` in `frontend-react`.

Follow-up of `odd/tasks/expense-fund-source.md`, driven by the 14 advisory findings of the approved RDD review
(lineage `review-98515af4d619796a`, authority burned at `sha256:07cea2b3`). All are non-blocking; the user asked for
all of them as separate work.

## Specs

S1 - `R1-001` — an import that OMITS `fundSource` must not downgrade an existing local `Caja` classification.
    Only an explicit incoming value overwrites it; a genuinely new imported record still defaults to `Externo`
    (unchanged `expense-fund-source` S4).

S2 - `R2-CASH-ORIGIN-PREDICATE-DUP` — the rule "this expense's money came out of the drawer" moves to ONE named
    domain predicate, `isCashDrawerExpense`, and every consumer uses it.

S3 - `R2-FUND-SOURCE-I18N-DUP` + `R2-HISTORY-LABEL-MAP` — one typed origin catalogue (`value` + `messageId`) shared by
    the expense form and the history filter; no `Record<string, string>` with a string sentinel.

S4 - `R2-CLOSING-EXPENSES-RECOMPUTE` — the closing view and the closing record read the Esperado and the cash expenses
    from ONE service call, so the displayed "Gastos de caja" line cannot diverge from what was subtracted.

S5 - `R2-TEST-MAGIC-ENUM-LITERALS` — the new fixtures use `ExpenseType` / `PaymentType` members, not bare numbers.

S6 - `R3-1` — the expense form's origin control is covered: a new expense defaults to `Externo`, a legacy expense with
    no field shows `Externo`, and choosing `Caja` reaches the save payload.

S7 - `R3-2` — the history origin filter is covered: selecting `Caja` / `Externo` / all narrows the rendered rows.

S8 - `R3-3` — the closing's visible "gastos de caja" line is covered, including the zero-expense case.

S9 - `R3-4` — the label `Gastos de caja` is KEPT (the figure inside "Resumen Efectivo" is no longer all expenses) and is
    now pinned by a test, so the user-visible change is deliberate and protected instead of unverified.

S10 - `R3-5` — the cuadre test stops extracting the panel amount through a CSS class; it asserts on the panel's text.

S11 - `R3-6` — the contradictory test title is corrected: a `Caja` expense IS subtracted regardless of the payment
    method, because the origin is what counts.

S12 - `R3-7` — the closing test pins a fixed local day key instead of reading the wall clock at module load.

S13 - `R2-HISTORY-DOUBLE-FILTER` — re-examined and NOT reproducible: the fund-source filter is applied once per render
    branch (multi-store `visibleExpenses`, single-store `fundFilteredDayGroups`), and the two branches are mutually
    exclusive. No code change; recorded here as a rejected finding with evidence.

## Tasks

| ID | Scope | S# | Route | Status |
|----|-------|----|-------|--------|
| T1 | Domain predicate + shared origin catalogue; five consumers switched. | S2, S3 | inline | pending |
| T2 | Import merge preserves the local classification when the payload is silent. | S1 | inline | pending |
| T3 | Closing breakdown returned by one call (view + snapshot). | S4 | inline | pending |
| T4 | New component tests: form origin control, history origin filter, closing line. | S6-S8 | deferred writer | pending |
| T5 | Fix my own new tests: enum literals, panel query, title, fixed day, label pin. | S5, S9-S12 | inline | pending |
| T6 | Full checks + RDD re-assessment. | all | inline | pending |

## Log

L1 (user, verbatim): "aplica todos esos hallazgos como trabajo a aparte"

L2 (user, verbatim): "continua pero recuerda Recuerda usar los subagentes para el explorer, para el worker y las tareas que debes usar los subagentes. Usa codegraph para las cosas que debes usarlo y no usar grep o otro comando para esos casos"
