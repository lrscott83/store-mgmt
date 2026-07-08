# Tasks: service-return-shape-parity — Slice 2 (Expense)

Governs spec #713, design #714. Strict TDD: every method/behavior = RED→GREEN. Angular source of
truth: `frontend/src/app/application/expenses/expense-offline.service.ts` (+
`domain/entities/expenses/expense.errors.ts`). React target:
`frontend-react/apps/web-store-pos/app/expenses/lib/services/expense-offline-service.ts`.
Delivery: commits-only directly on `feat/frontend-parity-audit`, no PRs, no branches, no stacking
(per explicit instruction for this batch — matches Slice 1's resolved delivery mode).

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~480-620 (WU1 ~30; WU2 ~180; WU3 ~90; WU4 ~180; test rework ~140 folded into WU2-4) |
| 400-line budget risk | High |
| Chained PRs recommended | No — delivery is commits-only per instruction, not PR-chained |
| Suggested split | WU1 → WU2 → WU3 → WU4 → Final regression, one commit per unit |
| Delivery strategy | commits-only (explicit instruction, supersedes ask-on-risk default) |
| Chain strategy | size-exception (single branch, sequential commits, no PR chain requested) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units (commit boundaries)

| Unit | Goal | Commit type | Dependency |
|------|------|-------------|------------|
| 1 | `ExpenseErrors` domain port (packages/domain) | feat | None |
| 2 | Category D — command-method shapes + `deleteExpense` seam split + imported-D methods | feat | After WU1 |
| 3 | Category B — sync envelope `getExpensesInDay`, remove no-correlate methods | feat | After WU1 |
| 4 | Category C — async envelope + call-site closeout (today-expenses/today-stats/history) | feat | After WU2-3 |

## ⚠️ Flagged mismatches / decisions (verify at apply time)

1. **Angular bug — `getExpensesInDay(date)` ignores its own `date` param** (body always computes
   `startOfDay(new Date())`, never uses the argument). Both real callers always pass `new Date()`
   so it's currently invisible, but it's a genuine dead-parameter defect with NO external/serialized
   contract surface. Per binding convention (`frontend-parity-audit/angular-bugs-policy`, mem #648):
   MUST be FIXED in React, not replicated — `getExpensesInDay(date)` must actually filter by the
   given `date`'s day window. Zero behavior change for existing callers (both always pass "now").
   Also: Angular sorts results DESC (`e2.date - e1.date`); current React has no sort at all — add it.
2. **`getByDateRange(from,to)`/`getActiveToday()` have no Angular correlate** — invented
   generalizations of `getExpensesInDay`. Per exact-surface rule, REMOVE both; call-sites
   (`today-expenses.tsx`, `today-stats.tsx`) re-express as `await getExpensesInDayObservable(new
   Date())` — mirrors Angular's real call pattern (both Angular sites call the Observable, never
   the sync method directly).
3. **`filterExpenses` (sync, current React) has no Angular correlate** — Angular's ONLY filter
   method is the Observable `filterExpensesObservable`. Convert in place: same filtering logic,
   new name, new signature `Promise<BaseResponseModel<Expense[]>>`, same-tick resolve.
4. **`expenses-history.tsx` currently bypasses the service filter entirely** — it calls
   `getAll()` + hand-rolled `paymentType` filter instead of calling any Expense-service filter
   method (a duplicate implementation of the same rule). Angular's `ExpensesComponent` always
   calls `filterExpensesObservable(null, paymentType, null, null)` (expenseType/dates always
   null — no UI control wires them). Plan: rewire the route to `await
   filterExpensesObservable(undefined, paymentType, undefined, undefined)`, removing the
   duplicate inline filter — confirm at apply time since it changes the route's data path (output
   is provably identical: same `isActive`+`paymentType` predicate either way).
5. **`delete(id): void` vs `deleteExpense(id): Result` seam conflict** — `BaseService<Expense>`
   fixes `delete(): void` (ADR-1, outside conversion). Angular's only relevant method is
   `deleteExpense(): Result` (soft-delete, Failure on missing id — never throws). Resolution
   (precedented by Slice 1 WU2.7's `deactivate`/`delete` split): add `deleteExpense(id): Result` —
   the real Angular-named domain command, never throws — and adapt `delete(id): void` to call it,
   throwing `result.errors[0]?.description` on failure. **Behavior change**: current `delete()` is
   a silent no-op for a missing id; after this it throws (Angular's Result-Failure semantics
   surfaced through the seam's throw contract, exactly as Slice 1 did for Inventory). No current
   call-site checks `delete()`'s return or catches — `today-expenses.tsx`'s
   `handleDeleteConfirm` doesn't wrap it in try/catch today; confirm whether to add one or leave
   it (Angular's own UI also fire-and-forgets `deleteExpense` with no `.succeeded` check).
6. **`create`/`update` keep their existing short names** (not renamed to
   `createExpense`/`updateExpense`) — matches Slice 1 precedent (Inventory kept `create()`/
   `update()`, not `createInventoryEntry`). Only their return shape changes to `DataResult<Expense>`.

## WU1: `ExpenseErrors` Domain Port — Req: Category D distinctness

- [x] 1.1 RED: `packages/domain/src/errors/__tests__/expense-errors.test.ts` asserts
      `ExpenseErrors.NotExists` = `{code:'Expense.NotExists', description:'El gasto no existe.'}`
      (byte-identical port of Angular's `expense.errors.ts`).
- [x] 1.2 GREEN: create `packages/domain/src/errors/expense-errors.ts` (same `as const satisfies
      Record<string, BaseError>` pattern as `inventory-errors.ts`).
- [x] 1.3 GREEN: export from `packages/domain/src/index.ts`; `pnpm -C packages/domain build`.
- [x] 1.4 Gate: `pnpm test`, `tsc --noEmit`; commit `feat(domain): port ExpenseErrors`.

## WU2: Category D — Expense Command-Method Shapes — Req: Category D SYNC, distinct from BaseResponseModel

- [x] 2.1 RED/GREEN: `create(input): DataResult<Expense>` (was plain `Expense`) — always
      `new DataResult(expense, true, [])`; update `today-expenses.tsx` `handleSave`'s create
      branch (ignore-or-unwrap `.data`, matches Angular's insert branch which only reads
      `.data` for the emitter — React has no emitter, so just call `loadExpenses()` after).
- [x] 2.2 RED/GREEN: `update(id, patch): DataResult<Expense>` — success path
      `new DataResult(updated, true, [])`; missing-id path
      `new DataResult(undefined, false, [ExpenseErrors.NotExists])` — **never throws** (removes
      the current `throw new Error('EXPENSE_NOT_FOUND')`).
- [x] 2.3 Call-site: `today-expenses.tsx` `handleSave` — replace try/catch around `svc.update`
      with `const result = svc.update(...); if (!result.succeeded) { setModalError(...); return;
      }` (mirrors Slice 1's `today-entries.tsx` WU2.12 pattern); create branch unaffected
      besides the new `DataResult` wrapper being ignored.
- [x] 2.4 RED/GREEN: add `deleteExpense(id): Result` — real domain command (1:1 port): missing id
      → `Result.Failure([ExpenseErrors.NotExists])`; else soft-delete (`isActive=false`,
      `updatedDate`, `updatedByName`) → `Result.Success()`. Never throws.
- [x] 2.5 RED/GREEN: adapt `delete(id): void` (BaseService seam) to call `deleteExpense(id)` and
      throw `result.errors[0]?.description` on failure — preserves the seam's throw contract
      (flagged mismatch #5; confirm behavior change at apply).
- [x] 2.6 RED/GREEN: add `addImportedExpense(expense): Result` and
      `updateImportedExpense(importedExpense): Result` — 1:1 port of Angular, both always
      `Result.Success()`. Confirm no call-site migration needed (sync import/export uses raw
      `BaseRepository.upsert`, not these methods — same as Slice 1's Inventory precedent).
- [x] 2.7 Gate: `pnpm test`, `tsc --noEmit`, build; commit
      `feat(domain,web-store-pos): restore Expense category-D Result/DataResult shapes`.

## WU3: Category B — Sync `BaseResponseModel<T>` Envelope — Req: Category B SYNC

- [x] 3.1 RED/GREEN: add `getExpensesInDay(date): BaseResponseModel<Expense[]>` via
      `success()`/`failure()` from `@store-mgmt/domain` — filters `isActive` + day window derived
      from the **given** `date` param (bug-fix, flagged mismatch #1), sorted DESC by date.
- [x] 3.2 GREEN: remove `getByDateRange`/`getActiveToday` (no Angular correlate, flagged
      mismatch #2).
- [x] 3.3 Gate: `pnpm test`, `tsc --noEmit`, build; commit
      `feat(domain,web-store-pos): restore Expense category-B sync envelope`.

## WU4: Category C — `Promise<BaseResponseModel<T>>` Envelope + Call-Site Closeout — Req: Category C async, resolves never rejects

- [x] 4.1 RED/GREEN: add `getExpensesInDayObservable(date): Promise<BaseResponseModel<Expense[]>>`
      — `Promise.resolve(this.getExpensesInDay(date))`, EXACT Angular name.
- [x] 4.2 RED/GREEN: convert `filterExpenses(...)` → `filterExpensesObservable(type?, paymentType?,
      start?, end?): Promise<BaseResponseModel<Expense[]>>` — same filter logic, envelope +
      same-tick `Promise.resolve(success(...))`, EXACT Angular name; asserted via `await
      expect(...).resolves`.
- [x] 4.3 Call-site: `today-expenses.tsx` `loadExpenses` — `async`, `await
      svc.getExpensesInDayObservable(new Date())`, `.data` unwrap on `.succeeded`.
- [x] 4.4 Call-site: `today-stats.tsx` `useEffect` — wrap body in an inner async IIFE; `await
      svc.getExpensesInDayObservable(new Date())`, `.data` unwrap, guarded by `hasExpensesModule`.
- [x] 4.5 Call-site: `expenses-history.tsx` `loadExpenses` — `async`, replace `getAll()` +
      inline filter with `await svc.filterExpensesObservable(undefined, paymentType, undefined,
      undefined)`, `.data` unwrap (flagged mismatch #4; confirm at apply).
- [x] 4.6 Gate: `pnpm test`, `tsc --noEmit`, build; commit
      `feat(web-store-pos): restore Expense category-C async envelope + call-sites`.

## Test Rework Closeout (folded into WU2-4 commits)

- [x] 5.1 `expense-offline-service.test.ts`: rework `create`/`update`/`delete` assertions to
      `DataResult`/`Result` shapes (no more `toThrow()` for `update`); add blocks for
      `deleteExpense`, `addImportedExpense`, `updateImportedExpense`, `getExpensesInDay` (incl.
      the date-param bug-fix + DESC-sort), `getExpensesInDayObservable`,
      `filterExpensesObservable` (`await`/`.resolves`); remove `getByDateRange`/`getActiveToday`
      blocks.
- [x] 5.2 `expenses-routes.test.tsx`: update both mock blocks (today-expenses + history) to
      `getExpensesInDayObservable`/`filterExpensesObservable` (Promise-returning) and
      `create`/`update`/`delete` (DataResult/Result-returning); rework the "not-found" test to
      assert via `.succeeded` mock rather than a thrown error.
- [x] 5.3 `sales-routes.test.tsx` / `today-stats.test.tsx`: replace the `getActiveToday` mock with
      `getExpensesInDayObservable: vi.fn().mockResolvedValue(success([...]))` (or equivalent
      resolved envelope), confirm `TodayStatsPage`'s async effect still renders expected totals.
- [x] 5.4 Verify `expense-list.tsx`/`expense-components.test.tsx` need no rework (presentational,
      no service calls, no order-sensitive assertions — confirmed).

## Final: Full Regression Gate

- [x] 6.1 Grep-confirm no remaining bare-array/`throw`-sentinel returns on any converted method
      except `delete()`'s intentional seam-throw (flagged #5).
- [x] 6.2 Full gate — domain: `pnpm test`, `tsc --noEmit`, build clean. web-store-pos: `pnpm test`,
      `tsc --noEmit`, `pnpm build` clean.
- [x] 6.3 Update this file with commit hashes; confirm flagged mismatches #4/#5 resolutions taken.

## Status: COMPLETE (Slice 2 — Expense).

### Commit log (feat/frontend-parity-audit, commits-only)

| WU | Commit | Subject |
|----|--------|---------|
| WU1 | `668ed3f` | `feat(domain): port ExpenseErrors.NotExists (byte-identical Angular parity)` |
| WU2 | `be1b8bc` | `feat(web-store-pos): restore Expense category-D shapes (DataResult create/update, deleteExpense/imports Result)` |
| WU3+WU4 | `9f05aa5` | `feat(web-store-pos): restore Expense category-B/C envelope shapes + async call-sites` |

**WU3 and WU4 combined into one commit (deviation from the per-WU plan, justified):** WU3
removes `getActiveToday`/`getByDateRange`, whose only callers (`today-expenses.tsx`,
`today-stats.tsx`) are rewired to the async siblings by WU4. A WU3-only commit would therefore
leave the build broken (unresolved references) — violating the "each commit builds clean" gate.
Landing them together is the only ordering that keeps every commit green.

### Flagged-mismatch resolutions taken

- **#1 (getExpensesInDay date-param bug + missing sort):** FIXED — method now honors the passed
  `date` (`startOfDay(date)`) and sorts DESC. Invisible to both existing callers (pass `new Date()`).
- **#2 (getByDateRange/getActiveToday no correlate):** REMOVED; call-sites re-expressed via
  `getExpensesInDayObservable(new Date())`.
- **#3 (filterExpenses no correlate):** converted in place to `filterExpensesObservable`
  (Promise envelope, Angular-exact name/params).
- **#4 (expenses-history bypassed the service filter):** REWIRED — route now calls
  `filterExpensesObservable(undefined, paymentType ?? undefined, undefined, undefined)`, dropping
  the inline `getAll()`+filter (provably identical predicate; taken).
- **#5 (delete/deleteExpense seam):** added `deleteExpense(id): Result` (never throws); `delete()`
  adapts it and throws on failure. Behavior change (silent no-op → throw on missing id) taken;
  no call-site relies on the old silent behavior (`today-expenses.handleDeleteConfirm`
  fire-and-forgets, matching Angular's own UI).
