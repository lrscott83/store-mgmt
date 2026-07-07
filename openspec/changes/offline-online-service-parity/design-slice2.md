# Design — Slice 2: Product/Category Repository + Service Parity

Governs proposal #671, decision #670, spec-slice2 #684, design-slice1 #674. File: `openspec/changes/offline-online-service-parity/design-slice2.md`. Governs **Slice 2 ONLY**. Angular `frontend/` is source of truth; formulas already pinned in spec #684 — this design decides HOW/WHERE, not re-derives WHAT.

## Architecture summary

React has **no separate repository class** — Slice-1 established one flat offline service per aggregate (`ProductOfflineService`, `ProductCategoryOfflineService`) over a shared `BaseRepository<T>` localStorage store. Every Angular *repository-layer* method therefore lands **directly on the flat offline service** (spec ambiguity #1/#2 resolved). Slice 2 closes Slice-1's deferred task 1.4: extend the two `packages/domain` interfaces, then make both offline classes `implements` them (tsc-enforced drift guard). Plain synchronous returns (design-slice1 ADR-1). No behavior change to existing methods except the pinned `getAll()` sort fix.

## ADRs

### ADR-1 — Repository methods land on the flat offline service (no repo class)
**Choice**: `activate`/`deactivate`/`getByName`/`getMaxOrder`/`getAvailableProductsByCategoryId` (Product) and `hasAnyCategory`/`hasAnyAvailableCategory`/`getMaxOrder`/`getAvailableProductCategories`/`getProductCategoriesView` (Category) go directly onto the existing offline service classes.
**Rejected**: introducing a `ProductRepository`/`ProductCategoryRepository` class mirroring Angular's layering — contradicts Slice-1's flat-service ADR and adds a delegation layer with zero React consumer.
**Rationale**: React state lives in Zustand at the component layer; the offline service already IS the persistence boundary. Spec #684 explicitly resolves these Angular repo-only methods onto the flat service.

### ADR-2 — Interface conformance mechanics (closes task 1.4)
**Choice**: Extend both `packages/domain` interfaces with the exact members below, add `implements ProductService` / `implements ProductCategoryService` to the offline classes, then run `pnpm -C packages/domain build` BEFORE app `tsc --noEmit` (design-slice1 ADR-2 gotcha: stale dist → app fails `no exported member`). Existing extras (`create`, `updateMany`, `search`, `addByName`) remain legal (ADR-4 structural-subset).
**Rejected**: leaving interfaces at Slice-1 surface and skipping `implements` — would silently permit offline↔online drift, defeating the whole program's compile-time guard.
**Rationale**: The extended surface only exists in Slice 2; interface edit + conformance must travel together (design-slice1 ADR-3).

### ADR-3 — `getProductCategoriesView` composition (single-pass, stricter predicate)
**Choice**: Instantiate `new ProductOfflineService(this.storeId)` inside `ProductCategoryOfflineService` (established cross-service pattern — cf. `order-offline-service.ts:212`), call `getAll()` **once**, build a `Map<categoryId, count>` counting products with `isActive && availableToSale`, then project over `getAvailableProductCategories()` (already order-sorted). Complexity O(P + C).
**Rejected**: calling `getAvailableProductsByCategoryId(catId).length` per category — (a) N full-product scans (N+1), and (b) WRONG predicate — that method filters `isActive` only; the view's `productsCount` requires the STRICTER `isActive && availableToSale`. Conflating them is the exact trap spec #684 flags.
**Rationale**: One pass, correct predicate, no import cycle (`product-category` → `product` is one-way; `product-offline-service.ts` imports neither).

### ADR-4 — `getMaxOrder` scope divergence kept distinct
**Choice**: `ProductService.getMaxOrder(categoryId: string): number` = max `order` among ALL products (active+inactive) in that category, 0 if empty. `ProductCategoryService.getMaxOrder(): number` = GLOBAL max `order` across ALL categories, 0 if none. Same name, different interfaces, different arity — no conflict.
**Rationale**: Categories have no per-category concept (spec #684). Do not unify into a shared helper.

### ADR-5 — `activate`/`deactivate` set ONLY `isActive` (no audit stamp)
**Choice**: Both flip `isActive` and re-`upsert`; do NOT touch `updatedDate`/`updatedByName` (unlike `delete`, which soft-deletes WITH audit stamp). No-op (no throw) when id missing.
**Rationale**: Matches Angular `ProductRepository.activate/deactivateProduct` exactly (spec #684). The 2nd `isActive` arg of Angular's `activate/deactivateProductCategory` is dead/ignored — dropped, not replicated (spec ambiguity #3). Side effect: NO `new Date()` collision risk (design-slice1's ms-collision gotcha does not apply — no timestamp written).

### ADR-6 — `getAll()` sort fix (MODIFIED, low blast-radius)
**Choice**: `ProductCategoryOfflineService.getAll()` returns categories `.sort((a,b) => a.order - b.order)` (matches Angular `getProductCategories()`).
**Blast-radius (verified via rg)**: 4 call-sites — `products.tsx:43`, `available.tsx:26`, `edit-inventory-entry-modal.tsx:57` (all display → sorting is an improvement); `data-serializer-service.ts:159` (serializes by id, order-insensitive); `order-offline-service.ts:213` (builds an order-lookup, output sorted separately). Existing tests CAT-03 (`toEqual([])`/`toHaveLength`) and CAT-01 incrementing-order are order-insensitive → stay green. Risk **Low**; expect one NEW sort assertion test, no churn to existing assertions.

## Interface-edit spec (`packages/domain/src/services/`)

```ts
// product-service.ts — ProductService extends BaseService<Product>, ADD:
getByName(name: string): Product | undefined;
getMaxOrder(categoryId: string): number;
getAvailableProductsByCategoryId(categoryId: string): Product[];
activate(id: string): void;
deactivate(id: string): void;

// product-category-service.ts — ProductCategoryService extends BaseService<ProductCategory>, ADD:
hasAnyCategory(): boolean;
hasAnyAvailableCategory(): boolean;
getMaxOrder(): number;
getAvailableProductCategories(): ProductCategory[];
getProductCategoriesView(): ProductCategoryView[];
```

New domain model (`packages/domain/src/models/product.ts`, export from `src/index.ts`):
```ts
export interface ProductCategoryView {
  id: string; name: string; order: number; isActive: boolean; productsCount: number;
}
```
Precedent: Slice-1 already places projection/view types (`InventoryEntryView`, `InventoryEntryCost`) in domain, so the interface references only domain types (design-slice1 ADR-2). **Rebuild `pnpm -C packages/domain build` after editing exports.**

## Method-placement table

| Method | File | Signature | Notes |
|---|---|---|---|
| getByName | product-offline-service.ts | `(name)→Product\|undefined` | exact match over ALL products, first wins |
| getMaxOrder | product-offline-service.ts | `(categoryId)→number` | per-category, all products, 0 empty |
| getAvailableProductsByCategoryId | product-offline-service.ts | `(categoryId)→Product[]` | categoryId match AND `isActive` (NOT availableToSale), asc by order |
| activate / deactivate | product-offline-service.ts | `(id)→void` | set ONLY isActive; no audit stamp; no-op if missing |
| hasAnyCategory | product-category-offline-service.ts | `()→boolean` | any category exists |
| hasAnyAvailableCategory | product-category-offline-service.ts | `()→boolean` | ≥1 `isActive` |
| getMaxOrder | product-category-offline-service.ts | `()→number` | GLOBAL max, 0 if none |
| getAvailableProductCategories | product-category-offline-service.ts | `()→ProductCategory[]` | active only, asc by order |
| getProductCategoriesView | product-category-offline-service.ts | `()→ProductCategoryView[]` | ADR-3; productsCount = `isActive && availableToSale` |
| getAll (MODIFIED) | product-category-offline-service.ts | `()→ProductCategory[]` | ADR-6 sort by order |

## Testing strategy (strict TDD — `pnpm test`, separate `tsc --noEmit`, `build`)

| Layer | What | Approach |
|---|---|---|
| Unit (pure filters/sorts) | getByName, getMaxOrder (both scopes), getAvailableProductsByCategoryId, getAvailableProductCategories, hasAny*, getAll sort | Deterministic seed+assert; RED before impl. No date collision (methods don't stamp dates) |
| Unit (activate/deactivate) | flips isActive only, no updatedDate change, no-op on missing id | Assert `updatedDate` unchanged (RED guards against accidental audit stamp) |
| Unit (view) | getProductCategoriesView | Seed active+inactive categories + products with mixed isActive/availableToSale; assert stricter predicate (a product `isActive && !availableToSale` is EXCLUDED from count but INCLUDED by getAvailableProductsByCategoryId); assert inactive categories absent, ascending order |
| Conformance (compile-time) | 2 scenarios | `implements` added → `tsc --noEmit` green after domain rebuild is the oracle |

## Review Workload Forecast

- Changed lines (with tests): non-test ~90 (domain ~18, product ~35, category ~40), tests ~220 → **~310 total**.
- **400-line budget risk: Medium** (tests push it near budget).
- **Chained PRs recommended: No** (one cohesive slice; ~2 work-unit commits).
- **Decision needed before apply: No.**
- Suggested work-unit split: **WU1** ProductService interface + ProductOfflineService 5 methods + implements + domain rebuild + tests; **WU2** ProductCategoryService interface + `ProductCategoryView` model + ProductCategoryOfflineService 5 methods + getAll sort + implements + domain rebuild + tests. WU2 has no hard dep on WU1 (view uses its own predicate + product `getAll()` which already exists), so both are independently reviewable; commit WU1 first to amortize the domain rebuild.

Next: sdd-tasks (Slice 2).
