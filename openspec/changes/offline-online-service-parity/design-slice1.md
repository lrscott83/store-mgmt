# Design — Slice 1: Formal Interfaces + Offline Query/Financial APIs + Statistics Expense-Netting Fix

> Change `offline-online-service-parity` (frontend-parity-audit, Angular `frontend/` → React `frontend-react/`, branch `feat/frontend-parity-audit`). Governs Slice 1 ONLY. Store: hybrid. STRICT TDD active.
> Reads: proposal #671, decision #670, explore #669, init #64.

## Technical Approach

Slice 1 does three things, in one compile-safe unit:

1. **Introduce formal TS interfaces** (`BaseService<T>`, `ProductService`, `ProductCategoryService`) in `packages/domain`, and make the current **offline** Product/Category services `implements` them. This is a *tsc drift guard* scaffold and the anchor for Slice 3's online layer — no behavior changes, pure type binding.
2. **Port the missing offline query/financial/filter methods** onto the React `OrderOfflineService` / `ExpenseOfflineService` / `SaleCreditOfflineService` / `InventoryOfflineService`, derived formula-by-formula from Angular source (Angular's Observable/`BaseResponseModel` wrappers collapse to plain synchronous returns — React's established contract).
3. **Fix the statistics expense-netting divergence** in `statistics-aggregation-service.ts#getDailyProfit` so daily profit subtracts that day's active expenses (matching Angular's intent), while KEEPING React's already-correct per-day window (NOT replicating Angular's broken date-window bug).

The interfaces are the only cross-cutting architecture; the rest is method-level porting whose risk is entirely in getting each Angular formula (date boundaries, `isActive` filters, profit math) byte-exact.

## Return-Type Contract Decision (binding for the whole program)

**Plain synchronous returns. NO `Result`/`DataResult` wrapper, NO Observable, NO `BaseResponseModel<T>`.**

Every existing React offline service already returns plain values: reads return `T` / `T | undefined` / `T[]` / `number`; mutations return the mutated entity or `void` and **throw a sentinel `Error` on not-found** (e.g. `OrderOfflineService.update` throws `Order not found: ${id}`; `ExpenseOfflineService.update` throws `EXPENSE_NOT_FOUND`). Angular's `Observable<BaseResponseModel<T>>` / `DataResult<T>` / `Result` are unwrapped to their `.data` payload; Angular `Result`-returning commands (`activateOrder`, `amortizeSoldEntry`) become `void`-returning-and-throwing to match the existing `deactivate`/`update` precedent. This is consistent with 100% of the React service layer and is non-negotiable for interface design.

## Architecture Decisions (ADR)

| # | Decision | Rejected alternative | Rationale |
|---|----------|---------------------|-----------|
| ADR-1 | **Interfaces are synchronous** — plain domain returns, mirroring the offline reality (`getById(id): Product \| undefined`, not `Promise`/`Observable`). "Online-ready" is achieved at the *type-contract* level (method names, params, domain return types match Angular's semantic surface), NOT the sync/async level. | (a) `Promise<T>` interface now (mirror Angular's async-everywhere, offline wraps in `Promise.resolve`); (b) `T \| Promise<T>` union. | Every current React caller is synchronous and the offline-first PWA is built on synchronous `localStorage`. Promise-ifying now = a massive out-of-scope breaking rewrite of every method + every caller, for a kill-switch (`USE_ONLINE_SERVICE`) hardcoded `false`. Slice 1's job is "make offline conform"; the interface must describe offline's actual shape. |
| ADR-2 | Interfaces live in `packages/domain/src/services/`, exported from `src/index.ts`, referencing **only domain entities** (`Product`, `ProductCategory`) — no app-layer view types. | Put interfaces in the app; or pull view types (`ProductSelectView`, `TopProduct`…) into domain now. | Keeps domain pure and the Slice-1 interface minimal-but-real. View-returning methods (and their view-type placement) are deferred to Slice 2, which extends the interfaces. **Gotcha: run `pnpm -C packages/domain build` after editing exports** or the app's tsc fails "no exported member" (init #64). |
| ADR-3 | Slice-1 interfaces declare only the surface the **current** offline services already satisfy (so the slice compiles). Slice 2 *extends* each interface as it adds methods (`getMaxOrder`, `getProductByName`, `activate/deactivate`, view getters); each interface addition + its offline conformance travel together in Slice 2. | Declare Angular's full abstract surface in Slice 1. | Declaring Slice-2 methods in a Slice-1 interface makes Slice 1 fail to compile (offline lacks them). Phase boundaries must stay green. |
| ADR-4 | Interface conformance is **structural subset**: `class …OfflineService implements ProductService` requires the declared methods; the class keeps EXTRA methods freely (`search`, `updateMany`, `getByDateRange`, `addByName`). Online impls (Slice 3) must satisfy the same subset. | Force interfaces to enumerate every concrete method. | TS interfaces are subset contracts; extras are legal. Drift (missing method / changed signature/return) becomes a compile error — exactly the guard we want. |
| ADR-5 | Ported financial helpers use **raw Angular date boundaries** (`date >= start && date < end`, `start`/`end` already snapped by the caller), via new *private* `active*Between(start,end)` helpers — NOT the existing public `getByDateRange`, which day-snaps internally (`startOfDay(from)`, `startOfDay(addDays(to,1))`) and would double-snap. | Reuse `getByDateRange`. | Angular's price/profit/total methods pass pre-snapped boundaries and filter with raw `>=start && <end`; day-snapping inside would corrupt "yesterday"/"before" windows. |
| ADR-6 | **Statistics fix keeps React's correct per-day window; only adds expense subtraction.** Angular's `getLastMonthSaleProfits` has a date-window BUG (`startDate = startOfDay(today)` on *every* iteration → all but the last day compute empty/inverted windows). React must NOT replicate that; it keeps `loadLast30Days`' correct buckets and subtracts each day's active expenses. | Port Angular's loop verbatim. | Per angular-bugs-policy: the *intent* (net out expenses) is the fix; Angular's broken window is a bug we do not carry over. |
| ADR-7 | Where Angular source is itself **buggy** (`updateAvailableInventories` decrement, cross-product `updateInventoryEntry` old/new-list mix-up, `getOrdersInDay`/`getActiveOrdersInDay`/`getExpensesInDay` ignoring their `date` param), React ports the **corrected** behavior and the RED test encodes the hand-derived correct value (angular-bugs-policy). | Replicate Angular runtime output. | Parity = contracts, not defects. These have NO valid Angular oracle. |

## Interface Shapes (compact — `packages/domain/src/services/`)

```ts
// base-service.ts
import type { BaseModel } from '../models/base';
// React data-access contract shared by offline (localStorage) + online (api-client) impls.
// Synchronous plain returns — NOT Angular's Observable<BaseResponseModel<T>>.
// Angular BaseService's reactive-state surface (items$, isLoading$, BehaviorSubject, http,
// fetch/patchState…) is INTENTIONALLY ABSENT: React state lives in Zustand at the component
// layer, not in services.
export interface BaseService<T extends BaseModel> {
  getAll(): T[];
  getById(id: string): T | undefined;
  delete(id: string): void;
}

// product-service.ts
import type { BaseService } from './base-service';
import type { Product } from '../models/product';
export interface ProductService extends BaseService<Product> {
  getByBarcode(barcode: string): Product | undefined;   // ⟵ Angular getProductByBarcode
  update(product: Product): Product;
  // Slice 2 extends: getByName, getMaxOrder(categoryId), activate/deactivate,
  //   getAvailableProductsByCategoryId, getProductsToSelect, createCsvProducts…
}

// product-category-service.ts
import type { BaseService } from './base-service';
import type { ProductCategory } from '../models/product-category'; // NOTE: category model export
export interface ProductCategoryService extends BaseService<ProductCategory> {
  getByName(name: string): ProductCategory | undefined;
  save(category: ProductCategory): ProductCategory;
  // Slice 2 extends: getMaxOrder(), getProductCategoriesView(),
  //   getAvailableProductCategories()…
}
```

Conformance wiring (Slice 1): `export class ProductOfflineService implements ProductService`, `export class ProductCategoryOfflineService implements ProductCategoryService`. Both already have every declared member (`getAll`/`getById`/`delete`/`getByBarcode`/`update`; `getByName`/`save`). `search()`, `updateMany()`, `create()`, `addByName()` remain as legal extras. **Note:** the React `ProductCategory` model is exported from `@store-mgmt/domain` — confirm the concrete export name/path when wiring (`models/product` re-exports category, or a dedicated `models/product-category`); adjust the import above accordingly. This is the only interface-side unknown to resolve at implementation.

**tsc drift guard demonstrated:** if `ProductOfflineService.getById` were `Product` (not `Product | undefined`), or `getByBarcode` were dropped/renamed, `implements ProductService` fails at `pnpm -C apps/web-store-pos exec tsc --noEmit`. Missing methods → compile error forcing implementation; extra methods → silently allowed.

## Per-Method Mapping — Slice 1 offline ports (Angular formula → React method)

All React methods are **synchronous**; `startOfDay`/`addDays`/`subDays` from `~/shared/lib/date-utils`. "active*Between(s,e)" = new private helper `getAll().filter(x => x.isActive && x.date >= s && x.date < e)` (raw boundaries, ADR-5). `T` reads run over `getAll()` (localStorage snapshot).

### OrderOfflineService — `app/sales/lib/services/order-offline-service.ts`

| React method to ADD | Angular source (order-offline.service.ts) | Formula / composition |
|---|---|---|
| `activateOrder(id): void` | `activateOrder`→`updateOrderActive(id,true)` L313/330 | `getById`; throw if missing; set `isActive=true`, `updatedDate=now`, `updatedByName`; `repo.upsert`. **Flag:** activate is flag-only — it does NOT re-void credit or re-deduct inventory (only `deactivate` cascades). Mirror Angular. |
| `getActiveOrdersPriceBetweenDates(s,e): number` | `getActiveOrdersPriceBetweenDates` L167 | `activeOrdersBetween(s,e).reduce((t,o)=>t+o.total,0)` |
| `getActiveOrdersPriceToday(): number` | L172 | `s=startOfDay(now)`, `e=addDays(s,1)` → priceBetween |
| `getActiveOrdersPriceYesterday(): number` | L178 | `s=startOfDay(subDays(now,1))`, `e=startOfDay(now)` |
| `getActiveOrdersProfitBetweenDates(s,e): number` | L184 + `getOrderItemProfit` L194 | `activeOrdersBetween(s,e).flatMap(o=>o.orderItems).reduce((t,it)=>t+calculateOrderProfit(it).profit,0)`. **Reuse** `~/inventory/lib/profit-calculator` — its formula (`price*qty − Σ costPrice*qty`) is byte-identical to Angular's `getOrderItemProfit`. |
| `getActiveOrdersProfitToday/Yesterday(): number` | L199/205 | same boundaries as price today/yesterday |
| `getTopProductsProfitInLastMonth(): TopProduct[]` / `getTopProductsSaleQuantityInLastMonth(): TopProduct[]` | `getTopProductsInLastMonth(calcProfit,5)` L252/256/260 | `lastMonth=subDays(now,29)` (**RAW now, not startOfDay** — rolling instant window); `getAll().filter(isActive).filter(o=>o.date>=lastMonth && o.date<now)`; group items by `productId` into `Map<string,{id,name,value}>`; `value += calcProfit ? calculateOrderProfit(it).profit : it.quantity`; `Array.from(...).sort((a,b)=>b.value-a.value).slice(0,5)`. **Flag:** Angular's `top` param is ignored (hardcoded `slice(0,5)`) — React hardcodes 5 too. Define local `TopProduct = { id:string; name:string; value:number }` in sales lib (view type, ADR-2 keeps it out of domain). |
| `filterOrders(isCredit: number, paymentType: PaymentType \| undefined, startDate?: Date, endDate?: Date): Order[]` | `filterOrdersObservable` L290 (Observable→sync) | `getAll().filter(isActive).sort(date asc)` then `.filter(o => (isCredit===-1 \|\| (isCredit===1 && o.isCredit) \|\| (isCredit===0 && !o.isCredit)) && (!paymentType \|\| paymentType===o.paymentType) && (!startDate \|\| o.date>=startDate) && (!endDate \|\| o.date<endDate))`. Keep `isCredit` as tri-state **number** (−1 any / 1 credit / 0 non-credit) to match Angular exactly. |
| `getOrdersInDay(date): Order[]` | `getOrdersInDay` L305 (**Angular BUG: ignores `date`, always today**) | **FIX (ADR-7):** use the param → `s=startOfDay(date)`, `e=startOfDay(addDays(date,1))`; `getAll().filter(o=>o.date>=s && o.date<e).sort(date asc)` — **no `isActive` filter** (returns active+inactive; distinct from existing `getActiveOrdersInDay`). |
| `create(..., details?: string)` — add `details` param | `createOrder(...,details,client)` L42; React hardcodes `description = isCredit ? clientName : ''` | Append optional `details?: string` as the LAST param (preserve existing caller signatures/tests). `description = details && details.length ? details : (isCredit ? clientName : '')`. **Flag:** React keeps its own param order and appends `details`; Angular's order differs. Restores free-text notes on non-credit orders. |

### ExpenseOfflineService — `app/expenses/lib/services/expense-offline-service.ts`

| React method to ADD | Angular source (expense-offline.service.ts) | Formula |
|---|---|---|
| `getActiveExpensesPriceBetweenDates(s,e): number` | L146 | `activeExpensesBetween(s,e).reduce((t,x)=>t+x.total,0)` — **this is the method the statistics fix consumes.** |
| `getActiveExpensesPriceToday(): number` | L151 | `s=startOfDay(now)`, `e=addDays(s,1)` |
| `getActiveExpensesPriceYesterday(): number` | L157 | `s=startOfDay(subDays(now,1))`, `e=startOfDay(now)` |
| `getExpensesTotalBefore(date): number` | L117 | `getAll().filter(isActive && x.date<date).reduce(+total)` |
| `getExpensesTotal(): number` | L128 | `getExpensesTotalBefore(addDays(startOfDay(now),1))` |
| `getExpensesTotalYesterday(): number` | L134 | `getExpensesTotalBefore(startOfDay(now))` |
| `filterExpenses(type?, paymentType?, start?, end?): Expense[]` | `filterExpensesObservable` L97 (Observable→sync) | `getAll().filter(isActive).filter(x => (!type \|\| type===x.type) && (!paymentType \|\| paymentType===x.paymentType) && (!start \|\| x.date>=start) && (!end \|\| x.date<end))` |

> `getExpensesInDay` (Angular L106) is BUGGY (ignores `date`, sorts desc) and redundant with the existing `getActiveToday`/`getByDateRange` — NOT ported.

### SaleCreditOfflineService — `app/sales/lib/services/sale-credit-offline-service.ts`

| React method to ADD | Angular source (sale-credit-offline.service.ts) | Formula |
|---|---|---|
| `getSaleCreditsTotalBefore(date): number` | L170 | `getAll().filter(isActive && c.date<date).reduce(+total)` |
| `getSaleCreditsTotal(): number` | L181 | `getSaleCreditsTotalBefore(addDays(startOfDay(now),1))` |
| `getSaleCreditsTotalYesterday(): number` | L187 | `getSaleCreditsTotalBefore(startOfDay(now))` |
| `getActiveSaleCreditsPriceToday/Yesterday(): number` | L224/230 | `activeCreditsBetween(s,e).reduce(+total)`; today `[startOfDay(now), addDays(+1))`, yesterday `[startOfDay(subDays(now,1)), startOfDay(now))` |
| `getActiveUnpaidSaleCreditsPriceToday/Yesterday(): number` | L212/218 | as above but `.filter(c=>!c.isPaid)` before summing |
| `filterSaleCredits(isPaid: boolean, client?, start?, end?): SaleCredit[]` | `filterSaleCredits` L149 (Observable→sync) | `getAll().filter(isActive).filter(c => (!client \|\| c.client.includes(client)) && (!isPaid \|\| c.isPaid===isPaid) && (!start \|\| c.date>=start) && (!end \|\| c.date<end))`. **Note the Angular quirk:** `!isPaid \|\| c.isPaid===isPaid` — when `isPaid=false` the clause is always true (no paid filter); only `isPaid=true` filters. Replicate exactly. |

### InventoryOfflineService — `app/inventory/lib/services/inventory-offline-service.ts`

| React method to ADD | Angular source (inventory-offline.service.ts) | Formula / notes |
|---|---|---|
| `getInventoryCostTotalBefore(date): number` | L264 | active entries `filter(e.date<date).reduce((t,e)=>t+e.available*e.costPrice,0)` (over `getStorageActiveInventoryEntries` = flattened active) |
| `getInventoryCostTotal(): number` | L275 | `getInventoryCostTotalBefore(addDays(startOfDay(now),1))` |
| `getInventoryCostTotalYesterday(): number` | L281 | `getInventoryCostTotalBefore(startOfDay(now))` |
| `filterInventoryEntries(productId?, start?, end?): InventoryEntryView[]` | L217 (Observable→sync) | over active entry-views: `.filter(v => (!productId \|\| productId===v.productId) && (!start \|\| v.date>=start) && (!end \|\| v.date<end))`. Compose from existing `getAll()` (already active views). |
| `getInventoryEntriesView(): InventoryEntriesView[]` | L368 (Observable→sync, FIFO) | per product: `entries.filter(e=>e.available>0 && e.isActive).sort((a,b)=>a.order-b.order).map(e=>({ id:e.id, costPrice:e.costPrice, quantity:e.available }))`; `productAvailable = Σ quantity`; push `{ productId, productName, productAvailable, availableEntries }`. Define `InventoryEntriesView` in inventory lib. **Flag field-name divergence:** Angular's cost view uses `inventoryId`; React canonical `InventoryEntryCost.id` — emit `id` for consistency with `getAvailableInventoryCosts` (which already emits `id`) and `increaseQuantitiesByOrderItems` (normalizes `id ?? inventoryId`). |
| `amortizeSoldEntry(productId, entryId): void` | L142 | find entry in product list; throw `EntryNotExists` if missing; throw `SaleNotExistsWithThisEntry` if `quantity===available` (nothing sold); else `quantity -= available; available = 0`; persist. |
| `updateAvailableInventories(productId, quantity): boolean` | L463 (**Angular BUG**) | **FIX (ADR-7):** correct FIFO non-recording decrement. `entries = active, available>0, sort(order asc)`; if none → `false`; `let rem=quantity; for(e of entries){ if(rem<=0) break; const take=Math.min(rem,e.available); e.available-=take; rem-=take; }`; persist; `true`. Angular's `total -= i.available` AFTER zeroing `i.available` is a defect (never decrements total, over-zeros entries) — NOT replicated. |
| cross-product `updateInventoryEntry(oldProductId, entryId, newProductId, quantity, costPrice): InventoryEntry` | `updateInventoryEntry` L102 (**Angular has old/new-list mix-up bug L110-116**) | **FIX (ADR-7):** validate not-sold (`quantity===available`), validate new product available; locate entry via `oldProductId` list; if `old!==new`: remove from old product's list, set `entry.productId=new`, push to new product's list; set `quantity`, `available=quantity`, `costPrice`, `updatedDate/By`; persist both lists. Extends React's current same-product-only `update`. Decide: add as new method `reassignEntry(...)` OR widen `update` — recommend a distinct method to avoid breaking the existing `update(entryId,productId,quantity,costPrice)` callers/tests. |

## Statistics Expense-Netting Fix (exact location + formula)

**File:** `frontend-react/apps/web-store-pos/app/statistics/lib/services/statistics-aggregation-service.ts`
**Function:** `getDailyProfit(today = new Date()): DailyProfitPoint[]` (currently order-profit only, per-day: `Σ calculateOrderProfit(item).profit`).

**Change:**
1. Constructor: add `this.expenseService = new ExpenseOfflineService(storeId)` alongside `orderService`.
2. In `getDailyProfit`, after building the per-day order-profit map, subtract each day's **active** expenses:
   - Per-day formula (matches Angular `getLastMonthSaleProfits` L222-223 intent): `profit(day) = orderProfit(day) − expenseService.getActiveExpensesPriceBetweenDates(dayStart, addDays(dayStart,1))`, with `dayStart = startOfDay(dateForThatBucket)`.
   - Implementation: reuse the existing `loadLast30Days` buckets (index 0 = `from` = 29 days ago, index 29 = today). Either (a) call `getActiveExpensesPriceBetweenDates(dayStart, dayEnd)` per bucket (semantically exact, 30 calls), or (b) fetch active expenses in `[from, todayEnd)` once and bucket by `toDateStr` (single pass) — both provably equal; prefer (b) for efficiency, but the per-day price method is the semantic anchor.
3. **KEEP React's correct per-day window (ADR-6).** Do NOT import Angular's `startDate = startOfDay(today)`-every-iteration loop.
4. Update the class/`DailyProfitPoint` JSDoc: "Consumes `OrderOfflineService`" → "Consumes `OrderOfflineService` + `ExpenseOfflineService`". The `InventoryOfflineService is NEVER read (STAT-5)` invariant STILL HOLDS — expenses come from `ExpenseOfflineService`, not inventory. `getDailySales` is unchanged (revenue only).

**Existing-test impact** (`statistics-aggregation-service.test.ts`):
- Tests that seeded NO expenses stay GREEN (subtract 0).
- Any test asserting a specific `getDailyProfit` value with expenses present in fixtures must be re-derived (net of expenses).
- Add RED→GREEN cases: (a) day with orders + expenses → `profit = orderProfit − expenses`; (b) day with only expenses → negative profit; (c) soft-deleted/inactive expense excluded; (d) expense outside the 30-day range ignored; (e) expense on day N only affects bucket N.

## Observable → Sync Translation (contract preserved)

Angular `filter*Observable` / `get*Observable` return `Observable<BaseResponseModel<T[]>>` via `of(this.Success(arr))`. React returns the bare `T[]` synchronously — same params, same predicate, `.data` unwrapped, no `of()`, no `Success`.

| Angular (async) | React (sync) |
|---|---|
| `filterOrdersObservable(isCredit,paymentType,start,end)` | `filterOrders(isCredit,paymentType,start?,end?): Order[]` |
| `filterExpensesObservable(type,paymentType,start,end)` | `filterExpenses(type?,paymentType?,start?,end?): Expense[]` |
| `filterSaleCredits(isPaid,client,start,end)` (returns Observable) | `filterSaleCredits(isPaid,client?,start?,end?): SaleCredit[]` |
| `filterInventoryEntries(productId,start,end)` (returns Observable) | `filterInventoryEntries(productId?,start?,end?): InventoryEntryView[]` |
| `getInventoryEntriesView()` (returns Observable) | `getInventoryEntriesView(): InventoryEntriesView[]` |

## Strict-TDD Notes & Test-Oracle Gaps

Each ported method gets a RED→GREEN unit test derived from **Angular source formula** (Angular's own coverage is thin/absent — derive expected values by hand from the formula, seed localStorage fixtures, assert). Method-level RED tests live beside each service under `__tests__/`.

**No valid Angular runtime oracle — expected value MUST be hand-derived from source (do NOT cross-check against Angular runtime, which is buggy):**
- `getOrdersInDay` — Angular ignores its `date` param; test the FIXED (param-respecting) behavior.
- `updateAvailableInventories` — Angular's decrement is defective; test the CORRECT FIFO result.
- cross-product `updateInventoryEntry` — Angular's old/new-list handling is buggy; test the CORRECT reassignment.
- `getDailyProfit` netting — Angular's date-window loop is broken; test React's correct per-day netting.
- `getTopProducts*InLastMonth` — rolling raw-`now` window + hardcoded `slice(0,5)` (ignored `top`); derive from source semantics.

**Thin-but-usable oracle (formula straightforward, seed + assert):** all `getActive*Price*`, `get*Total*`, `filter*` methods — deterministic reductions/predicates; derive expected sums directly.

## File Changes (Slice 1)

| File | Action |
|------|--------|
| `packages/domain/src/services/base-service.ts` | Create — `BaseService<T>` interface |
| `packages/domain/src/services/product-service.ts` | Create — `ProductService` |
| `packages/domain/src/services/product-category-service.ts` | Create — `ProductCategoryService` |
| `packages/domain/src/index.ts` | Modify — export the three interfaces → **then `pnpm -C packages/domain build`** |
| `app/sales/lib/services/product-offline-service.ts` | Modify — `implements ProductService` |
| `app/sales/lib/services/product-category-offline-service.ts` | Modify — `implements ProductCategoryService` |
| `app/sales/lib/services/order-offline-service.ts` (+`__tests__`) | Modify — add 10 query/financial methods + `details` param + `TopProduct` type |
| `app/expenses/lib/services/expense-offline-service.ts` (+test) | Modify — add 7 price/total/filter methods |
| `app/sales/lib/services/sale-credit-offline-service.ts` (+`__tests__`) | Modify — add totals/price/unpaid/filter methods |
| `app/inventory/lib/services/inventory-offline-service.ts` (+`__tests__`) | Modify — add cost-total/filter/entries-view/amortize/updateAvailable/reassign + `InventoryEntriesView` type |
| `app/statistics/lib/services/statistics-aggregation-service.ts` (+test) | Modify — expense-netting in `getDailyProfit` + ctor dep + JSDoc |

## Risks

- **Slice-3 sync/async reconciliation (HIGH, deferred):** ADR-1's synchronous interface forces the future online impls to be synchronous too. Slice 3's design must choose: (a) a synchronous in-memory read-through snapshot (reads sync against snapshot; mutations optimistic-local + async HTTP replay) — the only way to keep this interface; or (b) escalate to a Promise-migration of the interface + all callers as a separate breaking change. Verify the live API contract can hydrate a snapshot before committing to (a).
- **Statistics numbers change (MED-HIGH):** dashboard daily-profit drops by expenses — visible behavioral change; regression-test fixtures and any snapshot baselines must be updated.
- **Formula drift (MED):** many methods, each with exact date-boundary/`isActive`/profit semantics; the private raw-boundary helpers (ADR-5) and the Angular-bug fixes (ADR-7) are the highest-error-risk spots.
- **`ProductCategory` domain export path unknown (LOW):** confirm the concrete `@store-mgmt/domain` export name before wiring `product-category-service.ts`.
- **domain rebuild gotcha (MED):** forget `pnpm -C packages/domain build` after editing `index.ts` → app tsc fails "no exported member" (init #64).

## Next
`sdd-tasks` (after Slice-1 spec is also ready).
