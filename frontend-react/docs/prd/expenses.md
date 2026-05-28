# PRD: Expenses Module

## 1. Overview

The Expenses module allows store users to record and review business expenses. It supports two views: a focused today-only view for daily entry workflows, and a full history view with filtering for reviewing past expenses. All data is stored locally via `ExpenseOfflineService` using localStorage, keeping the module fully functional offline.

This module is part of the Angular-to-React migration. The behavior, data model, and localStorage format must remain backward-compatible with the Angular implementation so that devices running either version can coexist without data loss.

---

## 2. User Stories

- As a **StoreUser**, I want to log an expense for today so that I can track what the business spent.
- As a **StoreUser**, I want to see all expenses I've entered today so I have a quick daily summary.
- As a **StoreUser**, I want to edit or delete an expense I entered today in case I made a mistake.
- As a **StoreUser**, I want to browse the full expense history so I can review past spending.
- As a **StoreUser**, I want to filter expense history by date range or expense type.
- As an **OwnerAdmin**, I want to see all expenses across time to understand business costs.

---

## 3. Routes

| Path | Component | Required Feature | Guard |
|------|-----------|-----------------|-------|
| `/expenses/today` | `ExpensesTodayComponent` | `TodayExpenses` (80) | `AuthGuard` |
| `/expenses/expenses` | `ExpensesComponent` | `ExpensesHistory` (102) | `AuthGuard` |

Both routes are protected by `AuthGuard`. Feature IDs are checked against the user's `StoreModuleFeatures` for the active store. SuperAdmin and OwnerAdmin bypass feature checks.

---

## 4. Components

### 4.1 `ExpensesTodayComponent`

**Purpose:** Shows today's expenses and provides the primary entry point for adding new expenses during the workday.

**Behavior:**
- Loads and displays all expenses for the current calendar day.
- Shows a summary total at the top (sum of all today's expenses).
- Provides an "Add Expense" button that opens `EditExpenseModalComponent`.
- Each expense row has an edit action that opens `EditExpenseModalComponent` pre-populated.
- Each expense row has a delete action with a confirmation prompt.
- List is sorted by date descending (most recent first).

**State:**
- Derives `todayExpenses` by filtering the full store from `ExpenseOfflineService` on mount and after any mutation.

---

### 4.2 `ExpensesComponent`

**Purpose:** Full expense history with filtering. Allows reviewing expenses beyond today.

**Behavior:**
- Loads all expenses from `ExpenseOfflineService`.
- Provides filter controls: date range picker and expense type selector.
- Displays filtered list using `ExpenseListComponent`.
- Shows a total for the filtered result set.
- Supports pagination or virtual scrolling for large datasets.
- Does not allow adding new expenses (read + edit only from history).

---

### 4.3 `ExpenseListComponent`

**Purpose:** Reusable presentational component for rendering a list of expenses.

**Props:**
- `expenses: Expense[]` — the list to render.
- `onEdit?: (expense: Expense) => void` — callback when user triggers edit.
- `onDelete?: (id: string) => void` — callback when user triggers delete.
- `showActions?: boolean` — whether to show edit/delete controls (default `true`).

**Behavior:**
- Renders each expense as a row showing: date, type label, payment type label, total amount, and note (truncated).
- Delegates all data fetching and mutation to parent components.
- Shows an empty state message when the list is empty.

---

### 4.4 `EditExpenseModalComponent`

**Purpose:** Modal form for creating a new expense or editing an existing one.

**Props:**
- `expense?: Expense` — if provided, form is in edit mode pre-populated with these values. If omitted, form is in create mode.
- `onSave: (expense: Expense) => void` — called after successful save.
- `onCancel: () => void` — called when user dismisses the modal.

**Form Fields:**
- `type` — dropdown using `ExpenseType` enum values with human-readable labels.
- `total` — numeric input, required, must be > 0.
- `date` — date picker, defaults to today in create mode.
- `paymentType` — dropdown using `PaymentType` enum values.
- `note` — optional text area.

**Behavior:**
- Validates all required fields before saving.
- On save, calls `ExpenseOfflineService.save(expense)` and then calls `onSave`.
- On cancel, discards changes and calls `onCancel`.

---

## 5. Data Models

```typescript
interface Expense extends AuditableBaseModel {
  id: string;
  type: ExpenseType;
  total: number;
  date: Date;
  paymentType: PaymentType;
  note: string;
}

enum ExpenseType {
  Salario     = 1,
  Transporte  = 2,
  Alquiler    = 3,
  Corriente   = 4,
  Agua        = 5,
  Comida      = 6,
  Operaciones = 7,
  Viaje       = 8,
  Divisa      = 9,
  Impuesto    = 10,
  Otro        = 100,
}

enum PaymentType {
  Efectivo = 1,
  Tarjeta  = 2,
  Zelle    = 3,
}
```

`AuditableBaseModel` provides: `createdAt: Date`, `updatedAt: Date`, `createdBy?: string`.

---

## 6. Services

### `ExpenseOfflineService`

Responsible for all CRUD operations against the local expense store.

**localStorage key:** `lizoft.store-expenses-{storeId}`

The `storeId` is resolved from the active store context at service initialization. Changing the active store reinitializes the service with the new key — expenses are scoped per store.

**Interface:**

```typescript
interface ExpenseOfflineService {
  getAll(): Expense[];
  getByDateRange(from: Date, to: Date): Expense[];
  getToday(): Expense[];
  save(expense: Expense): void;       // insert or update by id
  delete(id: string): void;
}
```

**Internal behavior:**
- Reads full array from localStorage on each call (no in-memory cache beyond what React state manages).
- Serializes dates as ISO 8601 strings for JSON storage.
- Deserializes ISO strings back to `Date` objects on read.
- Generates `id` via `crypto.randomUUID()` for new expenses if `id` is not set.

---

## 7. Offline Behavior

- All reads and writes go directly to localStorage — no network calls required.
- The module is fully functional with no internet connection.
- Data entered offline becomes part of the export payload when the user runs a synchronization export (see `synchronization.md`).
- There is no conflict resolution for expenses — last write wins per `id`.

---

## 8. Permissions

| Feature | Feature ID | Who has access |
|---------|-----------|----------------|
| TodayExpenses | 80 | StoreUser (if granted), OwnerAdmin, SuperAdmin |
| ExpensesHistory | 102 | StoreUser (if granted), OwnerAdmin, SuperAdmin |

- SuperAdmin and OwnerAdmin always have access regardless of `featureIds`.
- ReSeller role does not have access to expense data.
- If a user lacks the required feature, the route redirects to the default unauthorized page.
