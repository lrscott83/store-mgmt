# Tasks: Parity Audit Remediation

Delivery = commits-only on `feat/frontend-parity-audit` (project convention — NO PRs, NO
chained PRs, NO size:exception). Each Phase below = one work-unit commit. Strict TDD is
ACTIVE: every implementation task is preceded by its failing-test task.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~900-1200 across 8 commits (Slice 6 ~300, Slice 7 ~250, rest ~50-120 each) |
| 400-line budget risk | High (aggregate), Low-Med per individual commit |
| Chained PRs recommended | N/A — delivery is commits-only per project convention, not PR-based |
| Suggested split | 8 work-unit commits (below), not PRs |
| Delivery strategy | commits-only (ratified project convention) |
| Chain strategy | N/A |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low (per-commit; aggregate High but mitigated by 8 independent, revertable work-unit commits)

### Suggested Work Units (commit boundaries, not PRs)

| Unit | Goal | Commit scope | Notes |
|------|------|--------------|-------|
| 1 | Slices 1+2 | product-online-service, order.ts, data-serializer, product-category-repository | Low risk, may commit together or separately; independent of each other |
| 2 | Slice 3 | offline JSON exports | small, precedes Slice 4 |
| 3 | Slice 4 | visibility restoration | MUST land after Unit 2 (same files) |
| 4 | Slice 5 | expense signature revert | isolated call-site blast (1 route file) |
| 5 | Slice 6 | CartItem flat revert | highest blast radius (~15+ files) — schedule after 1-5 |
| 6 | Slice 7 | BaseService\<T\> reproduction | architectural, Option C ratified |
| 7 | Slice 8 | 3 feature-adds | independent, can slot anytime |
| 8 | Final | full-suite verification | after all above |

## Phase 1: Slice 1 — Online double-slash normalize [DONE — commit 13ccbb9]

- [x] 1.1 RED: extend `product-online-service.test.ts` to assert single-slash URLs for all 8 endpoints (`getProductById`, `hasAnyAvailableToSaleProduct`, `getProductsToSelect`, `getAvailableProductsByCategoryId`, `getProductsToSaleByCategoryId`, `deleteProduct`, `getMaxOrder`, `updateProduct`)
- [x] 1.2 GREEN: fix URL builders in `frontend-react/apps/web-store-pos/app/sales/lib/services/product-online-service.ts` (remove the extra `/` before each suffix; `API_URL` already ends in `/`) — grep `API_URL + '/'` to catch all 8
- [x] 1.3 Checkpoint: `tsc --noEmit` + run `product-online-service.test.ts` (15/15 pass)

## Phase 2: Slice 2 — Model field parity [DONE — commit d30ca7d]

- [x] 2.1 RED: update fixtures/assertions in `order-offline-service.test.ts`, `inventory-offline-service.test.ts`, `profit-calculator.test.ts`, `data-synchronizer-service.test.ts` to use `inventoryId` instead of `id` on `InventoryEntryCost`/`productCosts[]` entries
- [x] 2.2 GREEN: rename field in `packages/domain/src/models/order.ts` (`InventoryEntryCost.id → inventoryId`) and update producers/consumers: `order-offline-service.ts`, `inventory-offline-service.ts`, `profit-calculator.ts`
- [x] 2.3 RED: update `data-serializer-service.test.ts` to reference PascalCase entry-name construct
- [x] 2.4 GREEN: rename `ENTRY_NAMES` → `EDataFileName` in `frontend-react/apps/web-store-pos/app/sync/lib/services/data-serializer-service.ts`; rename keys to PascalCase (`categories→Categories`, `products→Products`, `inventoryEntries→InventoryEntries`, `orders→Orders`, `expenses→Expenses`, `saleCredits→SaleCredits`); string VALUES unchanged; update all `ENTRY_NAMES.x` call-sites in the same file
- [x] 2.5 RED: update `product-category-repository.test.ts` — `activateProductCategory`/`deactivateProductCategory` calls pass a 2nd `isActive` arg (inert)
- [x] 2.6 GREEN: restore 2-param signature `activateProductCategory(id, isActive)`/`deactivateProductCategory(id, isActive)` in `product-category-repository.ts` (no external call-sites confirmed by grep — only own file/test)
- [x] 2.7 Checkpoint: `tsc --noEmit` + run affected test files (order-offline, inventory-offline, profit-calculator, data-synchronizer, data-serializer, product-category-repository) — all green; full suite 1659/1659, tsc clean

## Phase 3: Slice 3 — Offline JSON exports

- [ ] 3.1 RED: add failing tests for `getSaleCreditsJson()` in `sale-credit-offline-service.test.ts` (raw JSON or `"[]"`, mirrors `getOrdersJson` pattern)
- [ ] 3.2 GREEN: add `getSaleCreditsJson(): string` to `sale-credit-offline-service.ts` (same `localStorage.getItem(...) || '[]'` shape as `order-offline-service.ts:571`)
- [ ] 3.3 RED: add failing tests for `getExpensesJson()` in `expense-offline-service.test.ts`
- [ ] 3.4 GREEN: add `getExpensesJson(): string` to `expense-offline-service.ts`
- [ ] 3.5 RED: add failing tests for `updateOrders(orders: Order[]): void` in `order-offline-service.test.ts` (bulk wholesale replace + persist, no partial merge/validation)
- [ ] 3.6 GREEN: add `updateOrders` to `order-offline-service.ts`
- [ ] 3.7 Checkpoint: `tsc --noEmit` + run the 3 offline-service suites

## Phase 4: Slice 4 — Visibility restoration (AFTER Phase 3 — same files)

- [ ] 4.1 Fresh grep: confirm zero external callers of `getActiveSaleCreditsPriceBetweenDates` (sale-credit-offline-service.ts:166) and `getActiveOrdersPriceBetweenDates` (order-offline-service.ts:148) outside own class + own test file
- [ ] 4.2 Adapt test call-sites: `sale-credit-offline-service.test.ts:616` and `order-offline-service.test.ts:918,1431` switch direct/spy calls to bracket-notation (`service['getActiveOrdersPriceBetweenDates'](...)`) since TS `private` blocks dotted access
- [ ] 4.3 GREEN: mark `getActiveSaleCreditsPriceBetweenDates` private in `sale-credit-offline-service.ts` and `getActiveOrdersPriceBetweenDates` private in `order-offline-service.ts`
- [ ] 4.4 Fresh grep: confirm `registerStoreActivity` (`store-usage-tracker.ts:103`) has exactly ONE production caller (`use-store-usage-tracker.ts`) — CONFIRMED CLEAN per current grep, no code change (module-exported hook idiom, rule 5); document as verified, not reverted. If a second caller is found, STOP and downgrade to a fork (do not apply silently).
- [ ] 4.5 Do NOT touch `getActiveInventoryEntriesStorage` (inventory-offline-service.ts) — DESCOPED/BLOCKED per spec (3 live callers + sibling service-base ratified requirement); explicitly excluded from this slice
- [ ] 4.6 Checkpoint: `tsc --noEmit` + run `sale-credit-offline-service.test.ts` + `order-offline-service.test.ts` + `use-store-usage-tracker.test.tsx`

## Phase 5: Slice 5 — Expense signature revert

- [ ] 5.1 RED: rewrite `expense-offline-service.test.ts` create/update cases to call positional `createExpense(expenseType, total, note, date, paymentType)` / `updateExpense(expenseId, expenseType, total, note, date, paymentType)` (Angular param order); update `expenses-routes.test.tsx` expectations
- [ ] 5.2 GREEN: rename `create(input)`→`createExpense(...)` and `update(id, patch)`→`updateExpense(...)` in `expense-offline-service.ts` with 5/6 positional params exactly per Angular order; `updateExpense` on missing id returns `DataResult(undefined, false, [NotExists])`, never throws; overwrites all 5 fields including `date`, stamps `updatedDate`/`updatedByName`
- [ ] 5.3 GREEN: adapt `today-expenses.tsx` call-sites to positional args — preserve UI convention: create always passes `new Date()`, update always reuses the original expense's `date` (form has no date field)
- [ ] 5.4 Checkpoint: `tsc --noEmit` + run `expense-offline-service.test.ts` + `expenses-routes.test.tsx`

## Phase 6: Slice 6 — CartItem flat revert (schedule after 1-5, highest blast radius)

- [ ] 6.1 RED: rewrite `cart-store.test.ts` for flat `CartItem = { productId: string; name: string; quantity: number; price: number }` (no embedded `Product`, `price` required); `addItem` derives `productId`/`name` from `product` at add-time (point-in-time copy, not live reference)
- [ ] 6.2 GREEN: change `CartItem` interface + all internal `cart-store.ts` logic (`addItem`, `removeItem`, `updateQuantity`, `total`, `getItemQuantity`) to read/write `productId`/`name`/`price` instead of `item.product.*`
- [ ] 6.3 Fresh grep + adapt consumers reading `item.product.*` / `CartItem` (grep-confirmed set, re-verify full list at apply): `cart-shell.tsx`(+test), `edit-order-details-modal.tsx`(+test), `today-stats.tsx`(+test), `sale.tsx`(+test), `egress.tsx`(+test), `category-stats.tsx`(+test), `category-cart-items-view.ts`, `product-availability.ts`, `sales-routes.test.tsx`, `inventory-routes.test.tsx` — each reads `item.productId`/`item.name`/`item.price` directly; anything needing full `Product` details fetches separately
- [ ] 6.4 Checkpoint: `tsc --noEmit` (compiler surfaces any missed consumer) + run full `sales`/`inventory`/`shared` test suites

## Phase 7: Slice 7 — BaseService\<T\> reproduction (Option C ratified — plain fields + getters, no RxJS/zustand bridge)

- [ ] 7.1 RED: write `packages/domain/src/services/__tests__/base-service.test.ts` — CRUD via mocked apiClient (catch-never-reject), reactive-state getters default values, `fetch()` populates `items`, `Success`/`Failure` behavior
- [ ] 7.2 GREEN: create `packages/domain/src/services/base-service.ts` — abstract `BaseService<T>`: HTTP CRUD (`create/getAllItems/getItemById/update/updateStatusForItems/delete/deleteItems`) ported Observable→Promise over `apiClient`; `Success/Failure` (sync) + `Success$/Failure$` (`Promise.resolve`) reusing `commons/envelope.ts`; Option C reactive block — private fields (`items`, `isLoading`, `isFirstLoading`, `errorMessage`) with getters, `fetch`/`patchState`/`patchStateWithoutFetch` mutate them; optional api-client constructor param
- [ ] 7.3 GREEN: re-parent `product-service.ts` and `product-category-service.ts` — `interface`→`abstract class extends BaseService<T>`; the 12/5 async signatures stay byte-for-byte unchanged
- [ ] 7.4 GREEN: switch concrete impls `implements`→`extends` + add `super()`: `product-offline-service.ts`, `product-online-service.ts`, `product-category-offline-service.ts`, `product-category-online-service.ts`
- [ ] 7.5 Verify: `product-service.factory.ts` return type still valid (abstract class is a usable type) — no change expected
- [ ] 7.6 GREEN: update test fakes — `FakeProductService`/`FakeProductCategoryService` in `product-service.test.ts`/`product-category-service.test.ts` switch `implements`→`extends` + `super()`
- [ ] 7.7 Fresh grep: enumerate `usageHttpService` consumers (admin dashboard); RED: adapt their tests for a class instance
- [ ] 7.8 GREEN: convert `usage-http-service.ts` (`usageHttpService` plain object) → class `extends BaseService<Usage>` (override `API_URL`, keep its 2 GET methods); adapt consumers to instantiate the class
- [ ] 7.9 GREEN: `packages/domain/src/models/base.ts` — `AuditableBaseModel` drops `extends BaseModel` (Angular does not extend either); keep standalone `BaseModel{id}`; keep `id: unknown` (not `any`) unless `tsc` fails
- [ ] 7.10 Checkpoint: `tsc --noEmit` (project-wide) + run `base-service.test.ts` + existing `product-service.test.ts`/`product-category-service.test.ts` + all product offline/online/factory suites (regression gate — async shapes A/B/C/D must stay green) + usage-http suites

## Phase 8: Slice 8 — Feature-adds (independent, no blast radius)

- [ ] 8.1 RED: write `splash-screen-service.test.ts` — opacity animates 1→0 over ~800ms then element removed/hidden; fade runs once (stopped guard); `hide()` before `init()` is a safe no-op
- [ ] 8.2 GREEN: create splash-screen module (mirrors Angular `SplashScreenService`: `init(element)`/`hide()`) under `frontend-react/apps/web-store-pos/app/shared/lib/splash/`; wire into `root.tsx` against the boot splash DOM node
- [ ] 8.3 RED: write `download-manager.test.ts` — SW `message` events: `INSTALLING`→`isDownloading=true,progress=0`; `DOWNLOADING{downloaded,total}`→`progress=round(downloaded/total*100)`; `INSTALLED`→after delay `progress=100` then `isDownloading=false`; `startDownload()`/`completeDownload()` explicit triggers
- [ ] 8.4 GREEN: create download-manager module under `frontend-react/apps/web-store-pos/app/shared/lib/download-manager/` (state via zustand or plain store, React idiom substitute for `BehaviorSubject`) + a small progress UI component wired near the existing `LoadingOverlay`
- [ ] 8.5 RED: write `error-handler.test.ts` — network-error patterns (`Failed to fetch`/`NetworkError`/`net::ERR`/status 0) logged but not surfaced; non-network errors show full-screen overlay (message + collapsible stack + dismiss), replacing (not stacking) prior overlay
- [ ] 8.6 GREEN: create global error-handler module registering `window.onerror` + `window.addEventListener('unhandledrejection', ...)` once at boot (alongside, not replacing, the existing `ErrorBoundary` in `root.tsx`); wire registration into `root.tsx`
- [ ] 8.7 Checkpoint: `tsc --noEmit` + run the 3 new test files + `root.tsx`-adjacent smoke test

## Phase 9: Final Verification

- [ ] 9.1 Run the full project test suite (all workspaces) — must be green
- [ ] 9.2 Run `tsc --noEmit` across the full monorepo
- [ ] 9.3 Confirm all 8 slice commits are present on `feat/frontend-parity-audit` in dependency order, each independently revertable (except Slice 4→3 coupling and Slice 7's `base.ts` as a unit, per proposal's Rollback Plan)
