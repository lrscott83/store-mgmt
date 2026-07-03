# Tasks: Audit Fields (Offline Services)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~350-500 (helper ~15 + test ~40; 4 service files ~46 total edits incl. imports; 4 test files ~210-280 new assertions across 14 sites) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes (by size); overridden by fixed delivery strategy |
| Suggested split | Unit 1: helper — Unit 2: Inventory+Order — Unit 3: SaleCredit — Unit 4: Expense+gates |
| Delivery strategy | single-pr |
| Chain strategy | size-exception |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units (reference only — delivery is single-pr with size:exception)

| Unit | Goal | Notes |
|------|------|-------|
| 1 | Helper `getCurrentUserLogin` + test | Foundation, no dependents blocked |
| 2 | Inventory + Order services | Mirror pattern (create/update/deactivate) |
| 3 | SaleCredit service | 5 sites: createFromOrder/update/pay/voidByOrderId/void |
| 4 | Expense service + full gates | create/update/delete, then `pnpm test` + `tsc --noEmit` |

## Phase 0: Helper (TDD foundation)

- [x] 0.1 RED: `app/shared/lib/auth/__tests__/current-user.test.ts` — assert `''` unauthenticated, `login` when authed, lazy re-read between calls (Requirement: Current User Login Helper)
- [x] 0.2 GREEN: create `app/shared/lib/auth/current-user.ts` — `getCurrentUserLogin()` returns `useAuthStore.getState().user?.login ?? ''`, JSDoc noting login-not-fullName

## Phase 1: InventoryOfflineService

- [x] 1.1 RED: extend inventory test — `create()` asserts `createdByName=login`, `updatedByName=undefined`, `updatedDate=undefined`
- [x] 1.2 GREEN: edit `create()` L289-303 — set login/undefined/undefined; add helper import
- [x] 1.3 RED: extend test — `update()` asserts `updatedByName=login`
- [x] 1.4 GREEN: edit `update()` L334-340 — add `updatedByName: getCurrentUserLogin()`
- [x] 1.5 RED: extend test — `deactivate()` asserts `updatedByName=login`
- [x] 1.6 GREEN: edit `deactivate()` L369-373 — add `updatedByName: getCurrentUserLogin()`
- [x] 1.7 Run `inventory-offline-service.test.ts` full file green

## Phase 2: OrderOfflineService

- [x] 2.1 RED: extend order test — `create()` asserts login/undefined/undefined
- [x] 2.2 GREEN: edit `create()` L170-185 — set login/undefined/undefined; add import
- [x] 2.3 RED: extend test — `update()` asserts `updatedByName=login`
- [x] 2.4 GREEN: edit `update()` L199-203 — add `updatedByName`
- [x] 2.5 RED: extend test — `deactivate()` asserts `updatedByName=login` (nested creditService/inventory unaffected)
- [x] 2.6 GREEN: edit `deactivate()` L213-217 — add `updatedByName`
- [x] 2.7 Run `order-offline-service.test.ts` full file green

## Phase 3: SaleCreditOfflineService

- [x] 3.1 RED: extend test — `createFromOrder()` asserts login/undefined/undefined (create semantics)
- [x] 3.2 GREEN: edit `createFromOrder()` L83-99 — set login/undefined/undefined; add import
- [x] 3.3 RED: extend test — `update()` asserts `updatedByName=login`
- [x] 3.4 GREEN: edit `update()` L107-112 — add `updatedByName`
- [x] 3.5 RED: extend test — `pay()` asserts `updatedByName=login`
- [x] 3.6 GREEN: edit `pay()` L122-130 — add `updatedByName`
- [x] 3.7 RED: extend test — `voidByOrderId()` asserts `updatedByName=login`
- [x] 3.8 GREEN: edit `voidByOrderId()` L140 — add `updatedByName` to spread
- [x] 3.9 RED: extend test — `void()` asserts `updatedByName=login`
- [x] 3.10 GREEN: edit `void()` L152 — add `updatedByName` to spread
- [x] 3.11 Run `sale-credit-offline-service.test.ts` full file green

## Phase 4: ExpenseOfflineService

- [x] 4.1 RED: extend expense test — `create()` asserts login/undefined/undefined
- [x] 4.2 GREEN: edit `create()` L47-59 — set login/undefined/undefined; add import
- [x] 4.3 RED: extend test — `update()` asserts `updatedByName=login`
- [x] 4.4 GREEN: edit `update()` L75-80 — add `updatedByName`
- [x] 4.5 RED: extend test — `delete()` (soft-delete) asserts `updatedByName=login`
- [x] 4.6 GREEN: edit `delete()` L91-95 — add `updatedByName`
- [x] 4.7 Run `expense-offline-service.test.ts` full file green

## Phase 5: Full-Suite Gates

- [x] 5.1 Run `pnpm test` — full monorepo suite green (helper + 4 services, 14 call sites, no regressions)
- [x] 5.2 Run `pnpm -C apps/web-store-pos exec tsc --noEmit` — confirm `updatedByName: undefined` satisfies optional field, import paths resolve
