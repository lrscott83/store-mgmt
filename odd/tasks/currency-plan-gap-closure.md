# currency-plan-gap-closure

Close the three gaps found while verifying `docs/plans/2026-09-16-currency-in-costs-and-prices-plan.md`
against commit `807b9063`. Implementation is already complete; these are coverage and regularization gaps.

Source of truth for the plan: `docs/plans/2026-09-16-currency-in-costs-and-prices-plan.md`.

## Constraints

- Do NOT touch E2E tests (`frontend-react/e2e/**` Playwright specs, `backend/src/SMCA.WebApi.E2ETests/**`).
- Do NOT modify production source code. Gap 1 adds tests only; gaps 2 and 3 are test/comment-only edits.
- Existing unit tests must stay green.

## Tasks

- [x] T1 (gap 3) — Fix the UTC/local-day helper in `store-usage-tracker.test.ts`
  - `today()` at line 28 uses `toISOString()` (UTC) while production stamps the LOCAL day (USAGE-7).
    Fails 7 tests in the ~20:00-24:00 EDT window. Align with the local-day helper already used at line 80
    (`toLocaleDateString('en-CA')`).
  - File: `frontend-react/apps/web-store-pos/app/shared/lib/usage/__tests__/store-usage-tracker.test.ts`
  - Evidence: `npx vitest run app/shared/lib/usage/__tests__/store-usage-tracker.test.ts` → 0 failed.
    DONE: `today()` now uses `toLocaleDateString('en-CA')` (local day) with a comment on why.
    Verified: usage + products focused run → 2 files, 106 tests passed, 0 failed.

- [x] T2 (gap 2) — Regularize the `products.tsx` CSV currency plumbing
  - The plan excluded view changes, but `currency: row.currency` in `handleCsvImport` is required for the
    CSV `moneda`/`currency` column to reach `createCsvProducts(csvProducts: CsvProduct[])`; reverting would
    silently drop the column. Keep it and document why it is data plumbing, not a UI change.
  - File: `frontend-react/apps/web-store-pos/app/sales/routes/products.tsx`
  - Evidence: focused `products.test.tsx` stays green.
    DONE: kept the line (reverting would break the CSV column) and added a 3-line comment stating it is
    data plumbing, not a UI change. Verified in the same focused run.

- [x] T3 (gap 1) — Add factory stamping tests for order, sale credit and expense
  - STATUS: done. Executed INLINE — `gentle-ai-worker` failed twice in this environment
    ("assistant reported an error", 1 turn, 0 tool calls). Fallback per the Work Routing Ladder.
  - Plan §5 requires every factory to stamp `currency: DEFAULT_CURRENCY` (CUP). Products, inventory
    entries, warehouse movements and CSV already have coverage; orders, sale credits and expenses do not.
  - Files (tests only):
    - `frontend-react/apps/web-store-pos/app/sales/lib/services/__tests__/order-offline-service.test.ts`
    - `frontend-react/apps/web-store-pos/app/sales/lib/services/__tests__/sale-credit-offline-service.test.ts`
    - `frontend-react/apps/web-store-pos/app/expenses/lib/services/__tests__/expense-offline-service.test.ts`
  - Evidence: the three files pass; new assertions fail if the `currency: DEFAULT_CURRENCY` lines are removed.
    DONE: `ORD-20` (Order + every OrderItem, plus roster-import round-trip of `Currency.MLC`),
    `SC-13` (SaleCredit + roster-import round-trip of `Currency.EUR`),
    `currency stamping` (Expense + roster-import round-trip of `Currency.USD`).
    Mutation check: deleting the three production stamping lines → exactly 3 new tests fail
    (`expected undefined to be +0`); production files restored byte-for-byte (git status clean of them).
    Focused run: 3 files, 233 tests, 0 failed, 0 type errors.

- [x] T4 — Verify the closure
  - Focused vitest on the four touched test files.
  - Full `npx vitest run` in `frontend-react/apps/web-store-pos` → 249/249 files, 0 failed.
  - `npx vitest run` in `frontend-react/packages/domain` → unchanged green.
  - `dotnet build backend/src/SMCA.sln` + `Domain.UnitTests` + `Application.Tests` → unchanged green.
    DONE (all inline — `gentle-ai-verify` also failed to launch in this environment):
    - `npx vitest run` (web-store-pos, FULL): 249 files / 3587 tests, 0 failed, 0 type errors
      (previously 7 failures in `store-usage-tracker.test.ts`; +6 new tests over the 3581 baseline).
    - `npx vitest run` (packages/domain): 13 files / 108 tests, 0 failed.
    - `npx tsc --noEmit` exit 0; `npx eslint . --max-warnings=0` exit 0.
    - `dotnet build` → Build succeeded, 0 errors; Domain.UnitTests 27 passed; Application.Tests 482 passed.
    - `git status --short` → only the 5 intended files modified + untracked `odd/`; no production or E2E file.

- [ ] T5 — Native review preflight (RDD reads ON globally)
  - BLOCKED on provider billing: the reviewer model run cannot execute. Lineage IS created and intact;
    the review is not burned, not approved, and not closed.
    `gentle_review inspect` → `ready`, route `execute → review.start` (target
    `sha256:b6ee7866…ef13b`, 5 paths, untracked scope `exclude`). START then failed as a native
    operation: `outcome: native-operation-failed`, phase `candidate-view`, category `git-failure`,
    `git_subcommand: checkout-index`, with `lineage_created: false` and `mutation_performed: false`
    (`mutation_outcome: none`). No lineage exists and nothing was mutated, so START was NOT retried.
  - Root cause (proven read-only, does not mutate config): the candidate view materializes the frozen
    tree under a `%TEMP%` prefix, and this repo's deep paths exceed the Windows MAX_PATH limit because
    `core.longpaths` is unset (both repo-local and global). Reproduced directly:
    `git checkout-index --prefix=<134-char temp prefix>/ -- frontend-react/.../sale-credit-offline-service.test.ts`
    → `error: unable to create file …: Filename too long`; the identical command with
    `git -c core.longpaths=true` succeeds. Windows `LongPathsEnabled` is already `1`, so Git only needs
    the opt-in. Longest tracked path in this repo: 164 chars (`frontend/src/.../inventory-today-sales-profit-help-dialog.component.spec.ts`).
  - Options presented to the user: enable `core.longpaths` (repo-local or global) and retry START, or
    skip the review for this candidate.
  - RESOLUTION: the user chose repo-local `core.longpaths=true`; applied (`file:.git/config`) and the
    START then succeeded: lineage `review-ed139537229ed88c`, state `reviewing`, generation 1, tier
    `medium`, 5 changed files, 112 original changed lines, correction budget 56, one lens
    (`review-reliability`).
  - FINAL STATE — blocked on the reviewer model run (external cause, not this code):
    STATUS action `collect`, reason `reviewer_results_required`, one materialize reviewer slot
    (`--lens=review-reliability --order=0`). Forecast returned one model run via `pi_host_relay`
    (relayed to the user); the acknowledged run then failed at transport level:
    `outcome: pi-host-relay-transport-failure`, `kind: pi-failed`, `exit_code: 1`,
    `401 {"type":"CreditsError","message":"No payment method. Add a payment method here:
    https://opencode.ai/workspace/wrk_01M2612YTQWDF9PTYW9X1G078P/billing"}`,
    `prepared_reviewers: 0`, `submitted_reviewers: 0`, `mutation_performed: false`.
  - A fresh bound STATUS confirms the lineage is unchanged and still `reviewing` at the same revision
    (`sha256:368fa1ce…`), reoffering the same single binding. Nothing was admitted, so no acknowledgement
    was possible and the capture was NOT replayed. Relaunching would fail identically until the workspace
    has a payment method.
  - To resume once billing is fixed: bound STATUS, then submit the exact reoffered one-slot binding to
    `gentle_review_capture` (or the group tool) with `reviewerRunAcknowledged: true`.

## Out of scope

- Backend: no changes needed (already complete and green).
- Doc drift: the plan header still reads "pendiente de implementación" — flagged to the user, not edited here.

## Cierre — commits (2026-09-16)

Plan eliminado y trabajo commiteado en `dev`, 3 commits por unidad de trabajo:

| Commit | Contenido |
| --- | --- |
| `fb2716ad` | `test(web-store-pos)`: cobertura de estampado CUP en order / sale-credit / expense + comentario en `products.tsx` |
| `18772b88` | `test(web-store-pos)`: helper de dia local en `store-usage-tracker` (fin del flake nocturno) |
| `db55a577` | `chore`: ignora `odd/` y elimina el plan ya implementado |

- Plan recuperable: `git show 807b9063:docs/plans/2026-09-16-currency-in-costs-and-prices-plan.md`
- `odd/` agregado a `.gitignore` (`.gitignore:176`), junto a `.pi/` — decision del usuario: es estado local del harness, no se commitea.
- Verificacion post-commit en HEAD: 4 archivos, 268 tests, 0 fallos, 0 errores de tipo.
- Lineage `review-ed139537229ed88c` queda sin cerrar (bloqueo externo de billing del provider); el diff de workspace ya no existe, asi que un review futuro necesita rango commiteado.

## T5 — preflight de revision (resultado final)

Lineage `review-abdd45117ac1a94f`: `state: reviewing`, generacion 1, revision
`sha256:44b1558bc2df21c491f09578862041a8a0d09e92aa7129178b14e9f477c7e765`, tier `high`,
4 lentes, 80 archivos / 8555 lineas, presupuesto de correccion 200.

- El candidato que congelo el provider NO es este trabajo: es el rango
  `36055117..HEAD` (7 commits, 80 archivos), porque al commitear todo el
  workspace quedo vacio y el provider anclo el target a un rango commiteado.
- Las 4 corridas de reviewer fallaron en el transporte:
  `401 CreditsError - No payment method`
  (workspace `wrk_01M2612YTQWDF9PTYW9X1G078P`), `prepared_reviewers: 0`,
  `submitted_reviewers: 0`, `mutation_performed: false`.
- STATUS fresco reofrece los mismos 4 bindings sin cambios: el lineage queda
  abierto e intacto. Tras agregar un metodo de pago, reenviar los mismos
  bindings con `reviewerRunAcknowledged: true` (no hacer replay desde el
  transcript).
- Estado del entregable: commiteado y verificado por evidencia propia
  (268 tests en HEAD), **sin veredicto de reviewer**.
