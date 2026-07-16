# Expense Service Specification (New Capability)

## Purpose

Define the verifiable contract for `ExpenseOfflineService`'s create/update surface and JSON export,
reaching parity with Angular's `expense-offline.service.ts`. Reverts React's object-form
`create(input)`/`update(id, patch)` (a prior "Slice-1 Inventory precedent" choice) back to Angular's
literal positional signatures, and adds the missing `getExpensesJson` export.

## Requirements

### Requirement: createExpense Positional Signature
`ExpenseOfflineService` MUST expose `createExpense(expenseType: ExpenseType, total: number, note:
string, date: Date, paymentType: PaymentType): DataResult<Expense>` (5 positional params, exact
Angular order, `expense-offline.service.ts:41`), replacing the current `create(input:
CreateExpenseInput)`. It MUST generate a new id, stamp `createdDate`/`createdByName` from the
current user, default `isActive: true`, persist, and return `DataResult(expense, true, [])` —
never throwing.

#### Scenario: Create with positional args
- GIVEN a caller has `expenseType`, `total`, `note`, `date`, `paymentType` values
- WHEN `createExpense(expenseType, total, note, date, paymentType)` is called
- THEN a new `Expense` is persisted with those values and the result is
  `DataResult(expense, true, [])`

### Requirement: updateExpense Positional Signature
`ExpenseOfflineService` MUST expose `updateExpense(expenseId: string, expenseType: ExpenseType,
total: number, note: string, date: Date, paymentType: PaymentType): DataResult<Expense>` (6
positional params, `expense-offline.service.ts:62`), replacing `update(id, patch)`. On a missing
`expenseId` it MUST return `DataResult(undefined, false, [ExpenseErrors.NotExists])` without
throwing. On success it MUST overwrite all 5 fields (including `date` — Angular's `updateExpense`
always accepts a caller-supplied `date`, unlike the UI's own convention of reusing the original)
and stamp `updatedDate`/`updatedByName`.

#### Scenario: Update unknown id never throws
- GIVEN no expense exists with id `"missing"`
- WHEN `updateExpense("missing", type, total, note, date, paymentType)` is called
- THEN it returns `DataResult(undefined, false, [ExpenseErrors.NotExists])`, not a thrown error

#### Scenario: Update overwrites all fields including date
- GIVEN an existing expense with `date = D1`
- WHEN `updateExpense(id, type, total, note, D2, paymentType)` is called
- THEN the stored expense's `date` becomes `D2`

### Requirement: today-expenses.tsx Call-Site Adapted
The expense create/edit modal's submit handler (`expenses/routes/today-expenses.tsx`) MUST call
`svc.createExpense(...)`/`svc.updateExpense(...)` with positional arguments instead of the object-form
`svc.create(input)`/`svc.update(id, patch)`. Angular's UI convention MUST be preserved: create always
uses `new Date()` (never a user-editable date); update always reuses the existing expense's original
`date` unchanged (the form does not expose a date field), even though the reverted `updateExpense`
signature itself accepts a `date` argument.

#### Scenario: Create submit uses new Date()
- GIVEN the user submits the create-expense form
- WHEN the handler calls `createExpense`
- THEN the `date` argument is `new Date()` at submit time, not a stored/prior value

#### Scenario: Update submit preserves original date
- GIVEN the user edits an existing expense without a date field in the form
- WHEN the handler calls `updateExpense`
- THEN the `date` argument passed is the expense's own pre-existing `date`, unchanged

### Requirement: getExpensesJson Is Exposed
`ExpenseOfflineService` MUST expose `getExpensesJson(): string`, returning the raw current-store
expenses JSON from storage, or `"[]"` when nothing is stored.

#### Scenario: Raw JSON export
- GIVEN expenses exist in storage for the current store
- WHEN `getExpensesJson()` is called
- THEN it returns the exact JSON string from storage, or `"[]"` when nothing is stored

## Out of Scope
- `deleteExpense`, `getExpensesInDay`/`Observable`, `filterExpensesObservable`,
  `getActiveExpensesPriceBetweenDates`/today/yesterday totals — already at parity, untouched by this
  capability.
