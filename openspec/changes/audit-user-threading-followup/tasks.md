# Tasks: Audit Fields — Product Offline Service (Follow-up)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~160-200 (service ~55: import + `CreateProductInput` + create/update/updateMany/delete; service test ~90: `makeUser` helper + real-store `beforeEach` + 6 new/rewritten assertions; route ~4 removed literals; route test ~35: login field + hoisted spies + 1 new assertion) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR (per fixed delivery strategy) |
| Delivery strategy | single-pr |
| Chain strategy | size-exception |

Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

Delivery note: commits ONLY on `feat/frontend-parity-audit`, **NO PR** (same handling as the completed sibling `audit-user-threading` change). `size:exception` is pre-accepted per proposal/design — no chaining needed given the low estimate, but the guard still requires an explicit exception acceptance before `sdd-apply` because `delivery_strategy = single-pr`.

### Suggested Work Units (reference only — delivery is single-pr, no chaining)

| Unit | Goal | Notes |
|------|------|-------|
| 1 | `create` narrowing + stamping | Introduces `CreateProductInput`, foundation for route cleanup |
| 2 | `update` + `updateMany` stamping | Mirrors Expense pattern |
| 3 | `delete` hard→soft conversion | Behavior change; rewrites PROD-06 |
| 4 | Route cleanup + full gates | Removes literals, `pnpm test`, `tsc --noEmit` |

## Phase 1: Service — `create` (Requirement: Product Create Semantics)

- [x] 1.1 RED: `app/sales/lib/services/product-offline-service.test.ts` — import `useAuthStore`/`UserModel`, add `makeUser({ login })` helper, seed real store in `beforeEach` (`useAuthStore.setState({ user: makeUser({ login: 'jdoe' }), isAuthenticated: true, isLoading: false, error: null })`); add tests: `create` stamps `createdByName === 'jdoe'`; `create` leaves `updatedByName`/`updatedDate` `undefined`
- [x] 1.2 GREEN: `product-offline-service.ts` — import `getCurrentUserLogin`; add `CreateProductInput` type (`Omit<Product,'id'|'createdDate'|'createdByName'|'updatedDate'|'updatedByName'> & { id?: string }`); rewrite `create()` to stamp `createdDate=now`, `createdByName=getCurrentUserLogin()`, force `updatedDate`/`updatedByName` `undefined`

## Phase 2: Service — `update` (Requirement: Product Update Semantics)

- [x] 2.1 RED: extend test — `update()` asserts `updatedByName === 'jdoe'`, `updatedDate instanceof Date`, `createdByName`/`createdDate` unchanged
- [x] 2.2 GREEN: edit `update()` — spread + override `updatedDate: new Date()`, `updatedByName: getCurrentUserLogin()`

## Phase 3: Service — `updateMany` (Requirement: Product Update Semantics, batch)

- [x] 3.1 RED: extend test — `updateMany()` asserts every product in the batch gets `updatedByName === 'jdoe'` and the same `updatedDate`
- [x] 3.2 GREEN: edit `updateMany()` — compute one `now`/`login` for the batch, stamp each product before `repo.save`

## Phase 4: Service — `delete` soft-delete conversion (Requirement: Product Delete Is Angular-Parity Soft Delete)

- [x] 4.1 RED: rewrite PROD-06 (`product-offline-service.test.ts`) — replace the `toBeUndefined()` assertion with: `getById(id)?.isActive === false`, `getAll()` still contains the record, `updatedByName === 'jdoe'`, `updatedDate instanceof Date`; add a no-op-on-missing-id case (no throw)
- [x] 4.2 GREEN: edit `delete()` — replace `repo.remove()` with `repo.getById` + no-op guard + `repo.upsert(...isActive:false, updatedDate:new Date(), updatedByName:getCurrentUserLogin())`

## Phase 5: Route — call sites (Requirement: Exact Call Site Coverage, Stamping Centralized)

- [x] 5.1 RED: `app/sales/routes/products.test.tsx` — add `login: 'jdoe'` to the mocked auth-store `user`; hoist `ProductOfflineService` method spies via `vi.hoisted`; add a test driving `handleCreateProduct` (via `CreateProductModal` fill+save) asserting `spies.create.mock.calls[0][0]` does NOT carry `createdByName: ''`
- [x] 5.2 GREEN: `products.tsx` — remove `createdDate: new Date()` / `createdByName: ''` from `handleCreateProduct`'s and `handleCsvImport`'s `create({...})` object literals (handler signatures unchanged)

## Phase 6: Full-Suite Gates

- [x] 6.1 Run `pnpm test` — full suite green (service Phases 1-4, route Phase 5, no regressions in `products.test.tsx` or elsewhere)
- [x] 6.2 Run `pnpm -C apps/web-store-pos exec tsc --noEmit` — confirm `CreateProductInput` narrowing and `updatedDate: undefined` type-check clean
