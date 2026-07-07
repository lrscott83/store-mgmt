# Tasks: product-service-parity — Slice 1 (Extract ProductCategoryRepository + Reconcile ProductCategoryOfflineService to Angular's EXACT category-service surface)

Governs spec (engram `sdd/product-service-parity/spec`, id 700), design (engram
`sdd/product-service-parity/design`, id 701), both updated to enforce the **Exact-Surface Rule**
(see "Surface Reconciliation" in spec/design). Strict TDD Mode active: every NEW method on the
extracted repository and every NEW/changed method on the service = RED→GREEN. Angular `frontend/`
is the sole source of truth (rule 1); never validate against a live backend
(parity-means-angular-source-only).

## THE NON-NEGOTIABLE RULE (folded in from spec/design)

The React PUBLIC method surface MUST equal Angular's public methods EXACTLY.
- A method that exists in React but NOT in the corresponding Angular layer is DELETED from React.
  We NEVER keep it "behavior-preserving", and we NEVER invent bridge methods (raw `upsert`/`remove`)
  to sustain it. Its call sites are re-expressed with Angular-faithful methods.
- Every Angular public method is migrated with 100% parity (same name, params, wrapped return),
  the only allowed transform being `Observable<T>` → `Promise<T>` (playbook rule 3/4).

## Resolved Decisions Folded In (do not re-ask)

1. Extract a real `ProductCategoryRepository` mirroring Angular's `product-category.repository.ts`
   public surface EXACTLY — **NO invented `upsert`/`remove`** — **THIS SLICE**.
2. Reconcile `ProductCategoryOfflineService` to expose ONLY Angular's public category-service
   surface (`getProductCategories`, `getAvailableProductCategories`, `getProductCategoriesView`,
   `createProductCategory`, `updateProductCategory`, `getMaxOrder`) — **THIS SLICE**. React-only
   methods (`save`, `addByName`, `getByName`, `hasAnyCategory`, `hasAnyAvailableCategory`) are
   REMOVED, their call sites re-expressed.
3. `search` (product, React-only, dead, zero call sites) → REMOVE — lands in the Product cleanup
   slice (7).
4. `updateMany` (product, React-only) → REMOVE from the service; re-express `handleBulkSave`
   (`apps/web-store-pos/app/sales/routes/products.tsx:97`) as a loop over `updateProduct` — lands
   in the Product call-site slice (5).

## Angular category-service surface (authoritative, this slice's target)

| Layer | Public method | Params | Angular source |
|-------|---------------|--------|----------------|
| interface (abstract) | `getProductCategoriesView()` | — | product-category.service.ts:13 |
| interface (abstract) | `getAvailableProductCategories()` | — | product-category.service.ts:17 |
| interface (abstract) | `createProductCategory(name, order, isActive)` | 3 | product-category.service.ts:23 |
| interface (abstract) | `updateProductCategory(id, name, order, isActive)` | 4 | product-category.service.ts:25 |
| interface (abstract) | `getMaxOrder()` | — | product-category.service.ts:27 |
| offline concrete (public, NOT on interface) | `getProductCategories()` | — | product-category-offline.service.ts:40 |

`getById`/`getAll`/`delete` on the React service come from the reduced React `BaseService<T>` and
have NO Angular category-SERVICE correlate (Angular's category service exposes NEITHER `getById`
nor a plain `getAll`; `getProductCategoryById` is COMMENTED OUT). Reconciling those BaseService-level
names is cross-cutting and is coordinated with `offline-online-service-parity` — see "Open
Ambiguities" below. This slice migrates `getAll()` call sites to `getProductCategories()` (which it
adds) but does NOT touch `getById`/`delete` pending that decision.

## Angular ProductCategoryRepository surface (authoritative, WU1 target — NO upsert/remove)

`hasAnyAvailableCategory`, `getProductCategoryById`, `getProductCategoryByName`,
`getProductCategories`, `getAvailableProductCategories`, `hasAnyCategory`, `addProductCategory`,
`addProductCategoryByName`, `updateProductCategory`, `activateProductCategory`,
`deactivateProductCategory`, `getCategoriesJson` (+ `updateCategories`/`setInitCategories`/
`getStorageCategoriesMap`/`addImportedProductCategory`/`updateImportedProductCategory` for
sync/import parity). Private: `addProductCategoryData`, `getNextOrder`, `updateCategoriesOrder`,
`updateProductCategoryActive`, storage helpers. **Angular's repository has NO `upsert` and NO
`remove` — the extracted React repository MUST NOT declare them.**

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~430-560 (WU1 new repo ~140 + new test ~160-180; WU2 service reconcile ~70-100 + test updates ~40; WU3 call-site re-expression ~40-60) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes — WU1+WU2 (repo + service surface) as PR #1; WU3 (call-site re-expression) as PR #2 |
| Suggested split | PR #1: WU1 (extract+test) → WU2 (reconcile service surface+test). PR #2: WU3 (re-express `handleCategorySave` + migrate `getAll`→`getProductCategories` call sites) |
| Delivery strategy | Not specified by caller for this run — mirrors `offline-online-service-parity` precedent (commits-only, no PR/push, confirm with user before pushing) |
| Chain strategy | pending user choice (`stacked-to-main` vs `feature-branch-chain`) |

Decision needed before apply: Yes — (a) resolve the two Open Ambiguities below; (b) confirm chained-PR split and chain strategy.
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Commit type | Dependency |
|------|------|-------------|------------|
| 1 | Extract `ProductCategoryRepository` (new file, mirrors Angular repo surface EXACTLY, no upsert/remove) + full test suite | feat | None |
| 2 | Reconcile `ProductCategoryOfflineService` to Angular's exact category-service surface (add create/update/getProductCategories; remove save/addByName/getByName/hasAnyCategory/hasAnyAvailableCategory) + tests | refactor | After WU1 |
| 3 | Re-express removed-method call sites (`handleCategorySave`; `getAll`→`getProductCategories`) | refactor | After WU2 |

## WU1: Extract ProductCategoryRepository (mirror Angular repo surface EXACTLY) — Req: "ProductCategoryRepository Mirrors Angular Repo Surface" (spec)

New file: `apps/web-store-pos/app/sales/lib/repositories/product-category-repository.ts`, wrapping
`new BaseRepository<ProductCategory>('product-categories')` (same entity key as today — preserves
storage keys, `lizoft.store-product-categories-{storeId}`). Test file:
`apps/web-store-pos/app/sales/lib/repositories/__tests__/product-category-repository.test.ts`.

- [ ] 1.1 RED: `getProductCategoryById(id)` returns the match; `undefined` when missing (mirror `product-category.repository.ts:51-53`).
- [ ] 1.2 GREEN: create the repository file + implement `getProductCategoryById`.
- [ ] 1.3 RED: `getProductCategoryByName(name)` returns match/`undefined` (repository.ts:55-57).
- [ ] 1.4 GREEN: implement.
- [ ] 1.5 RED: `getProductCategories()` returns ALL categories sorted ascending by `order` (repository.ts:59-61).
- [ ] 1.6 GREEN: implement.
- [ ] 1.7 RED: `getAvailableProductCategories()` returns `isActive`-only, sorted (repository.ts:63-65).
- [ ] 1.8 GREEN: implement.
- [ ] 1.9 RED: `hasAnyCategory()` / `hasAnyAvailableCategory()` booleans (repository.ts:67-69, 25-27).
- [ ] 1.10 GREEN: implement both.
- [ ] 1.11 RED: `addProductCategoryByName(name)` — generates id (`crypto.randomUUID`, React convention; Angular uses `Guid`), next order = `max(existing orders, 0) + 1`, persists `isActive: true`, returns the new id (repository.ts:94-98, 100-103).
- [ ] 1.12 GREEN: implement (delegates internally to the create-with-validation path below).
- [ ] 1.13 RED: `addProductCategory(name, order, isActive)` — name-collision (existing category same name) fails, no persistence; else creates + shifts siblings with `order >= order` by `+1`, then reassigns own order (mirror the redundant double-assign, repository.ts:71-88, 109-115 — do not "simplify" without confirming with user). Returns a `Result` (mirror Angular's `Result` envelope; see Open Ambiguity #1 on the React return primitive).
- [ ] 1.14 GREEN: implement + private order-shift helper.
- [ ] 1.15 RED: `updateProductCategory(id, name, order, isActive)` — not-found fails; name-collision excluding self fails; success updates name/order/isActive + same order-shift-then-reassign (repository.ts:121-137).
- [ ] 1.16 GREEN: implement.
- [ ] 1.17 RED: `activateProductCategory(id)` / `deactivateProductCategory(id)` toggle ONLY `isActive`, no other field touched; not-found fails (repository.ts:139-156).
- [ ] 1.18 GREEN: implement both via private `updateProductCategoryActive`.
- [ ] 1.19 RED: `getCategoriesJson()` returns the raw persisted JSON string for the store key (repository.ts:172-174) — needed by the sync/export layer.
- [ ] 1.20 GREEN: implement.
- [ ] 1.21 Gate: `pnpm test`, `pnpm -C apps/web-store-pos exec tsc --noEmit`; commit `feat(web-store-pos): extract ProductCategoryRepository (mirror Angular product-category.repository.ts surface — no upsert/remove)`.

> REMOVED from the prior plan: tasks that added raw `upsert(category)` / `remove(id)` pass-throughs.
> Angular's `ProductCategoryRepository` has NO such members; inventing them to keep the service's
> `save`/`delete` alive violates the Exact-Surface Rule. Write ops go through
> `addProductCategory`/`updateProductCategory`/`activate`/`deactivate` ONLY.

## WU2: Reconcile ProductCategoryOfflineService to Angular's exact surface — Req: "Category Service Method Surface Parity" (spec), Surface Reconciliation (design)

Modify `apps/web-store-pos/app/sales/lib/services/product-category-offline-service.ts` and the
interface `packages/domain/src/services/product-category-service.ts`. The service exposes ONLY the 6
Angular category-service methods (see the authoritative table above). It delegates to the WU1
`ProductCategoryRepository` (NOT to a raw `BaseRepository`).

**ADD (Angular methods missing in React):**
- [ ] 2.1 RED: `createProductCategory(name, order, isActive)` maps `repository.addProductCategory(...)`'s `Result` to the service return envelope; name-collision surfaces `ProductCategoryErrors.NameExists` (mirror product-category-offline.service.ts:30-33).
- [ ] 2.2 GREEN: implement `createProductCategory`; add it to the `ProductCategoryService` interface.
- [ ] 2.3 RED: `updateProductCategory(id, name, order, isActive)` maps `repository.updateProductCategory(...)`'s `Result`; not-found/name-collision surface the right errors (mirror product-category-offline.service.ts:35-38).
- [ ] 2.4 GREEN: implement `updateProductCategory`; add to interface.
- [ ] 2.5 RED: `getProductCategories()` returns all categories sorted by `order`, via `repository.getProductCategories()` (mirror product-category-offline.service.ts:40-43; this is the offline-only public method, NOT on the abstract interface).
- [ ] 2.6 GREEN: implement `getProductCategories` on the concrete offline service.

**KEEP (already Angular-faithful) — re-point to the repository:**
- [ ] 2.7 `getAvailableProductCategories()` → `repository.getAvailableProductCategories()` (mirror :45-48).
- [ ] 2.8 `getProductCategoriesView()` keeps its single-pass composition orchestration (with `ProductOfflineService`), swapping raw reads for `repository.getAvailableProductCategories()` (mirror :50-65).
- [ ] 2.9 `getMaxOrder()` keeps the global-max computation, over `repository.getProductCategories()` (mirror :100-103).

**REMOVE (React-only, no Angular category-SERVICE correlate — delete the methods):**
- [ ] 2.10 Delete `save(category)` from the service AND the `ProductCategoryService` interface. Angular has no generic category save; writes go through create/update. (Call sites re-expressed in WU3.)
- [ ] 2.11 Delete `addByName(name)` from the service. Angular exposes `addProductCategoryByName` on the REPOSITORY, not the service. (CSV call site re-expressed in WU3 / absorbed by Product `createCsvProducts` in Product slice 4.)
- [ ] 2.12 Delete `getByName(name)` from the service AND interface. Angular exposes `getProductCategoryByName` on the REPOSITORY. (CSV call site re-expressed in WU3.)
- [ ] 2.13 Delete `hasAnyCategory()` from the service AND interface. Angular repository-only. (No service call sites.)
- [ ] 2.14 Delete `hasAnyAvailableCategory()` from the service AND interface. Angular repository-only. (`user-home.ts` re-expressed in WU3.)
- [ ] 2.15 Confirm the interface `ProductCategoryService` now declares EXACTLY: `getProductCategoriesView`, `getAvailableProductCategories`, `createProductCategory`, `updateProductCategory`, `getMaxOrder` (abstract), and the offline concrete adds `getProductCategories`. No `save`/`getByName`/`hasAnyCategory`/`hasAnyAvailableCategory`.
- [ ] 2.16 Update the existing characterization suite `__tests__/product-category-offline-service.test.ts`: tests for removed methods (`save`/`getByName`/`hasAny*`/`addByName`) are DELETED or rewritten against the new surface; CAT-06 (storage key `lizoft.store-product-categories-s1`) MUST still pass verbatim (identical storage keys post reconcile).
- [ ] 2.17 Gate: `pnpm test`, `pnpm -C apps/web-store-pos exec tsc --noEmit`; commit `refactor(web-store-pos): reconcile ProductCategoryOfflineService to Angular category-service surface (add create/update/getProductCategories; remove save/addByName/getByName/hasAny*)`.

## WU3: Re-express removed-method call sites — Req: Call-Site Re-Expression (spec Surface Reconciliation)

- [ ] 3.1 `products.tsx` `handleCategorySave` (lines 103-118): replace the `getById`+`save` / `addByName`+`getById`+`save` logic with:
  - update branch (`data.id` present): `categoryService.updateProductCategory(data.id, data.name, data.order, data.isActive)`
  - create branch: `categoryService.createProductCategory(data.name, data.order, data.isActive)`
  This is the exact Angular `edit-product-category` flow (create vs update, no client-side `getById`+merge).
- [ ] 3.2 Migrate `getAll()` category-service call sites to `getProductCategories()` (Angular offline public):
  `products.tsx:43`, `order-offline-service.ts:213`, `edit-inventory-entry-modal.tsx:57`,
  `available.tsx:26`. (Behavior identical: both return all categories; `getProductCategories` sorts by `order`.)
- [ ] 3.3 `products.tsx` `handleCsvImport` (lines 121-140): INTERIM re-expression pending Product `createCsvProducts` (Product slice 4). Replace `categoryService.getByName`/`addByName` with the extracted `ProductCategoryRepository.getProductCategoryByName`/`addProductCategoryByName` (Angular's `createCsvProducts` itself talks to the category REPOSITORY, product-offline.service.ts:77-78). Flag with `// TEMP: absorbed by ProductService.createCsvProducts in product-service-parity slice 4`. See Open Ambiguity #2 — the user may prefer to pull `createCsvProducts` earlier instead.
- [ ] 3.4 `user-home.ts:23-30`: the login gate mirrors Angular's `hasAnyAvailableToSaleProduct`. Its `getAll().some(isActive)` category check re-expresses to `getProductCategories()` for now; the FULL faithful form is `productService.hasAnyAvailableToSaleProduct()` which lands in Product slice 4 — flag it (`// TEMP: replace with productService.hasAnyAvailableToSaleProduct() in product-service-parity slice 4`).
- [ ] 3.5 Gate: `pnpm test`, `pnpm -C apps/web-store-pos exec tsc --noEmit`, `pnpm -C apps/web-store-pos build`; commit `refactor(web-store-pos): re-express category call sites onto Angular-faithful category-service methods`.

## Final: Slice 1 Regression Gate

- [ ] 4.1 Confirm `product-category-offline-service.ts` no longer imports `BaseRepository` directly — all storage access goes through `ProductCategoryRepository`.
- [ ] 4.2 Confirm the `ProductCategoryRepository` declares NO `upsert`/`remove`.
- [ ] 4.3 Confirm the `ProductCategoryService` interface + offline concrete expose EXACTLY the 6 Angular category-service methods (no `save`/`getByName`/`hasAnyCategory`/`hasAnyAvailableCategory`).
- [ ] 4.4 Confirm no premature slice-2 coupling: nothing yet depends on the (not-yet-created) `ProductRepository`.
- [ ] 4.5 Full gate: `pnpm test` (all suites green, incl. `product-category-offline-service.test.ts` + new `product-category-repository.test.ts`), `tsc --noEmit`, `pnpm -C apps/web-store-pos build`.
- [ ] 4.6 Update this file's checkboxes + commit hashes. No PR/push unless the user confirms otherwise (commits-only on `feat/frontend-parity-audit`, mirroring `offline-online-service-parity` precedent).

## Open Ambiguities (rule 11 — resolve with the user BEFORE apply, do NOT assume)

1. **Category-service return primitive / async timing.** Angular's category service returns
   `Observable<BaseResponseModel<T>>` (async, enveloped). The current React category service is
   SYNC (returns `ProductCategory`/`boolean` directly, extends the reduced SYNC `BaseService`). The
   Product side of this change goes async (`Promise<BaseResponseModel<T>>`), but the async
   `BaseService` migration is explicitly owned by `offline-online-service-parity`. Question: do the
   NEW `createProductCategory`/`updateProductCategory`/`getProductCategories` land SYNC now (matching
   the still-sync category service, async folded into the sibling change) or async
   (`Promise<BaseResponseModel<T>>`) now? This slice assumes SYNC-now for internal consistency — CONFIRM.
2. **CSV / login-gate ordering.** The faithful re-expression of `handleCsvImport` is
   `productService.createCsvProducts(rows)`, and of the `user-home` gate is
   `productService.hasAnyAvailableToSaleProduct()` — both Product-service methods that land in
   Product slice 4. Removing category `getByName`/`addByName`/`hasAnyAvailableCategory` in Slice 1
   forces an INTERIM (repository-direct) re-expression (WU3.3/3.4). Alternative: pull
   `createCsvProducts` + `hasAnyAvailableToSaleProduct` earlier so there is no interim. CONFIRM which.
3. **BaseService-level names (`getById`/`getAll`/`delete`) on the category service.** Angular's
   category service exposes NONE of these (`getProductCategoryById` is commented out; `getAllItems`≠
   `getAll`). Category-by-id call sites exist (`today-sales-profit.tsx:86`, `today-quantities.tsx:63`,
   `products.tsx:130`). Reconciling these is cross-cutting (touches inventory/sync) and overlaps
   `offline-online-service-parity`. This slice does NOT touch them. CONFIRM they are deferred to that
   change, and whether the category-by-id call sites should re-express via the repository
   (`getProductCategoryById`) or via `getProductCategories().find(...)`.
