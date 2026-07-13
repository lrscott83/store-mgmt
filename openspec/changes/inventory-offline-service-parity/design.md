# Design: inventory-offline-service-parity (Fase 4 close)

## Technical Approach

Realign the 4 ratified rule-3 divergences on React `InventoryOfflineService` to Angular
`inventory-offline.service.ts` EXACTLY (gates #1049 — all strict parity), then repair the
call-site + test-mock ripple. Two interlocked write/read contracts drive everything:

- **GATE-A stores the real `categoryId` on the entry** (`createInventoryEntry` derives it
  internally). Once entries carry a real `categoryId`, **GATE-B's `getInventoryCategoriesView`
  can group by `entry.categoryId` and source the category NAME from the category repo** —
  exactly like Angular — and no longer needs the caller-supplied `products` crutch.
- `deleteInventoryEntry` (GATE #2) and `getInventoryEntriesInDay` (GATE #3) are rename +
  param-order / ignore-date body changes.

No new top-level DI: constructor stays `(storeId, productRepository)`. Scope is strictly the
4 methods + their 2 Observable siblings + ripple; every other method, the 2 ratified bug fixes,
`update`/`updateInventoryEntry`, and the eligibility/ADR-2 items are UNTOUCHED (non-goals).

## Architecture Decisions

### Decision: create derives categoryId + date internally (GATE-A)

**Choice**: `createInventoryEntry(productId, quantity, costPrice)`. Drop `categoryId` and `date`
params. Set `entry.categoryId = productRepository.getStorageProductsMap().get(productId).categoryId`
and a SINGLE `const date = new Date()` used for BOTH `entry.date` and `entry.createdDate`
(mirror Angular lines 70,80,83). Missing product → return bare `null` (Angular 62-63, retained).
**Alternatives**: keep caller-supplied categoryId/date (React enhancement / backdating).
**Rationale**: gates ratified strict parity; the empty-`categoryId` write was the latent bug that
forced GATE-B's `products` param. Fixing it here unblocks GATE-B.

### Decision: deleteInventoryEntry rename + param order (GATE #2)

**Choice**: `deactivate(entryId, productId)` → `deleteInventoryEntry(productId, entryId)`
(Angular 179). Body unchanged (soft-delete via `isNotSoldEntry` guard).
**Rationale**: rule 3 name + Angular param order. Pure signature realignment.

### Decision: getInventoryEntriesInDay ignores its date arg (GATE-C)

**Choice**: `getByDate(date)` → `getInventoryEntriesInDay(date)`. Body ALWAYS uses
`startOfDay(new Date())`..`+1d` (Angular 252-258) — the `date` param is accepted but IGNORED.
**Alternatives**: keep React's honor-the-date body (treat Angular as a bug).
**Rationale**: gates ratified literal Angular mirror. **Verified: NO production caller passes a
non-today date** (all pass `new Date()`/today) → behaviorally moot; only the `getByDate` unit
tests (INV-08) assert date-honoring and are rewritten.

### Decision: getInventoryCategoriesView sourcing (GATE-B) — expose the wrapped category repo

**Choice**: `getAvailableByCategory(products=[])` → `getInventoryCategoriesView()` (zero-arg).
Group active entries by `entry.categoryId`; product NAME from
`productRepository.getStorageProductsMap()`; category NAME from a `ProductCategoryRepository`
reached via a new accessor `ProductRepository.getCategoryRepository()` →
`.getStorageCategoriesMap()` (mirrors Angular's `categoryRepository.getStorageCategoriesMap()`,
288).

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Denormalized `Product.categoryName` shortcut | zero deps but different sourcing path than Angular | Rejected (GATE-B forbids) |
| Add `categoryRepository` as 3rd top-level DI param | exact Angular DI, but widens DI | Rejected (gate: keep 2-param DI) |
| **Accessor on ProductRepository → wrapped instance** | tiny accessor invention; reuses the already-constructed repo, same cache, zero new top-level dep | **Chosen** |
| Construct `new ProductCategoryRepository(storeId)` inside the service | second divergent instance + own cache; service imports/`new`s the class | Rejected |

**Rationale (rule 12)**: Angular's service holds a `ProductCategoryRepository` and calls
`getStorageCategoriesMap()`. React's manual DI already threads that exact repo INTO
`ProductRepository` (`new ProductRepository(storeId, new ProductCategoryRepository(storeId))` at
every call-site). The accessor SURFACES an existing wrapped dependency — it invents no behavior,
no new class/abstraction, and no new top-level dep — the thinnest bridge to Angular's exact
sourcing call, consistent with how the file already compensates for dropped framework DI.

### Decision: retain previously-ratified body divergences (out of scope)

`getInventoryCategoriesView` keeps the existing skip-zero-available + NaN-avoidance
(diff-matrix #4) and the product-existence skip (matches Angular's `getActiveInventoryEntriesStorage`
guard). These were ratified earlier; GATE-B is narrowly about NAME sourcing, not aggregation.
Flagged so verify treats them as KNOWN retained, not new drift.

## Data Flow

```
createInventoryEntry(pId,qty,cost)
   └─ productRepository.getStorageProductsMap().get(pId).categoryId ──► entry.categoryId
                                                        new Date() ──► entry.date & createdDate

getInventoryCategoriesView()
   ├─ getStorageActiveInventoryEntries() ──groupBy(entry.categoryId)
   ├─ productRepository.getStorageProductsMap()            ──► product NAME
   └─ productRepository.getCategoryRepository()
            .getStorageCategoriesMap()                     ──► category NAME
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `inventory/lib/services/inventory-offline-service.ts` | Modify | 4 renames+bodies (GATE A/B/C + #2); add private `getStorageActiveInventoryEntries()` (Angular 50-52); Observable siblings delegate to renamed methods; `getInventoryCategoriesViewObservable()` drops `products` param |
| `sales/lib/repositories/product-repository.ts` | Modify | add `getCategoryRepository(): ProductCategoryRepository` accessor (GATE-B) |
| `inventory/components/edit-inventory-entry-modal.tsx` | Modify | REMOVE the date field, `date` state, `todayString()`, and `date` from `EditInventoryEntryInput` (Angular modal has NO date field — rule 12) |
| `inventory/routes/today-entries.tsx` | Modify | `createInventoryEntry(pId,qty,cost)` (drop `''`,`new Date(data.date)`); `deleteInventoryEntry(entry.productId, entry.id)`; `getInventoryEntriesInDay(new Date())` |
| `inventory/routes/today-quantities.tsx` | Modify | `getInventoryEntriesInDay(today)`; `getInventoryCategoriesView()` (drop `enriched`) |
| `inventory/routes/today-sales-profit.tsx` | Modify | `getInventoryEntriesInDay(today)` |
| `inventory/routes/available.tsx` | Modify | `getInventoryCategoriesView()`; remove now-dead `enriched` + the product/category async fetches that only fed it |
| `reports/lib/services/inventory-today-sale-service.ts` | Modify | `getInventoryEntriesInDay(date)` |
| `inventory/lib/services/__tests__/inventory-offline-service.test.ts` | Modify | rename describes/calls; rewrite INV-08 (ignore-date); `getInventoryCategoriesView` tests seed a `ProductCategoryRepository` + drop `enrichedProduct` `products` arg; create tests drop categoryId/date args + assert derived categoryId |
| `inventory/routes/__tests__/inventory-routes.test.tsx` | Modify | mock keys `create/deactivate/getByDate/getAvailableByCategory` → `createInventoryEntry/deleteInventoryEntry/getInventoryEntriesInDay/getInventoryCategoriesView`; flip deactivate assertion `('e1','p1')`→ delete `('p1','e1')`; drop the `getAvailableByCategory` products-mirroring override; create-arg assertion |
| `inventory/components/__tests__/inventory-components.test.tsx` | Modify | drop any date-field assertion for `EditInventoryEntryModal` |

## Interfaces / Contracts

```ts
// ProductRepository (GATE-B wiring)
getCategoryRepository(): ProductCategoryRepository { return this.categoryRepository; }

// InventoryOfflineService — realigned surface
createInventoryEntry(productId: string, quantity: number, costPrice: number): DataResult<InventoryEntryView> | null
deleteInventoryEntry(productId: string, entryId: string): Result
getInventoryEntriesInDay(date: Date): BaseResponseModel<InventoryEntryView[]>   // date ignored → today
getInventoryCategoriesView(): BaseResponseModel<InventoryCategoryView[]>        // zero-arg
getInventoryEntriesInDayObservable(date): Promise<...>       // delegates, unchanged
getInventoryCategoriesViewObservable(): Promise<...>         // drops products param

// EditInventoryEntryInput loses `date`
interface EditInventoryEntryInput { productId: string; quantity: number; costPrice: number; }
```

## Testing Strategy (Strict TDD — RED first)

| Layer | RED assertion |
|-------|---------------|
| Unit — createInventoryEntry | seed product `p1{categoryId:'cat-9'}`; `createInventoryEntry('p1',5,3)` → stored `entry.categoryId==='cat-9'` (NOT `''`); `entry.date===entry.createdDate` (same instant); missing product → `null`; 3-arity signature |
| Unit — deleteInventoryEntry | `deleteInventoryEntry('p1','e1')` (productId first) deactivates `e1`; swapped order does not find; sold-entry guard fails |
| Unit — getInventoryEntriesInDay | seed one YESTERDAY + one TODAY entry; call with a NON-today arg → returns only TODAY (arg ignored) — replaces INV-08 date-honoring cases |
| Unit — getInventoryCategoriesView | seed category `cat-1{name:'Bebidas'}` in ProductCategoryRepository + product `p1{categoryId:'cat-1'}`; create entry; `getInventoryCategoriesView()` (no args) → `categoryName==='Bebidas'` sourced from category repo, product grouped under `cat-1` |
| Integration — routes | today-entries create/delete/reload; today-quantities + available render via renamed zero-arg getter; mock keys + arg-order assertions updated |

## Work-Unit Breakdown

- **WU1 — service + repo + service tests**: rename/rebody the 4 methods + Observable siblings,
  add `getStorageActiveInventoryEntries` helper + `ProductRepository.getCategoryRepository()`;
  RED→GREEN the service unit tests (INV-08 rewrite, categories-view sourcing, create derivation,
  delete param order).
- **WU2 — call-site + form + report ripple + route/component mocks**: today-entries, today-quantities,
  today-sales-profit, available, inventory-today-sale-service, the modal date-field removal, and
  the route/component test mocks + assertion flips.

**Review Workload Forecast**: estimated changed lines > 400 (heavy strict-TDD mock ripple).
Decision needed before apply: No. Chained PRs recommended: No. 400-line budget risk: High —
but delivery is **commits-only on `feat/frontend-parity-audit`** (per settled policy): land WU1
then WU2 as separate work-unit commits; no PR split, no `size:exception` needed.

## Migration / Rollout

No schema change. **Data caveat (RISK, not blocker)**: pre-existing localStorage entries created
by the OLD React `create` carry `categoryId:''`. After GATE-B groups by `entry.categoryId`, those
collapse under `''` and `getStorageCategoriesMap().get('')` is `undefined` — Angular accesses
`.name` unguarded (would throw on Available/Quantities screens). Angular never hit this (always
stored real ids). Recommend mirroring Angular (no guard) for strict parity and re-creating stale
entries; a defensive `if(!storageCategory) continue` would be a rule-12 invention — flagged for
orchestrator decision rather than silently added.

## Open Questions

- [ ] getInventoryCategoriesView on a MISSING product / MISSING category: mirror Angular's
  unguarded `.name` (may throw) vs. retain React's skip? Recommend retaining the product-existence
  skip (matches Angular's `getActiveInventoryEntriesStorage` guard) and surfacing the empty-`''`
  category case as the data caveat above.
