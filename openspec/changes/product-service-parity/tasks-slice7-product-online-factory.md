# Tasks: product-service-parity — Phase 2, Step 7 (ProductOnlineService + product-service.factory.ts)

Governs `openspec/changes/product-service-parity/design.md` "Slicing — LAYER-FIRST" §Phase 2
step 7 ("`ProductOnlineService` (createProduct omits barcode; no setDiscountFromInvantory/
getProductsByCategoryId) + `product-service.factory.ts` (GlobalConfig gate); call sites →
factory") + the "Online `createProduct` omits `barcode` from payload" and "`createProductService
(storeId)` factory gated by `GlobalConfig.USE_ONLINE_SERVICE`" Decisions + `spec.md` "Online
createProduct Omits Barcode" / "Offline-Only Public Methods (Offline/Online Asymmetry)" /
"Offline/Online DI Selection" / "Call-Site Parity". Depends on Slice 6 (COMPLETE, `dc22b50` +
regression gate `2898d62`): the async 12-method `ProductService` interface and
`ProductOfflineService`'s full concrete surface already exist. Strict TDD: every method/behavior =
RED→GREEN; `ProductOnlineService` NEVER hits a live backend — tests mock `apiClient` exclusively
(parity rule 1: online is reference-only). Angular source of truth:
`frontend/src/app/application/products/product-online.service.ts`,
`frontend/src/app/_services/factories/product-service.factory.ts`. React target:
`apps/web-store-pos/app/sales/lib/services/product-online-service.ts`,
`apps/web-store-pos/app/sales/lib/services/product-service.factory.ts`. Delivery: commits-only on
`feat/frontend-parity-audit`, one commit per work unit, conventional messages, no PR/branches/
stacking, no AI attribution. size-exception pre-approved.

## Commits (landed on feat/frontend-parity-audit, pushed)

Ratified **Flag A (files-only)**: WU1 + WU2 only, ZERO call-site rewiring (WU3 skipped, all 9 sites
stay on `new ProductOfflineService`; rewiring deferred to step 8).

- `07c0725` — WU1: `ProductOnlineService` (apiClient-backed 12-method async surface, createProduct
  omits barcode, ANGULAR-BUG-SUSPECT #5 double-slash URLs mirrored, Flag C `AsyncProductService` alias).
- WU2 (this commit): `product-service.factory.ts` (`createProductService` gated by
  `GlobalConfig.USE_ONLINE_SERVICE`) + tasks-slice7 doc.

Final gate green: web-store-pos tsc clean, 1560 tests (112 files), build OK. Domain interface
untouched (Flag #1 deferral intact). No call site uses the factory yet (Flag A).

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~570-680 (Flag A, files-only) or ~730-900 (Flag B, files + 3 call sites) — WU1 ~450-550 (impl ~180-220 + test ~260-330); WU2 ~90-120 (impl ~25 + test ~65-95); WU3 ~150-210 (conditional, Flag B only); Final ~15-20 |
| 400-line budget risk | High (either flag branch) |
| Chained PRs recommended | No — delivery is commits-only per standing instruction |
| Suggested split | WU1 → WU2 → WU3 (conditional) → Final, one commit per unit |
| Delivery strategy | commits-only (explicit instruction, supersedes ask-on-risk default) |
| Chain strategy | size-exception |
| Decision needed before apply | **Yes — Flag A/B (call-site scope) below is UNRATIFIED. Flag C (TS structural-typing resolution) is treated as RESOLVED per the user's own framing and is NOT a ratification blocker, but is called out for visibility.** |

## Flagged mismatches / decisions

### Flag A/B — call-site rewiring scope (RATIFIED 2026-07-09: **Option A — files-only**. WU3 SKIPPED; all rewiring deferred to step 8. Flag C + ANGULAR-BUG-SUSPECT #5 also accepted.)

`new ProductOfflineService(storeId)` appears at **9 production call sites**
(`sales/routes/products.tsx`, `sales/routes/sale.tsx`, `inventory/routes/egress.tsx`,
`inventory/routes/available.tsx`, `sync/routes/import.tsx`, `sync/routes/export.tsx`,
`shared/lib/auth/user-home.ts`, `shared/components/cart-shell.tsx`,
`inventory/components/edit-inventory-entry-modal.tsx`). Of these, only **3 call exclusively
methods on the 12-method async `ProductService` surface** and are therefore factory-eligible
right now:

| Call site | Method used | Line |
|-----------|-------------|------|
| `shared/lib/auth/user-home.ts` | `hasAnyAvailableToSaleProduct()` | `resolveUserHomePath`, L24 |
| `shared/components/cart-shell.tsx` | `getProductById(productId)` | `handleQuantityChange`, L118-120 |
| `inventory/components/edit-inventory-entry-modal.tsx` | `getProductsToSelect()` | load effect, L55 |

The other **6** (`products.tsx`, `sale.tsx`, `egress.tsx`, `available.tsx`, `import.tsx`,
`export.tsx`) still call sync Flag-#1 `BaseService`/legacy members (`getAll`/`create`/`update`/
`delete`/`getById`/`getByBarcode`) that are NOT on the async `ProductService` interface and
therefore CANNOT route through the async-typed factory until Phase 2 step 8 removes the sync
surface (design.md's cleanup slice). No call site uses the offline-only extras
(`setDiscountFromInvantory`/`getProductsByCategoryId`) outside the service itself, so those never
need factory routing.

**Option (A) — files-only (RECOMMENDED DEFAULT).** Create `ProductOnlineService` + factory + their
tests. ZERO call-site rewiring. All 9 sites (including the 3 async-only-eligible ones) stay on
direct `new ProductOfflineService(storeId)` instantiation; ALL rewiring — the 3 eligible now plus
the 6 blocked-until-step-8 — is deferred to a single coherent pass in step 8, when the sync surface
removal makes every remaining site eligible at once. Minimal churn, zero risk of touching
Slice-6-committed files, avoids a half-migrated state where 3 of 9 sites use the factory and 6
don't for an entire extra slice.

**Option (B) — files + rewire the 3 async-only-eligible sites now.** Same as (A) plus WU3: swap
`user-home.ts`, `cart-shell.tsx`, `edit-inventory-entry-modal.tsx` from `new
ProductOfflineService(storeId)` to `createProductService(storeId)`. The other 6 sites stay
untouched regardless (deferred to step 8 either way). Exercises the factory/DI-switch end-to-end
sooner, at the cost of touching 3 already-Slice-6-stabilized files again in this slice.

Both options leave the 6 blocked sites deferred to step 8 — the only question is whether the 3
eligible sites move now (B) or wait to join the other 6 in one pass (A). **Default: (A).** WU3
below is written as a CONDITIONAL unit, executed only if the user picks (B) at apply time.

### Flag C — `ProductOnlineService` TS surface vs. Slice-6-deferred `BaseService` extension (RESOLVED, documented for visibility)

The domain `ProductService` interface (`packages/domain/src/services/product-service.ts`, Slice 6)
STILL `extends BaseService<Product>` and declares sync `getByBarcode(barcode): Product | undefined`
/ `update(product): Product` members — Flag #1 from Slice 6, intentionally deferred to Phase 2 step
8 (design.md's cleanup slice), NOT dropped in this slice. Angular's `ProductOnlineService` has NO
correlate for any of `getAll`/`getById`/`delete`/`getByBarcode`/`update` — its parent Angular
abstract `ProductService` declares only the 12 async methods; those five sync members are a
React-only artifact of the still-pending Flag #1 cleanup. If React's `ProductOnlineService`
literally wrote `implements ProductService` today, TypeScript would force it to also implement
those five sync members — which would mean inventing throw-stub/dummy bodies with zero Angular
correlate, violating the Exact-Surface Rule (spec.md) for no parity benefit.

**Resolution (do NOT `implements ProductService` literally on the online class):**
- `product-online-service.ts` exports a local type alias `AsyncProductService = Omit<ProductService,
  'getAll' | 'getById' | 'delete' | 'getByBarcode' | 'update'>` (the 12-method async-only shape;
  domain `product-service.ts` itself is NOT touched — respects design.md's File Changes table,
  which lists no domain modification for this step).
- `class ProductOnlineService implements AsyncProductService` — 12 methods only, no stubs.
- `product-service.factory.ts`'s `createProductService(storeId): AsyncProductService` returns
  `AsyncProductService`, not the full `ProductService`. `ProductOfflineService` (which DOES
  implement the full `ProductService`, a structural superset) is still assignable to
  `AsyncProductService` with zero cast — a wider-featured object satisfies a narrower expected
  type. The 3 call sites eligible under Flag B only ever call methods inside the 12-method surface,
  so `AsyncProductService` is sufficient for all of them.
- This keeps Flag #1's `extends BaseService<Product>` deferral fully intact and untouched — no
  early opening of Phase 2 step 8's cleanup work.

### ANGULAR-BUG-SUSPECT #5 (new, this slice) — double-slash URL artifacts, mirror verbatim

Angular's `ProductOnlineService.API_URL` ends with a trailing slash
(`environment.apiUrl}/${environment.apiVersion}/Products/`), and 8 of its 12 methods build their
URL as `API_URL + '/' + suffix` (an EXTRA leading slash on top of the already-trailing one),
producing a literal double-slash in the resulting path (e.g. `Products//hasAnyAvailableToSaleProduct`,
`Products//${id}`, `Products//toEntry`). This is inconsistent with Angular's OWN sibling services in
this same codebase — `owner.service.ts`, `store.service.ts`, `reseller.service.ts` all build URLs as
`API_URL + suffix` (no extra leading slash, no double-slash) — so it reads as a copy-paste artifact
isolated to `product-online.service.ts`, not a systemic Angular convention. Per this SDD chain's
established "mirror suspected bugs, do not silently fix" policy (design.md's ANGULAR-BUG-SUSPECT
#1-#4, same class of issue), **this is mirrored verbatim, not normalized** — React's
`ProductOnlineService` MUST reproduce the exact same path strings (double slashes included) that
Angular's `this.http.get/post/put/delete(url, ...)` calls would produce, byte-for-byte. This
deviates from the OTHER React http-services' convention (`owner-http-service.ts` et al. use clean
normalized single-slash paths) precisely because Angular's OWN `product-online.service.ts` deviates
from ITS sibling services the same way — mirroring Angular exactly, not the newer React convention,
is the correct call here. A future confirmed fix (should the user decide the double-slash really is
a bug worth correcting) is a one-line-per-method change + test flip; not decided in this slice.
Each method below is annotated with its exact resulting path.

## Suggested Work Units

| Unit | Goal | Dependency |
|------|------|------------|
| 1 | `ProductOnlineService` — `apiClient`-backed class implementing the 12-method `AsyncProductService` surface, mirroring Angular's exact `Products/` URLs (incl. ANGULAR-BUG-SUSPECT #5 double-slashes) + payload shapes (incl. `createProduct`'s barcode omission) | After Slice 6 |
| 2 | `product-service.factory.ts` — `createProductService(storeId): AsyncProductService`, `GlobalConfig.USE_ONLINE_SERVICE` gate | After 1 |
| 3 (CONDITIONAL — Flag B only) | Rewire the 3 async-only-eligible call sites (`user-home.ts`, `cart-shell.tsx`, `edit-inventory-entry-modal.tsx`) from `new ProductOfflineService(storeId)` to `createProductService(storeId)` | After 2, gated on Flag A/B ratification |
| Final | Regression gate: confirm online has NO offline-only extras, confirm the 6 blocked sites are untouched, confirm Flag C's narrower-type mechanism compiles, full test/build gate | After 1, 2, (3) |

## WU1: `ProductOnlineService` — Req: "Service Method Signature Parity", "Online createProduct Omits Barcode", "Offline-Only Public Methods (Offline/Online Asymmetry)", "Async Contract (Offline and Online)"

New `apps/web-store-pos/app/sales/lib/services/product-online-service.ts` + new test file
`apps/web-store-pos/app/sales/lib/services/__tests__/product-online-service.test.ts`. Pattern:
structurally a class (parallels `ProductOfflineService`, satisfies `implements
AsyncProductService`), mechanically an `apiClient`-calling async method per `owner-http-service.ts`
(`const response = await apiClient.<verb>(url[, body]); return response.data;` — no try/catch;
transport/network errors propagate as a rejected Promise, matching `owner-http-service.test.ts`'s
"propagates error on HTTP failure" block; domain failures come back pre-shaped in
`response.data` from the (mocked) backend, no client-side envelope mapping needed). No `storeId` in
the constructor — Angular's online constructor takes only `HttpClient`, no store concept
(`new ProductOnlineService()`, no-arg).

- [x] 1.1 RED/GREEN: module exists — `apps/web-store-pos/app/sales/lib/services/product-online-service.ts`
      exports `AsyncProductService` (`Omit<ProductService, 'getAll' | 'getById' | 'delete' |
      'getByBarcode' | 'update'>`, Flag C) and a `ProductOnlineService` class implementing it,
      instantiable with `new ProductOnlineService()` (no args).
- [x] 1.2 RED/GREEN: `hasAnyAvailableToSaleProduct()` — `GET /v1/Products//hasAnyAvailableToSaleProduct`
      (ANGULAR-BUG-SUSPECT #5 double slash, mirror verbatim), no body, returns
      `response.data: BaseResponseModel<boolean>`.
- [x] 1.3 RED/GREEN: `getProductById(id)` — `GET /v1/Products//${id}` (double slash), returns
      `BaseResponseModel<Product>`.
- [x] 1.4 RED/GREEN: `getProductByBarcode(barcode)` — `GET /v1/Products/byBarcode/${barcode}`
      (SINGLE slash here — Angular's `API_URL + 'byBarcode/' + barcode` has no extra leading `/`,
      unlike the other 7; assert this one is clean to lock the asymmetry), returns
      `BaseResponseModel<Product>`.
- [x] 1.5 RED/GREEN: `getProductsToSelect()` — `GET /v1/Products//toEntry` (double slash), returns
      `BaseResponseModel<ProductSelectView[]>`.
- [x] 1.6 RED/GREEN: `getAvailableProductsByCategoryId(categoryId)` — `GET
      /v1/Products//availableByCategoryId/${categoryId}` (double slash), returns
      `BaseResponseModel<Product[]>`.
- [x] 1.7 RED/GREEN: `getProductsToSaleByCategoryId(categoryId)` — `GET
      /v1/Products//toSaleByCategoryId/${categoryId}` (double slash), returns
      `BaseResponseModel<Product[]>`.
- [x] 1.8 RED/GREEN: `deleteProduct(id)` — `DELETE /v1/Products//${id}` (double slash), returns
      `BaseResponseModel<boolean>`.
- [x] 1.9 RED/GREEN: `createCsvProducts(csvProducts)` — `POST /v1/Products/import` (single slash,
      no leading-slash bug — `API_URL + 'import'`), body `{ csvProducts }`, returns
      `BaseResponseModel<boolean>`.
- [x] 1.10 RED/GREEN: `getMaxOrder(categoryId)` — `GET /v1/Products//maxOrderByCategoryId/${categoryId}`
      (double slash), returns `BaseResponseModel<number>`.
- [x] 1.11 RED/GREEN — **Req "Online createProduct Omits Barcode"**: `createProduct(categoryId,
      name, price, businessId, order, isActive, availableToSale, discountFromInvantory, barcode?)`
      — implements the full 9-param signature (type conformance with `AsyncProductService`), `POST
      /v1/Products/` (no suffix, `API_URL` as-is), body `{ categoryId, name, price,
      availableToSale, discountFromInvantory, order, isActive, businessId }` — assert the payload
      object does NOT contain a `barcode` key even when a `barcode` argument is passed (mirrors
      Angular product-online.service.ts:71-93, which declares only 8 params and never references
      `barcode`). Returns `BaseResponseModel<boolean>`.
- [x] 1.12 RED/GREEN: `updateProduct(id, categoryId, name, price, businessId, order, isActive,
      availableToSale, discountFromInvantory, barcode?)` — `PUT /v1/Products//${id}` (double
      slash), body `{ id, categoryId, name, price, barcode, availableToSale,
      discountFromInvantory, order, isActive, businessId }` — assert `barcode` IS present this
      time (the asymmetry only affects `createProduct`). Returns `BaseResponseModel<boolean>`.
- [x] 1.13 RED/GREEN: `createProducts(categoryId, items)` — `POST /v1/Products/createProducts`
      (single slash), body `{ categoryId, products: items }`, returns
      `BaseResponseModel<boolean>`.
- [x] 1.14 RED/GREEN — **Req "Offline-Only Public Methods (Offline/Online Asymmetry)"**: negative
      test — `ProductOnlineService` MUST NOT declare `setDiscountFromInvantory` or
      `getProductsByCategoryId` (`expect((service as any).setDiscountFromInvantory).toBeUndefined()`
      equivalent, or a `tsc`-level check that no such members exist); no `Products/` endpoint MUST
      be invented for them.
- [x] 1.15 RED/GREEN: transport-error propagation — mirror `owner-http-service.test.ts`'s
      "propagates error on HTTP failure" block: when the mocked `apiClient` verb rejects, the
      `ProductOnlineService` method MUST reject with the same error (no swallow/catch), for at
      least `getProductById` and `createProduct` (representative GET + POST).
- [x] 1.16 Gate: `pnpm -C apps/web-store-pos test`, `pnpm -C apps/web-store-pos exec tsc
      --noEmit`, `pnpm -C apps/web-store-pos build`; commit
      `feat(web-store-pos): add ProductOnlineService (apiClient-backed, 12-method async surface, createProduct omits barcode, ANGULAR-BUG-SUSPECT #5 URL doubles mirrored)`.

## WU2: `product-service.factory.ts` — Req: "Offline/Online DI Selection"

New `apps/web-store-pos/app/sales/lib/services/product-service.factory.ts` + new test file
`apps/web-store-pos/app/sales/lib/services/__tests__/product-service.factory.test.ts`. Mirrors
`shared/lib/config/global-config.ts` (`GlobalConfig.USE_ONLINE_SERVICE`) precedent, dedicated typing
(NOT the generic sync `createService`/`ServiceImpl<T>` from `shared/lib/services/service-factory.ts`
— that shape doesn't fit the async `ProductService` contract, per design.md's Alternatives note).

- [x] 2.1 RED/GREEN: `createProductService(storeId: string): AsyncProductService` — when
      `GlobalConfig.USE_ONLINE_SERVICE` is `false` (default), returns a `ProductOfflineService`
      instance constructed with `storeId` (assert via a representative method call resolving
      offline-shaped data, or an `instanceof` check).
- [x] 2.2 RED/GREEN: when `GlobalConfig.USE_ONLINE_SERVICE` is `true` (mock/override the config for
      the test), returns a `ProductOnlineService` instance (no `storeId` forwarded to its
      constructor — Angular parity, online has no store concept); assert via `instanceof` or a
      representative `apiClient`-backed call.
- [x] 2.3 Gate: `pnpm -C apps/web-store-pos test`, `tsc --noEmit`, `pnpm -C apps/web-store-pos
      build`; commit
      `feat(web-store-pos): add createProductService factory (GlobalConfig.USE_ONLINE_SERVICE gate, offline/online)`.

## WU3 (CONDITIONAL — only if Flag B is chosen at apply time): Rewire the 3 async-only-eligible call sites — Req: "Call-Site Parity"

`apps/web-store-pos/app/shared/lib/auth/user-home.ts`,
`apps/web-store-pos/app/shared/components/cart-shell.tsx`,
`apps/web-store-pos/app/inventory/components/edit-inventory-entry-modal.tsx` + their tests. SKIP
this entire unit if Flag A (files-only) is ratified instead — go straight to Final.

- [ ] 3.1 [SKIPPED — Flag A, deferred to step 8] RED/GREEN: `user-home.ts:24` — `new ProductOfflineService(user.selectedStoreId)
      .hasAnyAvailableToSaleProduct()` → `createProductService(user.selectedStoreId)
      .hasAnyAvailableToSaleProduct()`; drop the now-unused `ProductOfflineService` import, add
      the factory import. Update `user-home.test.ts`'s mock target accordingly.
- [ ] 3.2 [SKIPPED — Flag A] RED/GREEN: `cart-shell.tsx:118-120` — `const productService = new
      ProductOfflineService(storeId);` → `const productService = createProductService(storeId);`
      (only `getProductById` is called on it in this file — confirm no other
      `ProductOfflineService`-only member is used on this same instance before swapping the
      import). Update `cart-shell.test.tsx`'s mock target accordingly.
- [ ] 3.3 [SKIPPED — Flag A] RED/GREEN: `edit-inventory-entry-modal.tsx:55` — `new
      ProductOfflineService(storeId).getProductsToSelect()` → `createProductService(storeId)
      .getProductsToSelect()`. Update the modal's test mock target accordingly.
- [ ] 3.4 [SKIPPED — Flag A] Gate + commit
      `refactor(web-store-pos): rewire user-home/cart-shell/edit-inventory-entry-modal to createProductService factory`.

## Final: Slice 7 Regression Gate

- [x] F.1 Grep-confirm `ProductOnlineService` declares exactly the 12 `AsyncProductService`
      methods and NEITHER `setDiscountFromInvantory` NOR `getProductsByCategoryId`
      (Offline-Only Public Methods asymmetry preserved).
- [x] F.2 Grep-confirm the 6 blocked call sites (`products.tsx`, `sale.tsx`, `egress.tsx`,
      `available.tsx`, `import.tsx`, `export.tsx`) are UNTOUCHED — still `new
      ProductOfflineService(storeId)`, still compiling and passing (deferred to step 8
      regardless of Flag A/B).
- [x] F.3 If Flag A was chosen: confirm ALL 9 production call sites (including the 3
      async-only-eligible ones) are still on direct `new ProductOfflineService(storeId)` — zero
      rewiring landed this slice. If Flag B was chosen: confirm exactly the 3 named sites moved
      to `createProductService(storeId)` and the other 6 did not.
- [x] F.4 Confirm `product-service.factory.ts`'s `AsyncProductService` return type compiles
      cleanly against BOTH `ProductOfflineService` (full `ProductService`, structural superset)
      and `ProductOnlineService` (the narrower 12-method type) with zero casts (Flag C mechanism
      verified end-to-end).
- [x] F.5 Confirm the domain `packages/domain/src/services/product-service.ts` interface was NOT
      modified this slice (`extends BaseService<Product>` + `getByBarcode`/`update` sync members
      untouched, Flag #1 deferral intact for step 8).
- [x] F.6 Full gate — web-store-pos: `pnpm test`, `tsc --noEmit`, `pnpm build` — all green.
- [x] F.7 Update this file with commit hashes; record the ratified Flag A/B choice at the top of
      the Flagged section for the historical record.

## Deferred to Phase 2 step 8 (do NOT pull into this slice)

- `extends BaseService` drop + `getAll`/`getById`/`delete`/`create`/`update`/`getByBarcode`
  removal on BOTH `ProductService` and `ProductCategoryService` (Slice 6's Flag #1 + this slice's
  Flag C's `AsyncProductService` workaround both collapse away once this lands — `ProductService`
  itself becomes the 12-method async shape and `ProductOnlineService` can `implements
  ProductService` directly, retiring the local `AsyncProductService` alias).
- The 6 blocked call sites (`products.tsx`, `sale.tsx`, `egress.tsx`, `available.tsx`,
  `import.tsx`, `export.tsx`) full re-expression + factory rewiring, plus (if Flag A was chosen
  this slice) the 3 sites deferred here too, all in one coherent pass.
- Slice 5's Flag #7 sync-layer (`import.tsx`/`export.tsx`/`data-serializer-service.ts`/
  `order-offline-service.ts`) repository re-point.
- Slice 6's Flag #5 (`sale.tsx`/`egress.tsx` full `getProductsToSaleByCategoryId` re-expression),
  if not pulled forward.
- Tightening `ProductRepository`'s `categoryRepository` param to mandatory — Phase 2 step 9
  (already deferred by Phase 1, engram #758).
- A future confirmed fix for ANGULAR-BUG-SUSPECT #5 (double-slash URLs), should the user decide
  it's worth correcting rather than mirroring — not decided in this slice.
