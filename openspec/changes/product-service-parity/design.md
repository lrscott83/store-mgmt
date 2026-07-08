# Design: Product Service Parity (Angular → React)

## Technical Approach

Make React's Product surface 100% faithful to Angular by mirroring both (a) Angular's
layer structure (interface / offline / online / product-repository / category-repository) and
(b) the async `BaseResponseModel<T>` envelope. Parity only. The proposal SETTLED async-both-sides,
repository-in-scope, online+DI-switch-in-scope, signature parity, envelope preserved —
this design honors those and does not re-open them. Two decisions are now RESOLVED and baked in:
(1) online `createProduct` omits `barcode` from its payload (mirror Angular, rule 8); (2) a real
`ProductCategoryRepository` is extracted and `ProductCategoryOfflineService` is re-wired to delegate
to it (mirror Angular's layer structure, rule 6) — an accepted scope expansion re-touching Category.

Grounding precedents already in the repo:
- Envelope model exists: `packages/domain/src/models/base.ts` (`BaseResponseModel`/`BaseError`).
- Async+envelope precedent exists: admin/mgmt http-services (`owner-http-service.ts`)
  return `Promise<BaseResponseModel<T>>` and resolve-with-envelope (never reject on domain failure).
- DI-switch precedent exists: `shared/lib/config/global-config.ts` (`USE_ONLINE_SERVICE`) +
  `shared/lib/services/service-factory.ts` (`createService(offline, online)`), a direct
  mirror of Angular's `GlobalConfig.USE_ONLINE_SERVICE` + `productServiceFactory`.
- Structural precedent: `ProductCategoryOfflineService` (direct `new Service(storeId)`, no DI container).

## Architecture Decisions

### Decision: Introduce a dedicated `ProductRepository` class (not inline in service)
**Choice**: New `apps/web-store-pos/app/sales/lib/repositories/product-repository.ts` wrapping the
storage-only `BaseRepository<Product>`, hosting ALL business rules (validations, order-shift,
soft-delete, activate/deactivate, setDiscountFromInvantory, repo query methods).
**Alternatives**: inline rules in offline service (as ProductCategory did).
**Rationale**: Angular HAS a distinct `ProductRepository` class — a dedicated class is MORE
faithful, not a deviation. Product carries 3 validations (category-exists, barcode-uniqueness,
name-uniqueness-per-category) + order-shift + soft-delete + repo-only activate/deactivate,
warranting the layer Angular already models. This change ALSO reverses the earlier Category collapse
by extracting a real `ProductCategoryRepository` (see the dedicated decision below), so both
repositories now mirror Angular 1:1. Isolates the suspected-bug seams and enables focused tests
where Angular has no `ProductRepository.spec`.

### Decision: Extract a real `ProductCategoryRepository` and reconcile `ProductCategoryOfflineService` to Angular's exact surface
**Choice**: New `apps/web-store-pos/app/sales/lib/repositories/product-category-repository.ts`
mirroring Angular's `application/categories/product-category.repository.ts` public surface EXACTLY
(its own class wrapping the storage-only `BaseRepository<ProductCategory>`). Angular's repository has
NO generic `upsert`/`remove`; the extracted React repository MUST NOT declare them (Exact-Surface
Rule). The existing `ProductCategoryOfflineService` (which today inlines category persistence
directly against `BaseRepository`, Slice-2 collapse, AND exposes React-only methods `save`/
`addByName`/`getByName`/`hasAnyCategory`/`hasAnyAvailableCategory`) is RECONCILED to expose ONLY
Angular's public category-service surface (`getProductCategories`, `getAvailableProductCategories`,
`getProductCategoriesView`, `createProductCategory`, `updateProductCategory`, `getMaxOrder`) and
delegate persistence to this repository. `ProductRepository` depends on `ProductCategoryRepository`
directly (NOT on `ProductCategoryOfflineService`), exactly as Angular's `ProductRepository`
constructor injects `ProductCategoryRepository` (product.repository.ts:22) and
`ProductOfflineService` injects it too (product-offline.service.ts:20).

**Layering (React, after this change):**

    ProductOfflineService ──delegates──▶ ProductRepository ──depends on──▶ ProductCategoryRepository
            │                                                                     ▲
            └───────────── also depends on (CSV/select orchestration) ───────────┘
    ProductCategoryOfflineService ──re-wired to delegate──▶ ProductCategoryRepository
    ProductRepository / ProductCategoryRepository ──▶ BaseRepository<T> (localStorage)

**Category-repository surface consumed by the product layer** (mirror Angular
product-category.repository.ts): `getProductCategoryById` (category-exists validation),
`hasAnyAvailableCategory` (`hasAnyAvailableToSaleProduct`), `getProductCategories`
(`getProductsToSelect`), `getProductCategoryByName` + `addProductCategoryByName`
(`createCsvProducts`). The broader Angular category-repository surface (add/update/order-shift/
activate-deactivate) is extracted as-is for layer fidelity but is exercised by the Category service.

**Alternatives**: keep category collapsed in `ProductCategoryOfflineService` and let
`ProductRepository` call the *service*. Rejected: Angular's `ProductRepository` depends on the
category *repository*, not the category *service* — collapsing would break layer parity (rule 6)
and create a repository→service dependency Angular does not have.
**Rationale**: Angular HAS a distinct `ProductCategoryRepository`; the Slice-2 collapse was a
convenience that this change corrects. This is an ACCEPTED scope expansion that re-touches Category.
The persisted data and storage keys are preserved, but the SERVICE SURFACE is NOT preserved as-is —
non-Angular methods are removed and their call sites re-expressed (Exact-Surface Rule). We do NOT
add `upsert`/`remove` bridges to keep the old `save`/`delete` alive: that would violate the rule.

### Decision: Online `createProduct` omits `barcode` from payload (mirror Angular asymmetry)
**Choice**: React `ProductOnlineService.createProduct` implements the full 9-param interface
(accepts `barcode?`) for type conformance with the shared `ProductService`, but its POST body to
`Products/` MUST NOT include a `barcode` field — replicating Angular's online `createProduct`
(product-online.service.ts:71-93), which declares only 8 params and sends no barcode. Angular's
online `updateProduct` DOES send `barcode`; only `createProduct` drops it.
**Alternatives**: add `barcode` to the online create payload (would "fix" the asymmetry).
**Rationale**: This is a suspected Angular asymmetry, not a defect we may silently correct (rule 8).
Resolved decision = MIRROR. Marked with an `ANGULAR-BUG-SUSPECT` seam so a future confirmed fix is a
one-line addition + test flip.

### Decision: Async `Promise<BaseResponseModel<T>>`, resolve-with-envelope
**Choice**: Every one-shot Angular `Observable<BaseResponseModel<T>>` → `Promise<BaseResponseModel<T>>`.
Success and domain-failure BOTH resolve the envelope (`succeeded:false`, `data:null/false`,
`actionCode:400`, populated `errors: BaseError[]`). `reject` reserved for transport/infra errors only.
**Alternatives**: reject-on-failure; keep sync (ProductCategory precedent).
**Rationale**: Mirrors Angular's `Success$`/`Failure$` (never throws on domain failure) AND the existing
http-service precedent (returns `response.data` envelope). Repository throws typed domain errors;
offline service try/catch maps them to a Failure envelope, preserving error codes → no flattening (rule 9).
**Shared mechanic**: this is IDENTICAL to `service-return-shape-parity/design.md` ADR-2's category-C rule — success `Promise.resolve(success(x))`, domain failure `Promise.resolve(failure(errors))` over sync localStorage (same-tick fake async). Product/ProductCategory are 100% category C, so both changes share one mechanic; reuse the `commons/envelope.ts` `success`/`failure` factories verbatim.
**Rule-4 check**: all 12 abstract methods are one-shot — no multi-emission stream needs a Promise. The
inherited `BaseService` BehaviorSubject streams (`items$` etc.) are unused for Product (zero call sites),
handled by Zustand per ADR-1 — safely dropped, not an "ask" trigger.

### Decision: Additive coexistence migration (rename-safe), not double-rewrite
**Choice**: Angular names DIFFER from current React names (`getProductById`≠`getById`,
`createProduct`≠`create`, `deleteProduct`≠`delete`, `updateProduct`≠`update`, `getProductByBarcode`≠
`getByBarcode`). So the new async Angular-named surface is added ALONGSIDE the existing sync methods,
call sites migrate incrementally, and the dead sync surface is removed in the final slice.
**Alternatives**: big-bang rewrite (breaks 400-line budget, not shippable); migrate-in-place per concern
(rewrites return types + call sites twice across the signature-then-async slices).
**Rationale**: Every intermediate state compiles and tests stay green; each method is migrated ONCE
(renamed+async+enveloped+validated) with its call sites. This makes the 7 slices independently shippable.

### Decision: `createProductService(storeId)` factory gated by `GlobalConfig.USE_ONLINE_SERVICE`
**Choice**: New `product-service.factory.ts` returning `USE_ONLINE_SERVICE ? online : offline` typed as the
async `ProductService`. Call sites move from `new ProductOfflineService(storeId)` → `createProductService(storeId)`.
**Alternatives**: reuse generic `createService` (its `ServiceImpl<T>` is sync/CRUD-shaped — doesn't fit async ProductService).
**Rationale**: Same GlobalConfig gate as the existing precedent; dedicated typing for the async contract. Online is reference-only (never validate a live backend, rule 1).

### Decision: `ProductService` becomes standalone async (drops `extends BaseService<Product>` in cleanup)
**Rationale**: Angular's base is async; React's `BaseService` is the shared SYNC contract used by other
services (ProductCategory). Reconciling the generic `BaseService` is cross-cutting and belongs to `service-return-shape-parity` (as a sync, React-only seam).
Product goes standalone async now to avoid blocking. During coexistence it may still extend `BaseService`;
the `extends` and old members are removed in the cleanup slice (slice 7).
- **`ProductCategoryService` ALSO drops `extends BaseService<ProductCategory>`** (symmetric): Angular's
  category interface (product-category.service.ts:11-27) has `getProductCategoryById` COMMENTED OUT (L21)
  and NO `getAll`/`delete` correlate — its public surface is only `getProductCategoriesView`,
  `getAvailableProductCategories`, `createProductCategory`, `updateProductCategory`, `getMaxOrder`. The
  inherited sync `BaseService` seam (`getAll`/`getById`/`delete`) is therefore dead weight for Category
  too; it is dropped in the cleanup slice alongside Product. Since Category is 100% category C, its final
  surface is async `Promise<BaseResponseModel<T>>` (resolves the Slice-1 SYNC-now assumption below).

## Data Flow

    call site ─→ createProductService(storeId) ─→ ProductOfflineService (async)
                        │ USE_ONLINE_SERVICE                 │ try/catch + orchestration
                        └─→ ProductOnlineService (apiClient) │   (createProduct omits barcode)
                                                     ProductRepository (rules, throws BaseError-coded)
                                                             │ depends on
                                                     ProductCategoryRepository (category-exists,
                                                             │                   hasAnyAvailableCategory,
                                                             │                   getProductCategories, byName, addByName)
                                                     BaseRepository<Product|ProductCategory> (localStorage)
    (ProductCategoryOfflineService is re-wired to delegate to ProductCategoryRepository too)
    all paths resolve BaseResponseModel<T> (Success or Failure envelope)

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `packages/domain/src/services/product-service.ts` | Modify | Rewrite to full async Angular parity surface (12 methods, `Promise<BaseResponseModel<T>>`, Angular names); standalone by slice 7 |
| `packages/domain/src/models/product.ts` | Modify | Add `ProductSelectView`; reuse/confirm `CsvProduct` (parser already exists) |
| `packages/domain/src/errors/product-errors.ts` | No action / already exists | `ProductErrors` is already a byte-identical Angular port and a SUPERSET of the needed codes (NotExists, BarcodeExists, NameExists + more), already exported from `packages/domain/src/index.ts`. Do NOT recreate. |
| `packages/domain/src/errors/product-category-errors.ts` | Create | `ProductCategoryErrors.{NameExists, NotExists}` — byte-identical port of Angular `product-categories/product-category.errors.ts`. Export from `packages/domain/src/index.ts` (sibling errors files already exported there). |
| envelope factories — `packages/domain/src/commons/envelope.ts` (`success`/`failure`) + `packages/domain/src/commons/result.ts` (`Result`/`DataResult`) | No action / already exist | Reuse VERBATIM. The earlier `packages/domain/src/lib/base-response.ts` row was an invented wrong path — deleted. `success`/`failure` are the sync `BaseResponseModel<T>` factories (Angular `Success`/`Failure`); wrap with `Promise.resolve(...)` for async C parity. |
| `apps/web-store-pos/app/sales/lib/repositories/product-repository.ts` | Modify (extend existing) | Already EXISTS (created by the Inventory guards slice) exposing only Angular category-A read helpers (`getStorageProductsMap`, `getProductById`, `getAvailableProductById`). This change EXTENDS it — adds the command/validation surface: validations, order-shift, soft-delete, activate/deactivate (repo-only, not service-exposed), setDiscountFromInvantory, remaining repo queries. Depends on `ProductCategoryRepository`. Do NOT recreate. |
| `apps/web-store-pos/app/sales/lib/repositories/product-category-repository.ts` | Create | Extracted category repository mirroring Angular `product-category.repository.ts` public surface EXACTLY (getProductCategoryById, getProductCategoryByName, addProductCategoryByName, getProductCategories, getAvailableProductCategories, hasAnyCategory, hasAnyAvailableCategory, addProductCategory, updateProductCategory, activate/deactivate, getCategoriesJson). **NO `upsert`/`remove`** |
| `packages/domain/src/services/product-category-service.ts` | Modify | Reconcile to Angular's exact category-service surface: ADD `createProductCategory`/`updateProductCategory` (abstract); REMOVE `save`/`getByName`/`hasAnyCategory`/`hasAnyAvailableCategory` |
| `apps/web-store-pos/app/sales/lib/services/product-category-offline-service.ts` | Modify | Reconcile surface: ADD `createProductCategory`/`updateProductCategory`/`getProductCategories`; REMOVE `save`/`addByName`/`getByName`/`hasAnyCategory`/`hasAnyAvailableCategory`; delegate to `ProductCategoryRepository` (same storage keys). Accepted scope expansion re-touching Category |
| call sites (`products.tsx` handleCategorySave/handleCsvImport, `order-offline-service.ts`, `edit-inventory-entry-modal.tsx`, `available.tsx`, `user-home.ts`) | Modify | Re-express removed category methods: `save`→`createProductCategory`/`updateProductCategory`; `getAll`→`getProductCategories`; CSV/gate interim via `ProductCategoryRepository`, absorbed by Product `createCsvProducts`/`hasAnyAvailableToSaleProduct` |
| `apps/web-store-pos/app/sales/lib/services/product-offline-service.ts` | Modify | Async Angular-named methods delegating to `ProductRepository`; owns orchestration (createProducts/createCsvProducts loops, getProductsToSelect grouping, getMaxOrder); adds offline-only `setDiscountFromInvantory` + `getProductsByCategoryId`; wrap Success/Failure. Depends on `ProductRepository` + `ProductCategoryRepository` |
| `apps/web-store-pos/app/sales/lib/services/product-online-service.ts` | Create | `apiClient` calls, `Products/` URLs, returns envelope (reference-only). `createProduct` accepts `barcode?` but OMITS it from the payload (mirror Angular); NO `setDiscountFromInvantory`/`getProductsByCategoryId` |
| `apps/web-store-pos/app/sales/lib/services/product-service.factory.ts` | Create | GlobalConfig-gated offline/online selector |
| call sites (`products.tsx`, `sale.tsx`, `cart-shell.tsx`, `egress.tsx`, `inventory-today-sale-service.ts`, `product-category-offline-service.ts`) | Modify | Await async surface; move CSV orchestration into `createCsvProducts` |

## Testing Strategy (Strict TDD)

| Layer | What | Approach |
|-------|------|----------|
| Unit | `ProductRepository` rules, order-shift | New `product-repository.test.ts`; mirror Angular `product-offline.service.spec.ts` traces (no Angular repo spec exists) — write failing test first per rule |
| Unit | Offline async + envelope | Extend `product-offline-service.test.ts`; assert `succeeded`/`errors`/`actionCode` on success AND failure |
| Unit | Online service | Mirror `owner-http-service.test.ts` (mock `apiClient`, assert envelope) |
| Integration | Migrated call sites | Existing route tests updated to await |

## Suspected-Bug Seams (mirror, do NOT fix)

Mark each with `// ANGULAR-BUG-SUSPECT #N: mirrors Angular <ref>; confirmed fix goes here`:
(1) CSV/`createProducts` partial-failure returns empty `errors[]`; (2) `updateProduct` order-shift
redundant-assignment; (3) `getProductsToSaleByCategoryId` double-filter; (4) online `createProduct`
omits `barcode` from payload while offline/update send it (product-online.service.ts:71-93 vs
offline 9-param + online updateProduct which DOES send barcode). Tests assert CURRENT Angular
behavior so parity is locked; a future confirmed fix flips the test. All four are resolved-decision
= MIRROR (do not fix without user confirmation).

## Coordination (alignment, NOT merge)

`service-return-shape-parity` (the async foundation, which superseded `offline-online-service-parity`'s overruled
sync-ADR-1) owns the shared A/B/C/D mechanic and the generic `BaseService<T>` seam — resolved there as a SYNC,
React-only seam, NOT an eventual async `BaseService`. This change adopts the SAME `Promise<BaseResponseModel<T>>`
resolve-with-envelope shape for Product/ProductCategory's category-C methods, and RETIRES `extends BaseService<T>`
on both interfaces entirely in the cleanup slice — no re-extension, since the seam is dead weight for two
100%-category-C services.
Do not merge scopes.

## Slicing (refines proposal's 6, preserves order + independent shippability)

1. Extract `ProductCategoryRepository` (mirror Angular repo surface EXACTLY, no upsert/remove) + reconcile `ProductCategoryOfflineService` to Angular's exact category-service surface (add createProductCategory/updateProductCategory/getProductCategories; remove save/addByName/getByName/hasAny*) + re-express call sites + tests. Establishes the layer `ProductRepository` will depend on. (See tasks-slice1.md; Open Ambiguities on async timing + CSV/gate ordering.)
2. `ProductRepository` (depends on `ProductCategoryRepository`) + `ProductErrors` + validations/order-shift/soft-delete/activate-deactivate (repo-only) + tests (no call-site impact).
3. Add async Angular-named core methods (getProductById/getProductByBarcode/deleteProduct/createProduct/updateProduct/getMaxOrder/getAvailableProductsByCategoryId) + `base-response` helpers, coexisting; tests.
4. Add remaining methods (hasAnyAvailableToSaleProduct/getProductsToSelect/getProductsToSaleByCategoryId/createProducts/createCsvProducts) + offline-only `setDiscountFromInvantory`/`getProductsByCategoryId` + `ProductSelectView`; tests.
5. Migrate call sites to the async surface (await + envelope handling; CSV orchestration into service).
6. `ProductOnlineService` (createProduct omits barcode; no setDiscountFromInvantory/getProductsByCategoryId) + `product-service.factory.ts` (GlobalConfig gate); call sites → factory.
7. Cleanup: remove dead sync methods, drop `extends BaseService`; DELETE `search`/`updateMany`/`getByName`/`activate`/`deactivate` from the product service (RESOLVED = REMOVE, Exact-Surface Rule).

## Resolved Decisions (previously open, now settled — do not re-ask)

- [x] Dedicated `ProductRepository` class over inline — RESOLVED: Angular has a distinct `ProductRepository`; a dedicated class is layer-faithful (rule 6), not a deviation.
- [x] Online `createProduct` barcode handling — RESOLVED: MIRROR. Implement the 9-param interface but omit `barcode` from the payload (Angular asymmetry, rule 8; `ANGULAR-BUG-SUSPECT #4`).
- [x] Exact-Surface Rule (non-negotiable) — RESOLVED: React public surface = Angular public surface EXACTLY, per layer. Non-Angular React methods are DELETED (never kept "behavior-preserving"); no invented bridges (`upsert`/`remove`). Only allowed transform: `Observable<T>`→`Promise<T>`. See "Surface Reconciliation" in spec.md.
- [x] Category layer collapse — RESOLVED: EXTRACT a real `ProductCategoryRepository` (Angular repo surface EXACTLY, NO `upsert`/`remove`) and RECONCILE `ProductCategoryOfflineService` to Angular's exact category-service surface (add `createProductCategory`/`updateProductCategory`/`getProductCategories`; remove `save`/`addByName`/`getByName`/`hasAnyCategory`/`hasAnyAvailableCategory`). `ProductRepository` depends on the category *repository*, not the service (rule 6). Accepted scope expansion re-touching Category.
- [x] `search` (product, React-only, no Angular correlate) — RESOLVED: REMOVE in the cleanup slice (slice 7). Dead code — zero UI/route call sites, exercised only by its own unit test.
- [x] `updateMany` (product, React-only, no Angular correlate) — RESOLVED: REMOVE the service method in the cleanup slice (slice 7); re-express `handleBulkSave` (`apps/web-store-pos/app/sales/routes/products.tsx:97`) as a loop calling `updateProduct` per item in the call-site migration slice (slice 5). The bulk price-edit UI feature (per-category "Nuevo Productos" bulk edit) is UNCHANGED — only the service-level `updateMany` method is retired.
- [x] `getByName`/`activate`/`deactivate` (product service, React-only) — RESOLVED: REMOVE from the service. Angular exposes `getProductByName`/`activateProduct`/`deactivateProduct` on the REPOSITORY only. Zero service call sites.

## Open Questions (forced assumptions per rule 11 — resolve BEFORE apply)

- [x] Category-by-id report call sites (`today-sales-profit.tsx:86`, `today-quantities.tsx:63`, `products.tsx:130`) — RESOLVED (was tasks-slice1 Open Ambiguity #3): re-express via `ProductCategoryRepository.getProductCategoryById(id)` — SYNC, repository-layer. Angular's category SERVICE never had this method (product-category.service.ts:21 commented out); ONLY the repository exposes `getProductCategoryById`. These reads are plain synchronous lookups (no envelope, no async needed) — do NOT route them through the async category service. Chosen over `getProductCategories().find` because Angular's repository has the dedicated method.
- [ ] `ProductService`/`ProductCategoryService` dropping `extends BaseService` and the BaseService-level `getAll`/`getById`/`delete` names — the DROP itself is now decided (see the symmetric "drops `extends BaseService`" decision above; removed in the cleanup slice). What remains owned by `service-return-shape-parity` (the async foundation) is the cross-cutting BaseService-level `getAll`/`getById`/`delete` NAME reconciliation for the other offline services — a sync, React-only seam, not owned here.
- [x] Category-service return primitive / async timing — the NEW `createProductCategory`/`updateProductCategory`/`getProductCategories`: RESOLVED — async `Promise<BaseResponseModel<T>>` (category C, resolve-never-reject) NOW, not sync. Angular's category service is verified 100% category C (every method `Success$`/`Failure$`); the fold-in delivers that classification in a single pass (see spec.md "Category Service Method Surface Parity"). Supersedes tasks-slice1's earlier SYNC-now assumption (Open Ambiguity #1), which contradicted the verified classification.
- [ ] CSV / login-gate ordering — faithful re-expression of `handleCsvImport`/`user-home` needs Product `createCsvProducts`/`hasAnyAvailableToSaleProduct` (Product slice 4). Removing category `getByName`/`addByName`/`hasAnyAvailableCategory` in Slice 1 forces an interim repository-direct re-expression, unless those Product methods are pulled earlier — CONFIRM.
