# Change Proposal: audit-user-threading

**Change ID:** `audit-user-threading`
**Phase:** Proposal
**Artifact store:** hybrid (openspec + engram)
**Parity anchor:** Legacy `frontend/` (Angular) is the ONLY source of truth. React is never assumed correct.

---

## 1. Intent

### Problem
The audit fields `createdByName` / `updatedByName` (from `AuditableBaseModel`) are **never populated** in ANY React offline service in `frontend-react/apps/web-store-pos`. Every `create()` hardcodes `createdByName: ''` / `updatedByName: ''`, and every mutation (`update`/`pay`/`void`/`deactivate`/`delete`) leaves `updatedByName` untouched. This diverges from Angular, which threads the current user's `login` into these fields on every create and every mutation.

React offline services are plain classes constructed per-call (`new XxxOfflineService(storeId)`), with no DI and no current-user context threaded in — so the fields stay empty.

### Why now
This is a **module-crossing** gap flagged out of Stage 3 (Expenses) and deferred deliberately (see gap #533). It touches Stage 4 (Management), which also exercises audit fields. Fixing it as its own dedicated slice — BEFORE Stage 4 — prevents Management from closing while still writing empty audit trails, and avoids smuggling a cross-cutting refactor into a single module's parity work.

### Success criteria
- All 14 in-scope call sites across the 4 offline services populate audit fields with exact Angular semantics.
- On create: `createdByName = <current user login>`, `updatedByName = undefined`, `updatedDate = undefined`.
- On every mutation: `updatedByName = <current user login>`, `updatedDate = now`.
- Value stored is the user's **`login`** (username), matching Angular — NOT `fullName`.
- Strict TDD: failing tests written first, then implementation; `pnpm test` green; `pnpm -C apps/web-store-pos exec tsc --noEmit` clean.

---

## 2. Scope

### In scope
- New shared helper `getCurrentUserLogin()` at `frontend-react/apps/web-store-pos/app/shared/lib/auth/current-user.ts`.
- 14 call sites across 4 offline services:
  - `inventory/lib/services/inventory-offline-service.ts`: `create`, `update`, `deactivate`
  - `sales/lib/services/order-offline-service.ts`: `create`, `update`, `deactivate`
  - `sales/lib/services/sale-credit-offline-service.ts`: `createFromOrder`, `update`, `pay`, `voidByOrderId`, `void`
  - `expenses/lib/services/expense-offline-service.ts`: `create`, `update`, `delete`
- Correcting `updatedDate: now` → `undefined` on **create** in these 4 services (Decision 2 below).
- Tests: 1 new helper test + new assertions in the 4 existing service test files.

### Out of scope
- **Product / Owner / ReSeller** entities — they share the same `AuditableBaseModel` gap but belong to a different (Management/catalog) slice. `ProductOfflineService.create()/update()` takes caller-supplied `data` and does not set audit fields itself, so any fix lives at the caller. Recorded as an explicit follow-up (Decision 3).
- Stage 4 Management parity — a separate SDD change after this slice lands.
- Any change to constructor signatures or the ~30 external call sites that instantiate these services.
- Any change to `updatedDate` semantics on **mutations** (already correct: `now`).
- SSR/hydration timing changes (confirmed non-issue under `ssr:false`).

---

## 3. Approach

### Shared helper (Approach c — selected)
Introduce a single small function, following the existing `app/shared/lib/auth/user-home.ts` sibling-file convention (plain functions in `app/shared/lib/auth/`, no class hierarchy):

```ts
// app/shared/lib/auth/current-user.ts
import { useAuthStore } from '~/shared/lib/stores/auth-store';

/**
 * Returns the current user's login (username) for audit fields
 * (createdByName / updatedByName), matching Angular's
 * AuthService.currentUserValue.login. Reads synchronously at call time.
 */
export function getCurrentUserLogin(): string {
  return useAuthStore.getState().user?.login ?? '';
}
```

Read synchronously via `useAuthStore.getState()` (non-reactive — correct inside plain service classes, not React components). This matches Angular's `AuthService.currentUserValue` getter semantics exactly: the value is captured **at the moment of the mutation**, not cached at construction time.

### Why this approach
- **Smallest blast radius**: only the 4 service files change (14 one-line edits) + 1 new ~10-line helper. No constructor signature changes, no updates to the ~30 external call sites or the 2 aggregation services that only read.
- **Single source of truth**: if the "what counts as current user name" rule ever changes, exactly one function changes.
- **Testability de-risked**: 20+ existing test files already mock `~/shared/lib/stores/auth-store`; wrapping the read in one helper makes mocking trivial and consistent.
- **Constructor injection (rejected)**: would touch 4 services + ~30 call sites + 2 aggregation services + the nested composition where `OrderOfflineService` internally builds `SaleCreditOfflineService` and `InventoryOfflineService` — high blast radius for zero parity or correctness benefit.

### Per-method audit semantics table

| Service | Method | `createdByName` | `updatedByName` | `updatedDate` |
|---|---|---|---|---|
| Inventory | `create` | `getCurrentUserLogin()` | `undefined` | `undefined` |
| Inventory | `update` | (unchanged) | `getCurrentUserLogin()` | `now` |
| Inventory | `deactivate` | (unchanged) | `getCurrentUserLogin()` | `now` |
| Order | `create` | `getCurrentUserLogin()` | `undefined` | `undefined` |
| Order | `update` | (unchanged) | `getCurrentUserLogin()` | `now` |
| Order | `deactivate` | (unchanged) | `getCurrentUserLogin()` | `now` |
| SaleCredit | `createFromOrder` | `getCurrentUserLogin()` | `undefined` | `undefined` |
| SaleCredit | `update` | (unchanged) | `getCurrentUserLogin()` | `now` |
| SaleCredit | `pay` | (unchanged) | `getCurrentUserLogin()` | `now` |
| SaleCredit | `voidByOrderId` | (unchanged) | `getCurrentUserLogin()` | `now` |
| SaleCredit | `void` | (unchanged) | `getCurrentUserLogin()` | `now` |
| Expense | `create` | `getCurrentUserLogin()` | `undefined` | `undefined` |
| Expense | `update` | (unchanged) | `getCurrentUserLogin()` | `now` |
| Expense | `delete` (soft) | (unchanged) | `getCurrentUserLogin()` | `now` |

> Note: `createdByName`/`createdDate` are set only on create and never touched by mutations, matching Angular.

---

## 4. Settled decisions

### Decision 1 — Store `login`, NOT `fullName` (parity, load-bearing)
Angular populates `createdByName`/`updatedByName` with `AuthService.currentUserValue.login` (the username), despite the field being named `*ByName`. This is deliberate (audit trail keyed to the unique login, not a possibly-non-unique display name). React MUST replicate `login` via `useAuthStore.getState().user?.login`. **Do NOT "correct" this to `fullName`** under a mistaken parity assumption.

### Decision 2 — Fix `updatedDate` on create alongside (approved)
React's current `create()` methods set `updatedDate: now`; Angular sets `updatedDate: undefined` on create (it never touches update fields until an actual update happens). Since the fix edits the same object-literal lines as `updatedByName`, correct `updatedDate: now` → `undefined` on create in all 4 services as part of this change, so the create shape matches Angular exactly (`updatedByName` and `updatedDate` both `undefined`).

### Decision 3 — Product / Owner / ReSeller are OUT OF SCOPE (explicit follow-up)
These three entities extend `AuditableBaseModel` and share the same gap, but they belong to the Management/catalog slice, not this transactional-services slice. `ProductOfflineService.create()/update()` receives caller-supplied `data` and does not set audit fields itself. Logged as a known follow-up so it is not lost; scheduled around/with Stage 4.

---

## 5. Parity mapping (Angular → React)

| Concern | Angular symbol | React symbol |
|---|---|---|
| Current user value | `AuthService.currentUserValue.login` (`_services/auth/auth.service.ts`) | `useAuthStore.getState().user?.login` (via `getCurrentUserLogin()`) |
| Auditable shape | `AuditableBaseModel` (`_services/_models/base.model.ts`) | `AuditableBaseModel` (`packages/domain/src/models/base.ts`) — identical shape |
| Inventory writes | `InventoryOfflineService` create/update/deactivate | `inventory-offline-service.ts` create/update/deactivate |
| Order writes | `OrderOfflineService` create/update (+2nd path) | `order-offline-service.ts` create/update/deactivate |
| SaleCredit writes | `SaleCreditOfflineService` create/update/paid/delete | `sale-credit-offline-service.ts` createFromOrder/update/pay/voidByOrderId/void |
| Expense writes | `ExpenseOfflineService` create/update/delete | `expense-offline-service.ts` create/update/delete |
| Create field pattern | `createdByName: login`, `updatedByName: undefined`, `updatedDate: undefined` | same |
| Mutation field pattern | `updatedByName = login` (updatedDate = now) | same |

---

## 6. Test strategy (strict TDD — ON, `pnpm test`)

Write failing tests FIRST, then implement.

1. **Helper test** — `app/shared/lib/auth/__tests__/current-user.test.ts`:
   - returns `''` (falsy) when no user in store.
   - returns `user.login` when authenticated (seed via `useAuthStore.setState({ user: {...}, isAuthenticated: true })`).

2. **Per-service tests** — add `it()` blocks in the 4 existing test files:
   - `inventory-offline-service.test.ts`, `order-offline-service.test.ts`, `sale-credit-offline-service.test.ts`, `expense-offline-service.test.ts`.
   - Each `beforeEach` seeds current user (via `useAuthStore.setState` or `vi.mock('~/shared/lib/stores/auth-store', ...)`, following the ~20 existing precedents).
   - Assert `create()`/`createFromOrder()` set `createdByName` to the mocked login and `updatedByName === undefined` and `updatedDate === undefined`.
   - Assert each mutation (`update`/`deactivate`/`pay`/`voidByOrderId`/`void`/`delete`) sets `updatedByName` to the mocked login.
   - Existing `createdByName: 'test'`/`''` occurrences are hand-built fixture literals for unrelated assertions — no conflict with new service-output assertions.

3. **Type check** — `pnpm -C apps/web-store-pos exec tsc --noEmit` must be clean.

---

## 7. Risks

- **`login` vs `fullName` ambiguity** — mitigated by Decision 1 + inline JSDoc in the helper; risk that a future editor "fixes" it to `fullName`. Keep the parity note in the helper doc comment.
- **`updatedDate` on create** — resolved by Decision 2 (fix to `undefined`); no ad-hoc decision left for `sdd-apply`.
- **SSR assumption** — safe today (`ssr:false`, module-scope hydration completes before any service is constructed). If SSR is ever enabled, the lazy synchronous read would need revisiting. Not a blocker.
- **Nested composition** — `OrderOfflineService` internally builds `SaleCreditOfflineService`/`InventoryOfflineService`; with the helper approach this is a non-issue (helper called independently inside each method), but `sdd-apply` must not assume a shared instance needs threading.
- **Empty-string fallback** — helper returns `''` when unauthenticated; matches Angular's practical behavior where a mutation without a logged-in user is not expected. Acceptable.
- **Follow-up not lost** — Product/Owner/ReSeller (Decision 3) must be tracked as a separate change.

### Open questions
None blocking. All three decision points are settled above.

---

## Next recommended phases
`sdd-spec` and `sdd-design` (can run in parallel).
