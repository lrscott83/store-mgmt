# Proposal: Port ProductCategoryOnlineService + factory (Fase 2 categories parity)

## Intent

Close the sole remaining "Fase 2 — categories" parity gap. Angular has BOTH a category
offline AND online service; React shipped only the offline concrete (`product-service-parity`,
verify PASS 2026-07-09). This violates playbook rule 7 (migrate offline AND online when both
exist). The `product-service` spec already documents the online category surface (spec.md L71)
— only the implementation + DI factory were never built. Dormant today
(`GlobalConfig.USE_ONLINE_SERVICE: false`), but parity discipline + the already-shipped
`ProductOnlineService`/`createProductService` sibling (commit 07c0725) demand the port for
consistency.

## Scope

### In Scope
- `product-category-online-service.ts` — `ProductCategoryOnlineService implements ProductCategoryService`, apiClient-backed, `API_URL='/v1/ProductCategories/'`, mirroring the 5 Angular HTTP methods (`getAvailableProductCategories`, `getProductCategoriesView`, `createProductCategory`, `updateProductCategory`, `getMaxOrder`), Observable→Promise, envelope returned verbatim.
- `product-category-service.factory.ts` — `createProductCategoryService(storeId): ProductCategoryService` gated on `GlobalConfig.USE_ONLINE_SERVICE`, mirroring `createProductService` (online branch ignores `storeId`; offline gets it).
- Mirror Angular URL quirks verbatim (see DG-1).

### Out of Scope
- Angular's commented-out methods (`getProductCategories`, `updateProductCategories`, `getProductCategoryById`) — Angular effectively lacks them, not on abstract surface (rule 12).
- Any new abstraction, base class, or method beyond the 5-method surface.
- Flipping `USE_ONLINE_SERVICE` or live-backend validation (reference-only, parity rule 1).

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `product-service`: add a requirement that React ships the online category concrete + a DI factory implementing the already-specified 5-method category surface (spec.md L71), including the mirrored double-slash URLs.

## Approach

Copy the `ProductOnlineService` + `product-service.factory.ts` shape exactly. Each method:
`const url = API_URL + suffix; const r = await apiClient.<verb>(url, body?); return r.data;`.
Method-by-method Angular→React URL/body map (exact):

| Method | URL | Body |
|--------|-----|------|
| `getAvailableProductCategories()` | `/v1/ProductCategories/all/false` | — |
| `getProductCategoriesView()` | `/v1/ProductCategories/catalog` | — |
| `createProductCategory(name,order,isActive)` | `/v1/ProductCategories/` | `{name,order,isActive}` |
| `updateProductCategory(id,name,order,isActive)` | `/v1/ProductCategories//` + id ⚠️ | `{id,name,order,isActive}` |
| `getMaxOrder()` | `/v1/ProductCategories//maxOrder` ⚠️ | — |

## Decision Gates (RATIFY before spec)

- **DG-1 — double-slash URLs (ANGULAR-BUG-SUSPECT #5 pattern).** `updateProductCategory` and `getMaxOrder` build `API_URL + '/' + …` on top of the trailing slash → literal `//`. Precedent: `ProductOnlineService` MIRRORED #5 verbatim, NOT normalized. **Recommendation: mirror** (consistency). Needs ratification.
- **DG-2 — call-site wiring.** 4 consumers (`products.tsx`, `sale.tsx`, `inventory/egress.tsx`, `inventory/available.tsx`) currently do `new ProductCategoryOfflineService(storeId)` directly; the product sibling rewired its call-sites to `createProductService`. **Recommendation: rewire to `createProductCategoryService`** for true DI parity (behavior identical while flag is false) — but this expands the diff to 4 routes + their test mocks. Ratify: rewire now vs land factory dormant.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/web-store-pos/app/sales/lib/services/product-category-online-service.ts` | New | Online concrete |
| `apps/web-store-pos/app/sales/lib/services/product-category-service.factory.ts` | New | DI factory |
| `sales/routes/{products,sale}.tsx`, `inventory/routes/{egress,available}.tsx` | Modified (DG-2) | Optional factory rewire |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Normalizing the `//` URLs (silent "improvement") | Med | DG-1 ratified as mirror; test asserts literal `//` |
| Scope creep via DG-2 rewire | Med | Gate the rewire behind explicit ratification |
| Dead code (flag false) misread as unused | Low | Mirror product precedent; documented as dormant-parity |

## Rollback Plan

Revert the 2 new files (+ optional 4 call-site edits). No runtime behavior changes while
`USE_ONLINE_SERVICE:false`; the offline path is untouched.

## Dependencies

- Existing async `ProductCategoryService` interface + `ProductCategoryOfflineService` (both DONE).
- `apiClient`, `GlobalConfig.USE_ONLINE_SERVICE`.

## Success Criteria

- [ ] `ProductCategoryOnlineService` implements the 5-method surface, exact URLs/bodies (incl. mirrored `//`).
- [ ] `createProductCategoryService` swaps online/offline on the flag, mirroring `createProductService`.
- [ ] No method Angular lacks; no envelope flattening.
- [ ] DG-1 and DG-2 resolved before spec.
