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
| T1 | Domain predicate + shared origin catalogue; five consumers switched. | S2, S3 | inline | done - `2a29232e` |
| T2 | Import merge preserves the local classification when the payload is silent. | S1 | inline | done - `2a29232e` |
| T3 | Closing breakdown returned by one call (view + snapshot). | S4 | inline | done - `2a29232e` |
| T4 | New component tests: form origin control, history origin filter, closing line. | S6-S8 | inline (deferred writer unavailable) | done - see evidence |
| T5 | Fix my own new tests: enum literals, panel query, title, fixed day, label pin. | S5, S9-S12 | inline | done - `2a29232e` |
| T6 | Full checks + RDD re-assessment. | all | inline | done - see evidence |

## Log

L1 (user, verbatim): "aplica todos esos hallazgos como trabajo a aparte"

L2 (user, verbatim): "continua pero recuerda Recuerda usar los subagentes para el explorer, para el worker y las tareas que debes usar los subagentes. Usa codegraph para las cosas que debes usarlo y no usar grep o otro comando para esos casos"

L3 (user, verbatim): "para que los permisos fuera de la carpeta?" — I had chained two workspaces with `cd ../../`; from then on every command uses an explicit `workdir` inside its own package.

### Delegation note

The 3 test suites of T4 were delegated to a `gentle-ai-worker` and NOT executed by it: the launch failed with
`Free usage limit reached. Subscribe to OpenCode Go to keep going`. T4 was then written inline. The worker brief was
bounded to the three new test files with production code excluded.

### Verification evidence

- New coverage (all green): `expense-form-modal-fund-source.test.tsx` (6), `expenses-history-fund-source.test.tsx` (4),
  `cash-closing-fund-source-line.test.tsx` (4) → 14 tests.
- `apps/web-store-pos`: `pnpm vitest run` → **5980 passed, 2 failed, 6 skipped** over 428 files. The 2 failures are the
  same pre-existing `scripts/__tests__/precache-built-invariants.test.mjs` pair that reads a stale `build/client`.
- `packages/domain`: `pnpm build` + `pnpm test` → clean (227 passed).
- `pnpm typecheck` → 0. `pnpm lint` → 0.
- E2E: none modified, none run.

### RDD outcome (this slice)

- `assess --base-ref f897bc12 --committed-only` → `medium`, `review_due: false` (`under_budget`). The user asked for
  the review anyway (L4).
- Lineage `review-1bb4904a38a4ecb4`, target `sha256:b3dca8e8…`, lenses `risk`, `readability`, `reliability`.
- Result: **approved**, authority **burned** (`gentle-ai.review-acknowledged/v1`, revision `sha256:52461f7b…`).
- 5 advisory findings, all non-blocking:
  - `R2-orphan-fund-source-comment` (readability): the comment left at `expense-form-modal.tsx:169` after extracting the
    catalogue now floats with nothing to document.
  - `R2-silent-fund-source-fallback` (readability): `fundSourceMessageId` falls back to the `Externo` id for an unmapped
    enum member instead of failing loudly; an exhaustive `Record` would surface a gap.
  - `R2-wall-clock-day-key-reintroduced` + `R3-1` (reliability): `cash-closing-fund-source-line.test.tsx:29` re-derives
    `DAY` from `new Date()` at module load while seeding rows with the wall clock — the very pattern S12 removed from its
    sibling.
  - `R3-2` (reliability): switching from `panelAmount` to `toHaveTextContent('70 CUP')` weakened the cuadre assertions to
    a substring match (`'170 CUP'` would pass).
- The `risk` lens returned **no findings**.

### RDD outcome (test-hardening slice)

- Candidate: `f363ff95` over `558b7bff` (3 paths, 56 lines), lens `reliability`.
- Result: **approved with ZERO findings**. Lineage `review-1fc48d5b4a2ca158`, authority **burned**
  (`gentle-ai.review-acknowledged/v1`, revision `sha256:cb44eaae…`).
- The reviewer confirmed the noon-anchored day removes the wall-clock skew and that the anchored regex no longer lets
  `170 CUP` satisfy a `70 CUP` expectation.


L4 (user, verbatim): "dale con RDD"

### Process note

Two combined vitest invocations hung for 10 minutes. Cause: my `useMultiStore` mock returned a NEW `{ enabled, stores: [] }`
object on every render, and the history page's per-store effect depends on `stores`, so it re-ran forever. Fixed by
hoisting a stable `multiStoreState`. The orphaned `node` workers of those runs were killed (only processes started after
the hang began), never the pre-existing dev-server ones.
