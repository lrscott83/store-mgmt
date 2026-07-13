# Design: Port ProductCategoryOnlineService + createProductCategoryService factory

> Fase 2 categories parity — sole remaining gap. Angular ships BOTH category offline AND
> online services; React shipped only the offline concrete (`product-service-parity`, verify
> PASS 2026-07-09) — a playbook rule-7 violation (migrate offline AND online when both exist).
> This change adds the online concrete + the DI factory, mirroring the already-shipped
> `ProductOnlineService` / `createProductService` sibling (commit 07c0725), and rewires the 4
> consumers to the factory.

## 1. Architecture Approach

No new architectural pattern. This change EXTENDS the existing sales-services layer by adding
the missing branch of an already-established shape:

```
                       ProductCategoryService (abstract, @store-mgmt/domain)
                       — 5 async methods, Promise<BaseResponseModel<T>>
                              ▲                              ▲
              implements     │                              │   implements
        ┌──────────────────────────────┐      ┌──────────────────────────────────┐
        │ ProductCategoryOfflineService│      │ ProductCategoryOnlineService     │  ◀── NEW
        │ (EXISTS)                     │      │ (NEW — apiClient-backed)         │
        │ repos: category + product    │      │ dep: apiClient (axios)           │
        └──────────────────────────────┘      └──────────────────────────────────┘
                              ▲                              ▲
                              └──────────────┬───────────────┘
                                             │
                            createProductCategoryService(storeId)   ◀── NEW factory
                            GlobalConfig.USE_ONLINE_SERVICE ? online : offline
                                             ▲
                    ┌────────────┬───────────┴───────────┐
              products.tsx    sale.tsx              egress.tsx        ◀── REWIRED (DG-2, 3 sites)

              available.tsx  ◀── EXCLUDED: keeps `new ProductCategoryOfflineService`
                                 (uses offline-concrete getProductCategories, off the abstract surface)
```

The design is a straight structural mirror of the `product-*` sibling trio
(`product-online-service.ts` + `product-service.factory.ts` + `createProductService` call-site
rewiring). Rule 12 (invent nothing): no base class, no helper, no method beyond Angular's
5-method surface. The abstract `ProductCategoryService` interface and the offline concrete
already exist and are untouched.

### Reference-only contract (parity rule 1)
`ProductCategoryOnlineService` is NEVER validated against a live backend. It is a 1:1 mirror
of Angular's `application/categories/product-category-online.service.ts`, exercised in tests
exclusively via a mocked `apiClient`. It is dormant at runtime today
(`GlobalConfig.USE_ONLINE_SERVICE: false`).

## 2. Components & Data Flow

### 2.1 New file — `ProductCategoryOnlineService`
Path: `frontend-react/apps/web-store-pos/app/sales/lib/services/product-category-online-service.ts`
(mirrors the sibling's location/naming: `product-online-service.ts` in the same directory).

**Class shape** — mirror `ProductOnlineService` exactly:
- `export class ProductCategoryOnlineService implements ProductCategoryService`
- `private readonly API_URL = '/v1/ProductCategories/';` (mirrors Angular
  `API_URL = ${apiUrl}/${apiVersion}/ProductCategories/` — trailing slash; the React apiClient
  base + `/v1/ProductCategories/` prefix).
- **Constructor: NONE / no-args.** Angular's online ctor takes only `HttpClient` (a framework
  singleton); the React sibling `ProductOnlineService` has no constructor and reaches for the
  module-level `apiClient` import directly. Mirror that: no `storeId`, no DI param. Import
  `apiClient` from `~/shared/lib/http/api-client`.
- Every method: `const url = this.API_URL + <suffix>; const response = await apiClient.<verb>(url, <body?>); return response.data;`
- Types imported from `@store-mgmt/domain`: `BaseResponseModel`, `ProductCategory`,
  `ProductCategoryView`, `ProductCategoryService`.

**Method-for-method map (Angular → React, DG-1 NORMALIZED URLs):**

| # | Method (signature) | Verb | Normalized URL | Body | Return |
|---|--------------------|------|----------------|------|--------|
| 1 | `getAvailableProductCategories()` | GET | `/v1/ProductCategories/all/false` | — | `Promise<BaseResponseModel<ProductCategory[]>>` |
| 2 | `getProductCategoriesView()` | GET | `/v1/ProductCategories/catalog` | — | `Promise<BaseResponseModel<ProductCategoryView[]>>` |
| 3 | `createProductCategory(name, order, isActive)` | POST | `/v1/ProductCategories/` | `{ name, order, isActive }` | `Promise<BaseResponseModel<boolean>>` |
| 4 | `updateProductCategory(id, name, order, isActive)` | PUT | `/v1/ProductCategories/` + id ⚠️NORMALIZED | `{ id, name, order, isActive }` | `Promise<BaseResponseModel<boolean>>` |
| 5 | `getMaxOrder()` | GET | `/v1/ProductCategories/maxOrder` ⚠️NORMALIZED | — | `Promise<BaseResponseModel<number>>` |

**DG-1 — INTENTIONAL DEVIATION FROM THE SIBLING (binding, ratified #1021).**
Angular's source emits literal double-slash URLs in methods 4 and 5:
- `updateProductCategory`: `API_URL + "/" + id` → `/v1/ProductCategories//{id}`
- `getMaxOrder`: `API_URL + "/maxOrder"` → `/v1/ProductCategories//maxOrder`

This is ANGULAR-BUG-SUSPECT #5. Per the ratified gate, we **NORMALIZE** (fix the bug with TDD,
the angular-bugs-policy DEFAULT) rather than mirror. Concretely, drop the extra leading slash:
- method 4: `const url = this.API_URL + id;` → `/v1/ProductCategories/{id}`
- method 5: `const url = this.API_URL + 'maxOrder';` → `/v1/ProductCategories/maxOrder`

Methods 1–3 are already clean in Angular (`API_URL + "all/false"`, `+ "catalog"`, bare
`API_URL`) — carried over verbatim.

> ⚠️ CROSS-SIBLING INCONSISTENCY (documented, accepted): `ProductOnlineService` MIRRORED
> `#5` verbatim (keeps `//`); this service NORMALIZES it. The divergence is deliberate and
> ratified. A follow-up to reconsider the `ProductOnlineService` `#5` mirror is logged in
> gates #1021 — NOT part of this change. This must be called out in a class-level JSDoc
> comment so a future reader does not "restore consistency" by re-introducing the bug.

**Out of scope (rule 12):** Angular's commented-out `getProductCategories`,
`updateProductCategories`, `getProductCategoryById` — Angular effectively lacks them, not on
the abstract surface. NOT ported.

### 2.2 New file — `product-category-service.factory.ts`
Path: `frontend-react/apps/web-store-pos/app/sales/lib/services/product-category-service.factory.ts`
(mirrors `product-service.factory.ts`).

```ts
import type { ProductCategoryService } from '@store-mgmt/domain';
import { GlobalConfig } from '~/shared/lib/config/global-config';
import { ProductCategoryOnlineService } from './product-category-online-service';
import { ProductCategoryOfflineService } from './product-category-offline-service';

export function createProductCategoryService(storeId: string): ProductCategoryService {
  return GlobalConfig.USE_ONLINE_SERVICE
    ? new ProductCategoryOnlineService()
    : new ProductCategoryOfflineService(storeId);
}
```

Structure is byte-for-byte the shape of `createProductService`:
- `storeId` is forwarded ONLY to the offline branch (online has no store concept — mirrors
  Angular's online ctor taking only `HttpClient`).
- Offline is constructed with `new ProductCategoryOfflineService(storeId)` — the single-arg
  form the 4 call-sites already use. The offline ctor's optional `categoryRepository?` /
  `productRepository?` params default internally (`?? new ProductCategoryRepository(storeId)` /
  `?? new ProductRepository(storeId, new ProductCategoryRepository(storeId))`), so the factory
  passes nothing extra — identical to how `createProductService` constructs
  `new ProductOfflineService(storeId)`. NO repository injection at the factory layer.
- Return type annotated as `ProductCategoryService` (the abstract surface).

### 2.3 Call-site rewiring (DG-2, binding — SCOPED to 3 sites, see ADR-4)
Of the 4 consumers that do `new ProductCategoryOfflineService(storeId)` directly, the 3 that use
ONLY the abstract surface are rewired to `createProductCategoryService(storeId)` for true DI parity
(mirrors what the product sibling did). Behavior is IDENTICAL while `USE_ONLINE_SERVICE: false` — the
factory returns the same offline concrete. Zero runtime change today. `available.tsx` is EXCLUDED
(see ADR-4 + the GOTCHA below): it consumes offline-concrete `getProductCategories()` (all
categories), absent from the abstract `ProductCategoryService`, so it keeps its direct instantiation.

| File | Line | Current | New |
|------|------|---------|-----|
| `sales/routes/products.tsx` | 41 | `const categoryService = new ProductCategoryOfflineService(storeId);` | `const categoryService = createProductCategoryService(storeId);` |
| `sales/routes/sale.tsx` | 40 | `const categoryService = new ProductCategoryOfflineService(storeId);` | `const categoryService = createProductCategoryService(storeId);` |
| `inventory/routes/egress.tsx` | 46 | `const categoryService = new ProductCategoryOfflineService(storeId);` | `const categoryService = createProductCategoryService(storeId);` |
| `inventory/routes/available.tsx` | 28 | `const categorySvc = new ProductCategoryOfflineService(storeId);` | *UNCHANGED — excluded (ADR-4)* |

Import edits per file (replace the offline-service import with the factory import):
- `products.tsx` & `sale.tsx`: swap
  `import { ProductCategoryOfflineService } from '../lib/services/product-category-offline-service';`
  → `import { createProductCategoryService } from '../lib/services/product-category-service.factory';`
- `egress.tsx`: swap
  `import { ProductCategoryOfflineService } from '~/sales/lib/services/product-category-offline-service';`
  → `import { createProductCategoryService } from '~/sales/lib/services/product-category-service.factory';`
- `available.tsx`: NO import change (excluded).

> NOTE: `available.tsx` lives under `inventory/routes/` (NOT `sales/routes/` — the proposal's
> `sales/routes/available.tsx` reference was a path typo). Confirmed by grep. Its import uses
> the `~/sales/...` alias form.

The `products.tsx` rewire consumes the returned service via `getProductCategoriesView()`,
`createProductCategory(...)`, `updateProductCategory(...)`; `sale.tsx`/`egress.tsx` via
`getAvailableProductCategories()`; `available.tsx` via `getProductCategories()`.

> ⚠️ GOTCHA — `available.tsx` calls `categorySvc.getProductCategories()` (line 37), which is
> the OFFLINE-CONCRETE-ONLY method, NOT on the abstract `ProductCategoryService` interface (and
> NOT on the online concrete). After rewiring to `createProductCategoryService(storeId)` — typed
> `ProductCategoryService` — `getProductCategories()` is NOT on that type → **TypeScript compile
> error**. This is the ONE non-mechanical rewire. Resolution is a tasks/apply concern, but the
> design constrains the options:
>   - **Preferred (parity-safe):** the return type of the factory is the abstract interface, so
>     `available.tsx` must switch to a surface method that EXISTS on the interface. The nearest
>     equivalent is `getAvailableProductCategories()` — BUT that is active-only, whereas
>     `getProductCategories()` returns ALL categories (the current `available.tsx` behavior,
>     WU10-documented as "ALL categories, same unfiltered set"). Switching would CHANGE behavior
>     → NOT allowed without a gate.
>   - **Therefore:** `available.tsx` must NOT be blindly rewired to the abstract-typed factory if
>     it depends on the offline-only `getProductCategories()`. Options for tasks phase, in order:
>     (a) keep `available.tsx` on `new ProductCategoryOfflineService(storeId)` and EXCLUDE it
>     from DG-2 rewiring (document the exclusion — it needs an offline-only method the online
>     concrete/abstract surface lacks); or (b) if DG-2 mandates all 4, surface the divergence to
>     the user before apply. RECOMMENDATION: exclude `available.tsx` from the rewire (option a) —
>     rewiring it to an abstract-typed factory would either break the build or silently change
>     the unfiltered-vs-active-only behavior. The other 3 routes only use abstract-surface
>     methods and rewire cleanly.
>
> This is an unresolved decision the tasks phase MUST gate (see §6 Risks). The product sibling
> did NOT hit this because every product call-site used only abstract-surface methods.

## 3. Integration Points

- `apiClient` (`~/shared/lib/http/api-client`, axios instance) — the online service's sole
  dependency. Import side-effect (`axios.create`) is benign at module load; no network.
- `GlobalConfig.USE_ONLINE_SERVICE` (`~/shared/lib/config/global-config`) — the factory gate,
  currently `false`.
- `ProductCategoryOfflineService` (existing) — the offline branch, constructed single-arg.
- `@store-mgmt/domain` — `ProductCategoryService`, `BaseResponseModel`, `ProductCategory`,
  `ProductCategoryView` types.

## 4. Test-Mock Impact (route tests)

Established sibling precedent (`sale.test.tsx` / `products.test.tsx` already run the REAL
`createProductService` factory while mocking `product-offline-service` at the module level):
a `vi.mock('~/sales/lib/services/product-category-offline-service', ...)` module mock is
**transparent through the real factory** when `USE_ONLINE_SERVICE: false`, because the factory
does `new ProductCategoryOfflineService(storeId)` and receives the mocked constructor.

Therefore the 3 rewired route test files that mock the offline category service —
`products.test.tsx`, `sale.test.tsx`, `inventory-routes.test.tsx` (egress) — should require
**NO mock changes**: they keep mocking `product-category-offline-service`, and the real factory
resolves to that mock while the flag is false.

Contingency (verify during apply): the factory module imports `product-category-online-service`,
which imports `apiClient` (axios). If any route test's environment chokes on that transitive
import, add `vi.mock('~/shared/lib/http/api-client', ...)` to that test file (the online branch
is never constructed with the flag false, so a stub is sufficient). Do NOT expect this to be
needed — the product sibling's route tests do not mock apiClient.

`available.tsx`'s test (if it is excluded from rewiring per §2.3) needs no change at all.

## 5. Work-Unit Breakdown (suggestion for tasks phase)

Keep as reviewable, independently-committable units on `feat/frontend-parity-audit`
(commits-only, no PRs):

- **WU1 — Online concrete + factory + unit tests** (RED→GREEN, self-contained, zero runtime
  impact):
  1. RED: `product-category-online-service.test.ts` — mock `apiClient`, assert each of the 5
     methods' NORMALIZED URL + verb + body + `response.data` passthrough.
  2. RED: `product-category-service.factory.test.ts` — assert offline instance when flag false,
     online instance when flag true, and the surface exists.
  3. GREEN: implement `product-category-online-service.ts` then
     `product-category-service.factory.ts`.
- **WU2 — Call-site rewiring + mock verification** (3 routes: products, sale, egress; +
  `available.tsx` ONLY if the §2.3 gate resolves to include it):
  1. Swap imports + `new ...OfflineService(storeId)` → `createProductCategoryService(storeId)`.
  2. Run the 3 route test suites unchanged; confirm GREEN (transparent-mock precedent). Add the
     apiClient contingency mock only if a suite fails on transitive import.
  3. Resolve/gate the `available.tsx` offline-only-`getProductCategories()` decision (§2.3)
     BEFORE touching it.

WU1 is landable and reviewable on its own (dormant parity, mirrors the product sibling). WU2 is
the behavior-preserving DI wiring. Splitting keeps each commit under the review budget and
isolates the one non-mechanical call-site.

## 6. ADR-Style Decisions

### ADR-1 — Online concrete is no-args, apiClient module-imported (not DI-constructed)
- **Decision:** `ProductCategoryOnlineService` takes NO constructor args and imports the
  module-level `apiClient`, mirroring `ProductOnlineService`.
- **Rationale:** Angular's online ctor takes only the `HttpClient` framework singleton; the
  React sibling already collapsed that to a module import. Parity + sibling consistency.
- **Rejected:** injecting an http client via ctor (would invent DI Angular doesn't express in
  React and diverge from the shipped `ProductOnlineService`).

### ADR-2 — NORMALIZE the double-slash URLs (DG-1, ratified)
- **Decision:** methods 4 (`updateProductCategory`) and 5 (`getMaxOrder`) emit clean
  single-slash URLs; drop Angular's extra leading slash.
- **Rationale:** angular-bugs-policy DEFAULT (fix Angular bugs with TDD); user ratified over
  the literal-mirror exception (#1021).
- **Rejected:** mirror `//` verbatim (what `ProductOnlineService` did). Creates a cross-sibling
  inconsistency, accepted and documented; a follow-up to reconsider the product sibling is
  logged separately, out of scope here.
- **Guardrail:** class-level JSDoc documents the deliberate divergence so nobody "restores
  consistency" by re-adding the bug; RED tests assert the CLEAN URLs exactly.

### ADR-3 — Factory forwards storeId to offline only, no repo injection
- **Decision:** `createProductCategoryService(storeId)` calls
  `new ProductCategoryOfflineService(storeId)` (single-arg) for offline; online gets nothing.
- **Rationale:** exact mirror of `createProductService`; offline ctor self-defaults its repos.
- **Rejected:** injecting `ProductCategoryRepository` / `ProductRepository` at the factory
  (invents wiring neither Angular's factory nor the product sibling expresses).

### ADR-4 — Rewire 3 clean call-sites; gate `available.tsx` (DG-2, partially constrained)
- **Decision:** rewire `products.tsx`, `sale.tsx`, `egress.tsx` to the factory. `available.tsx`
  depends on the offline-only `getProductCategories()` (not on the abstract surface) → gate its
  rewire; RECOMMEND excluding it (keep it on the offline concrete) to avoid a build break or a
  silent active-only-vs-all behavior change.
- **Rationale:** DI parity where it's behavior-neutral; do not break a real offline-only
  dependency for the sake of uniform wiring.
- **Rejected:** blind rewire of all 4 (breaks TS compile on `available.tsx` or changes its
  category set). Ratified DG-2 intent (DI parity, behavior identical while flag false) is
  UPHELD for the 3 clean routes; `available.tsx` cannot satisfy "behavior identical" via the
  abstract surface, so it is the documented exception pending user confirmation in tasks/apply.

## 7. Risks & Unresolved Decisions

| Risk / Decision | Severity | Handling |
|-----------------|----------|----------|
| `available.tsx` uses offline-only `getProductCategories()` — abstract-typed factory lacks it → build break or behavior change if rewired | HIGH | Gate in tasks; RECOMMEND excluding `available.tsx` from DG-2 (keep offline concrete). Surface to user before apply. |
| Normalizing `//` (silent "improvement" perception) | Med | ADR-2 ratified; RED tests assert clean URLs; JSDoc documents the deliberate divergence |
| Cross-sibling inconsistency (product keeps `//`, category normalizes) | Med | Documented + accepted; follow-up logged in #1021, out of scope |
| Route test transitive apiClient import | Low | Contingency mock noted (§4); precedent says not needed |
| Dead code (flag false) misread as unused | Low | Mirrors product precedent; documented as dormant-parity |

## 8. Rollback

Revert the 2 new files (+ the 3–4 call-site edits + any test tweaks). No runtime behavior
changes while `USE_ONLINE_SERVICE: false`; the offline path is untouched.
