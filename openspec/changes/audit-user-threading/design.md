# Technical Design — audit-user-threading

Populate `createdByName` / `updatedByName` in the React offline services (Inventory, Order,
SaleCredit, Expense) by threading the current user's `login` into every create/mutation, matching
Angular's `AuthService.currentUserValue.login` semantics.

- Artifact store: **hybrid** (this file + engram `sdd/audit-user-threading/design`).
- Parity anchor: legacy `frontend/` (Angular) is the **only** source of truth.
- Depends on: proposal `sdd/audit-user-threading/proposal` (approved), exploration
  `sdd/audit-user-threading/explore`.
- Approach already chosen in the proposal: **shared helper** (Approach c). Constructor injection
  (Approach a) is **rejected** — 30+ call sites + nested `OrderOfflineService` composition, no
  parity or correctness benefit.

---

## 1. Architecture approach

This is a **surgical, non-structural** change. No new layer, no DI container, no base class. It adds
one leaf-level pure-ish helper in the existing `app/shared/lib/auth/` folder and calls it at 14
mutation sites inside the four offline services. The services remain plain per-call-constructed
classes (`new XxxOfflineService(storeId)`); nothing about their construction, composition, or public
signatures changes.

Why a helper (not inline reads): single point of truth for "what value is the audit name" (Angular's
deliberate `login`-not-`fullName` choice), one mock target in tests, and DRY across 14 sites — while
keeping the exact same runtime semantics as an inline `useAuthStore.getState().user?.login ?? ''`.

### Data flow

```
useAuthStore (Zustand, hydrated at import via initialize())
        │  getState().user?.login
        ▼
getCurrentUserLogin(): string        ← app/shared/lib/auth/current-user.ts (NEW)
        │  called lazily inside each mutation method
        ▼
InventoryOfflineService / OrderOfflineService / SaleCreditOfflineService / ExpenseOfflineService
        │  writes createdByName / updatedByName onto the entity literal
        ▼
BaseRepository.save/upsert → localStorage (offline-first)
```

The read is **synchronous and non-reactive** (`getState()`, not the hook) — correct for use inside
plain service classes rather than React components, and it mirrors Angular's synchronous
`currentUserValue` getter.

---

## 2. Helper design

**File:** `frontend-react/apps/web-store-pos/app/shared/lib/auth/current-user.ts` (NEW)

Follows the existing `user-home.ts` sibling-file convention (plain exported function in
`app/shared/lib/auth/`, alongside `authorization-service.ts`, `connectivity-service.ts`,
`storage-service.ts`, `user-home.ts`).

```ts
import { useAuthStore } from '~/shared/lib/stores/auth-store';

/**
 * Returns the currently-authenticated user's `login` (username), or '' when no user
 * is authenticated. This is the value threaded into AuditableBaseModel's
 * `createdByName` / `updatedByName` fields.
 *
 * Angular parity: mirrors `AuthService.currentUserValue.login`
 * (frontend/src/app/_services/auth/auth.service.ts). Despite the "*ByName" field
 * name, Angular deliberately stores `login` (the unique username), NOT `fullName`.
 * Do NOT "correct" this to fullName — it is load-bearing parity behavior.
 *
 * Read lazily at call time (not memoized at module scope) so it reflects whichever
 * user is authenticated at the exact moment of the mutation — matching Angular's
 * per-mutation `currentUserValue` getter, and staying hydration-safe: the auth
 * store hydrates synchronously at import (auth-store.ts L155-157) before any
 * per-call-constructed service runs.
 */
export function getCurrentUserLogin(): string {
  return useAuthStore.getState().user?.login ?? '';
}
```

Design points:

- **Signature:** `getCurrentUserLogin(): string`. Never returns `undefined` — `''` fallback when
  unauthenticated (acceptable per proposal; matches offline-first tolerance and never breaks the
  `createdByName: string` non-optional type).
- **Lazy read at call time.** The function body runs on each invocation; it is NOT captured into a
  module-scope const. This is essential: services are constructed per-call, and a single logged-in
  user can perform many mutations — each must stamp the current user.
- **No caching, no parameters.** If the "audit name" rule ever changes (e.g. `login` → `fullName`),
  exactly one function changes.

---

## 3. Per-service change plan (14 call sites)

Convention applied everywhere:

- **CREATE** → `createdByName: getCurrentUserLogin()`, `updatedByName: undefined`,
  `updatedDate: undefined`.
  - The `updatedDate: now → undefined` correction is applied on create **only** (Decision 2 in the
    proposal): Angular leaves both update fields untouched until a real update happens. The `now`
    const is still needed for `createdDate` (and `date` where used) — do **not** delete it.
- **MUTATION** (update/pay/void/voidByOrderId/deactivate/delete) →
  `updatedByName: getCurrentUserLogin()`, keep the existing `updatedDate: new Date()`.

Each service imports the helper:
`import { getCurrentUserLogin } from '~/shared/lib/auth/current-user';`

### 3.1 InventoryOfflineService — `inventory/lib/services/inventory-offline-service.ts` (3 sites)

| Method | Current (verified) | Change |
|---|---|---|
| `create()` L289-303 | `createdByName: ''`, `updatedDate: now`, `updatedByName: ''` | `createdByName: getCurrentUserLogin()`, `updatedByName: undefined`, `updatedDate: undefined` |
| `update()` L334-340 | sets `updatedDate: new Date()`, no `updatedByName` | add `updatedByName: getCurrentUserLogin()` (keep `updatedDate`) |
| `deactivate()` L369-373 | sets `updatedDate: new Date()`, no `updatedByName` | add `updatedByName: getCurrentUserLogin()` (keep `updatedDate`) |

### 3.2 OrderOfflineService — `sales/lib/services/order-offline-service.ts` (3 sites)

| Method | Current (verified) | Change |
|---|---|---|
| `create()` L170-185 | `createdByName: ''`, `updatedDate: now`, `updatedByName: ''` | `createdByName: getCurrentUserLogin()`, `updatedByName: undefined`, `updatedDate: undefined` |
| `update()` L199-203 | `updatedDate: new Date()`, no `updatedByName` | add `updatedByName: getCurrentUserLogin()` |
| `deactivate()` L213-217 | `updatedDate: new Date()`, no `updatedByName` | add `updatedByName: getCurrentUserLogin()` |

Note: `deactivate()` also calls `creditService.voidByOrderId(id)` and `inventoryService.increase…` —
those nested writes are handled by their own services' own helper calls (§4). Do not stamp them here.

### 3.3 SaleCreditOfflineService — `sales/lib/services/sale-credit-offline-service.ts` (5 sites)

| Method | Current (verified) | Change |
|---|---|---|
| `createFromOrder()` L83-99 | `createdByName: ''`, `updatedDate: now`, `updatedByName: ''` | `createdByName: getCurrentUserLogin()`, `updatedByName: undefined`, `updatedDate: undefined` |
| `update()` L107-112 | `updatedDate: new Date()`, no `updatedByName` | add `updatedByName: getCurrentUserLogin()` |
| `pay()` L122-130 | `updatedDate: now`, no `updatedByName` | add `updatedByName: getCurrentUserLogin()` |
| `voidByOrderId()` L140 | spread `{ ...credit, isActive: false, updatedDate: new Date() }` | add `updatedByName: getCurrentUserLogin()` to the spread |
| `void()` L152 | `upsert({ ...credit, isActive: false, updatedDate: new Date() })` | add `updatedByName: getCurrentUserLogin()` to the spread |

### 3.4 ExpenseOfflineService — `expenses/lib/services/expense-offline-service.ts` (3 sites)

| Method | Current (verified) | Change |
|---|---|---|
| `create()` L47-59 | `createdByName: ''`, `updatedDate: now`, `updatedByName: ''` | `createdByName: getCurrentUserLogin()`, `updatedByName: undefined`, `updatedDate: undefined` |
| `update()` L75-80 | `updatedDate: new Date()`, no `updatedByName` | add `updatedByName: getCurrentUserLogin()` |
| `delete()` L91-95 (soft-delete) | `updatedDate: new Date()`, no `updatedByName` | add `updatedByName: getCurrentUserLogin()` |

---

## 4. Blast radius & risks

- **Aggregation services** (`statistics-aggregation-service.ts`, `report-aggregation-service.ts`)
  construct offline services but only **read** — they never call create/mutation. No change, no
  double-write risk. (This is the key reason constructor injection was rejected: it would force
  signature churn on read-only callers.)
- **OrderOfflineService nested composition:** its constructor builds `SaleCreditOfflineService` and
  `InventoryOfflineService`. With the helper approach this is a **non-issue** — each nested service
  calls `getCurrentUserLogin()` inside its own methods. `Order.deactivate()` → `credit.voidByOrderId`
  → SaleCredit stamps its own `updatedByName`; `Order.create()` → `credit.createFromOrder` → SaleCredit
  stamps its own `createdByName`. No double-write: each entity is stamped exactly once, by the service
  that owns it.
- **SSR safety:** app runs SPA-only (`ssr:false` in `react-router.config.ts`). `auth-store.ts`
  hydrates synchronously at import (L155-157, `typeof window` guarded). Services are constructed
  per-call, always after hydration — no read-before-hydrate race in production. If SSR is ever
  enabled, the lazy read would need revisiting (documented, not a blocker today).
- **`login` vs `fullName`:** the field is `*ByName` but Angular stores `login`. Mitigated by Decision
  1 + the helper JSDoc. Do not "fix" to `fullName`.
- **`''` fallback when unauthenticated:** acceptable — mutations only happen in authenticated flows;
  `''` is strictly better than the current always-`''`.
- **Product/Owner/ReSeller:** same `AuditableBaseModel` gap, **out of scope** — their services take
  caller-supplied data. Tracked as an explicit follow-up around Stage 4 (Management/catalog).

---

## 5. Test design (strict TDD — write failing tests first)

Test runner: `pnpm test` (turbo → vitest). Type check is **separate**:
`pnpm -C apps/web-store-pos exec tsc --noEmit`.

Reuse the established precedent: 20+ existing test files already do
`vi.mock('~/shared/lib/stores/auth-store', ...)` and/or `useAuthStore.setState({ user, isAuthenticated: true })`.
Seed the current user in `beforeEach`; do not invent a new mocking convention.

### 5.1 Helper unit test — `app/shared/lib/auth/__tests__/current-user.test.ts` (NEW)

- returns `''` when no user (`useAuthStore.setState({ user: null })`).
- returns `user.login` when authenticated (`useAuthStore.setState({ user: { login: 'jdoe', … }, isAuthenticated: true })`).
- reads lazily: change the store between two calls, assert the second call returns the new login.

### 5.2 Per-service assertions (extend existing test files)

Existing files:
- `inventory/lib/services/__tests__/inventory-offline-service.test.ts`
- `sales/lib/services/__tests__/order-offline-service.test.ts`
- `sales/lib/services/__tests__/sale-credit-offline-service.test.ts`
- `expenses/lib/services/expense-offline-service.test.ts`

For each service, in `beforeEach` seed `useAuthStore` with a known login (e.g. `'tester'`). Then:

- **create path** (`create` / `createFromOrder`): assert
  `createdByName === 'tester'`, `updatedByName === undefined`, `updatedDate === undefined`.
- **mutation paths** (`update`, `pay`, `voidByOrderId`, `void`, `deactivate`, `delete`): assert
  `updatedByName === 'tester'` and `updatedDate` is a `Date` (existing behavior preserved).
- Existing `createdByName: 'test'`/`''` occurrences are hand-built **fixture literals** for unrelated
  assertions — they do not conflict; do not delete them.

### 5.3 Ordering / TDD sequence

1. **Helper first (red → green):** write `current-user.test.ts`, watch it fail (no file), create
   `current-user.ts`, green.
2. **Service-by-service (red → green each):** for each of Inventory → Order → SaleCredit → Expense:
   add the failing assertions, then apply the field edits, then green. Do a service fully before
   moving to the next to keep each red→green loop tight.
3. **Type gate last:** `pnpm -C apps/web-store-pos exec tsc --noEmit` — confirms `updatedByName: undefined`
   assignments satisfy the optional `updatedByName?: string` shape and no import path is wrong.

---

## 6. ADR-style decisions

### ADR-1: Shared helper function over constructor injection
- **Decision:** add `getCurrentUserLogin()` in `app/shared/lib/auth/current-user.ts`, call it at the 14
  mutation sites.
- **Rationale:** lowest blast radius (4 service files + 1 helper), single source of truth, single mock
  target, exact Angular timing semantics (read at mutation moment).
- **Rejected — constructor injection:** would touch 30+ call sites incl. read-only aggregation
  services and 2 nested compositions inside `OrderOfflineService`, for no parity/correctness benefit,
  plus risk of stale login cached across long-lived loaders.
- **Rejected — pure inline reads (no helper):** valid fallback, but loses the single mock/source-of-truth
  advantage; the helper costs ~10 lines.

### ADR-2: Lazy read at call time (not module-scope memoization)
- **Decision:** helper body runs on every call.
- **Rationale:** matches Angular's per-mutation `currentUserValue` getter; hydration-safe; a single
  session performs many mutations that must each reflect the current user.

### ADR-3: Store `login`, not `fullName`
- **Decision:** thread `user.login`.
- **Rationale:** Angular deliberately populates `*ByName` with `login` (unique username). Parity policy
  makes Angular the sole source of truth. Encoded in helper JSDoc to prevent a "fix" to `fullName`.

### ADR-4: Correct `updatedDate: now → undefined` on CREATE only
- **Decision:** on create set `updatedDate: undefined` and `updatedByName: undefined`; mutations keep
  `updatedDate: new Date()`.
- **Rationale:** Angular never touches update fields until a real update. The correction sits on the
  same object literal being edited for `createdByName`, so bundling it is coherent and avoids leaving a
  half-fixed pair (`updatedDate` set while `updatedByName` explicitly undefined). Explicitly scoped by
  the proposal (Decision 2), not an ad-hoc apply-time choice.

---

## 7. Ready for tasks

Scope, the 14 exact edits (with verified line numbers and field semantics), the helper contract, and
the TDD sequence are concrete. Next phase: `sdd-tasks` (after spec is ready).
