# Delta Spec — Slice 3: Online Service Layer + Factories

Governs proposal #671, decision #670, spec-slice1 #673, spec-slice2 #684. File: `openspec/changes/offline-online-service-parity/spec-slice3.md`. Angular `frontend/` is source of truth (pinned from real source, not prose). Slices 4-6 (auth, admin CRUD, infra) remain OUT of scope.

Angular sources read in full: `application/products/product-online.service.ts`, `application/categories/product-category-online.service.ts`, `domain/interfaces/product.service.ts`, `application/categories/product-category.service.ts`, `_services/base.service.ts` (generic CRUD parent both extend), `_services/factories/product-service.factory.ts`, `_services/factories/product-category-service.factory.ts`, `_shared/configs/global.config.ts`.

## Capability: online-service-layer (NEW)

`ProductOnlineService`/`ProductCategoryOnlineService` (new files, mirroring Angular's classes) MUST implement the SAME shared `ProductService`/`ProductCategoryService` interfaces from `packages/domain` that the offline services implement (Slice 1/2). They delegate to `apiClient` (`frontend-react/apps/web-store-pos/app/shared/lib/http/api-client.ts`, axios-based).

### Requirement: ProductOnlineService endpoint surface
Each `ProductService` interface member MUST call the Angular-pinned endpoint below (verb + path, relative to `Products/`; Angular's `API_URL` already ends in `/`, so paths with a leading `/` reproduce Angular's literal (redundant) double slash — source-literal, not invented):

| Interface member | Angular source method | Verb + path | Payload / mapping |
|---|---|---|---|
| `getAll()` | `BaseService.getAllItems()` (inherited) | `GET Products/all/false` | response `.data` → `Product[]` |
| `getById(id)` | `getProductById(id)` | `GET Products//{id}` | response `.data` → `Product \| undefined` |
| `getByBarcode(barcode)` | `getProductByBarcode(barcode)` | `GET Products/byBarcode/{barcode}` | response `.data` → `Product \| undefined` |
| `getMaxOrder(categoryId)` | `getMaxOrder(categoryId)` | `GET Products/maxOrderByCategoryId/{categoryId}` | response `.data` → `number` |
| `getAvailableProductsByCategoryId(categoryId)` | `getAvailableProductsByCategoryId(categoryId)` | `GET Products/availableByCategoryId/{categoryId}` | response `.data` → `Product[]` |
| `delete(id)` | `deleteProduct(id)` | `DELETE Products//{id}` | response `.data` → discarded (void) |
| `update(product)` | AMBIGUOUS — see Ambiguities #1 | `PUT Products//{id}` | see Ambiguities #1 |
| `getByName(name)` | **NO ANGULAR ONLINE ENDPOINT** | — | see Ambiguities #2 (gap) |
| `activate(id)` / `deactivate(id)` | **NO ANGULAR ONLINE ENDPOINT** | — | see Ambiguities #2 (gap) |

Scenario: `getByBarcode('123')` on a matched barcode → issues `GET Products/byBarcode/123`, resolves the `Product` from `response.data`.
Scenario: `getAvailableProductsByCategoryId(catId)` → issues `GET Products/availableByCategoryId/{catId}`, resolves `Product[]` from `response.data`.
Scenario (conformance): `ProductOnlineService` compiles only when it satisfies every `ProductService` member.

### Requirement: ProductCategoryOnlineService endpoint surface
Each `ProductCategoryService` interface member MUST call the Angular-pinned endpoint below (relative to `ProductCategories/`):

| Interface member | Angular source method | Verb + path | Payload / mapping |
|---|---|---|---|
| `getAll()` | `BaseService.getAllItems()` (inherited) | `GET ProductCategories/all/false` | response `.data` → `ProductCategory[]` |
| `getById(id)` | `BaseService.getItemById(id)` (inherited) | `GET ProductCategories//{id}` | response `.data` → `ProductCategory \| undefined` |
| `getMaxOrder()` | `getMaxOrder()` | `GET ProductCategories/maxOrder` | response `.data` → `number` |
| `getAvailableProductCategories()` | `getAvailableProductCategories()` | `GET ProductCategories/all/false` | response `.data` → `ProductCategory[]` (same URL as `getAll()` — Angular never declares `getProductCategories()` abstract, see spec-slice1 bug-fix note; both interface members are genuinely backed by the same call) |
| `getProductCategoriesView()` | `getProductCategoriesView()` | `GET ProductCategories/catalog` | response `.data` → `ProductCategoryView[]` |
| `delete(id)` | `BaseService.delete(id)` (inherited) | `DELETE ProductCategories//{id}` | response `.data` → discarded (void) |
| `save(category)` | AMBIGUOUS — see Ambiguities #1 | `POST ProductCategories/` (create) or `PUT ProductCategories//{id}` (update) | see Ambiguities #1 |
| `getByName(name)` | **NO ANGULAR ONLINE ENDPOINT** | — | see Ambiguities #2 (gap) |
| `hasAnyCategory()` / `hasAnyAvailableCategory()` | **NO ANGULAR ONLINE ENDPOINT** | — | see Ambiguities #2 (gap) |

Scenario: `getProductCategoriesView()` → issues `GET ProductCategories/catalog`, resolves `ProductCategoryView[]` from `response.data`.
Scenario: `getMaxOrder()` → issues `GET ProductCategories/maxOrder`, resolves `number` from `response.data`.
Scenario (conformance): `ProductCategoryOnlineService` compiles only when it satisfies every `ProductCategoryService` member.

### Requirement: Error handling
Angular's online services rely on the interceptor chain for errors (no per-method `catchError`, only `BaseService`'s inherited methods catch and degrade to empty/default values). React's online services MUST surface axios failures rather than silently swallow them (interceptor-level 401 handling already exists in `api-client.ts`); non-401 errors propagate to the caller.
Scenario: `getById(id)` for a missing id → server returns 404 → the call rejects/throws; caller handles it (no silent `undefined` masking a network failure vs a genuine not-found, since Angular itself conflates both via `catchError` — React MUST NOT replicate that conflation per angular-bugs-policy, since it has no external contract dependents here).

## Capability: service-factories (NEW)

### Requirement: createProductService() / createProductCategoryService()
MUST expose plain factory functions (no DI, per proposal's chosen "Online-layer architecture pattern") mirroring Angular's `productServiceFactory()`/`productCategoryServiceFactory()`: return the online impl when `GlobalConfig.USE_ONLINE_SERVICE` (`frontend-react/apps/web-store-pos/app/shared/lib/config/global-config.ts`) is `true`, else the offline impl.
Scenario: `GlobalConfig.USE_ONLINE_SERVICE = false` (current default) → `createProductService()` returns the existing `ProductOfflineService` instance/constructor path, behavior unchanged.
Scenario: `GlobalConfig.USE_ONLINE_SERVICE = true` → `createProductService()` returns a `ProductOnlineService` instance satisfying the same `ProductService` interface.

### Requirement: Retire dead service-factory.ts
`frontend-react/apps/web-store-pos/app/shared/lib/services/service-factory.ts` (`ServiceImpl<T>`, `createService<T>`) MUST be removed — confirmed dead code (zero production callers; only its own test file and stale docs reference it, verified via repo-wide grep).
Scenario: after removal, `pnpm -w tsc --noEmit`/test suite still passes with no other file importing `service-factory.ts`.

## Requirement count
4 requirements (ProductOnlineService surface, ProductCategoryOnlineService surface, error handling, factories) — factories requirement counted once covering both functions + retirement = **5 requirements total**, ~9 method-level scenarios + 2 conformance scenarios + 2 factory scenarios + 1 retirement scenario = **14 scenarios**.

## Ambiguities resolved from source

1. **`update`/`save` endpoint choice is genuinely ambiguous in Angular itself.** Both `ProductService`/`ProductCategoryService` abstract classes inherit a generic `BaseService.update(item)` (`PUT {API_URL}/{item.id}`, raw item body) AND additionally declare a field-specific method (`updateProduct(...)` / `updateProductCategory(...)`, same URL, explicit field list). Angular never resolves this overlap — both exist, unused ambiguity in its own codebase. NOT a bug (no observed defect), just redundant surface. Left OPEN for design: which one the sync `update(product)`/`save(category)` interface member should call (structured-field endpoint recommended for parity with the admin CRUD UI flows, but not resolved here — spec pins endpoints, not selection logic).
2. **Three interface members have NO matching Angular online endpoint at all**: `getByName` (both services), `activate`/`deactivate` (Product), `hasAnyCategory`/`hasAnyAvailableCategory` (Category). Confirmed by full-file read of both online services — these were ported in Slice 2 from Angular's REPOSITORY layer (local-instance convenience methods), which never had a server-side equivalent; the online services genuinely never implement them. This is NOT an oversight to invent an endpoint for — flagged as an OPEN DECISION for design (see below), not silently resolved.
3. `getAll()` and `getAvailableProductCategories()` resolve to the IDENTICAL Angular endpoint (`GET ProductCategories/all/false`) because Angular's `getProductCategories()` abstract method is commented out (spec-slice1's bug-fix #3) — both interface members are genuinely backed by one online call; not a spec error.
4. Angular's `API_URL` already ends in `/`, and several methods (`getProductById`, `deleteProduct`, `getItemById`, `delete`) prepend another `/` before the id, producing a literal double slash (`Products//{id}`) in the resulting URL. This is source-literal (present in real Angular code), not a copy error introduced here — pinned faithfully; whether the backend normalizes double slashes is a design/apply-time verification concern, not a spec decision.

## OPEN DECISIONS FOR DESIGN

1. **Sync-vs-async reconciliation (HIGH, binding for the whole online layer).** The shared `ProductService`/`ProductCategoryService` interfaces (`packages/domain`) and every offline implementation (Slices 1-2) are PLAIN SYNCHRONOUS (design-slice1 ADR-1: no Promise/Observable/Result). An HTTP-backed online service is inherently asynchronous (axios returns Promises) — no method can synchronously return server data. These cannot both literally satisfy one sync interface as written. Options to name (NOT choose — design decides):
   - **(a) Async-ify the shared interface**: change `ProductService`/`ProductCategoryService`/`BaseService<T>` to return `Promise<T>` everywhere, wrap every offline method body in `Promise.resolve(...)`. Blast radius: ripples into EVERY offline caller across the app (Zustand stores, routes, components) plus every Slice-1/Slice-2 test (all currently assert synchronous return values) — large, cross-cutting, touches code well outside Slice 3's file set.
   - **(b) Separate async interface for online**: define a distinct `AsyncProductService`/`AsyncProductCategoryService` (or a generic `Promisify<T>` mapped type) that the online classes implement instead of the sync one; the factory's return type becomes a union or the factory itself is async. Blast radius: contained to the online layer + factory signature, but callers consuming `createProductService()` must now branch/await conditionally, or the factory always returns a Promise (changes ALL call sites' calling convention regardless of which impl is active).
   - **(c) Factory returns a union / caller-transparent seam**: factory signature itself becomes `Promise<ProductService>` (async factory, sync interface once resolved) — offline branch does `Promise.resolve(offlineInstance)`, online branch does an async bootstrap/prefetch (e.g., hydrate a snapshot then wrap sync reads over cached data) before resolving. Blast radius: smallest at the interface level (interface stays sync) but pushes complexity into "when do we refetch the online snapshot" and staleness semantics — needs its own design.
   Design MUST name the blast radius explicitly for whichever option it picks, since `USE_ONLINE_SERVICE` is hardcoded `false` today (no live regression risk from deferring), but Slice 3 cannot compile a real `implements ProductService` HTTP class under option choice (a) is deferred/(b)/(c) is chosen without resolving this first.
2. **Three interface members with no Angular online endpoint** (`getByName`, `activate`/`deactivate`, `hasAnyCategory`/`hasAnyAvailableCategory`) — design must choose one of: (i) implement as a client-side derivation over an online `getAll()` fetch (same predicate logic as the offline service, just sourced from server data — most consistent with "online-ready" framing), (ii) throw a clear not-implemented error (honest gap, but breaks compile-time "both impls fully interchangeable" guarantee informally implied by the shared interface), or (iii) escalate the API contract question (confirm whether a real backend endpoint exists that Angular simply never wired up). Do NOT invent an endpoint path without one of these being explicitly chosen.
3. **`update`/`save` endpoint selection** (Ambiguity #1 above) — design must pick generic `update(item)` vs field-specific `updateProduct(...)`/`updateProductCategory(...)`, and for `save(category)` decide the create-vs-update branch condition (e.g., presence of a pre-existing `id` looked up via `getById` first, or an explicit `isNew` signal from the caller).
4. **Factory retirement mechanics** — confirm no residual import of `service-factory.ts` before deletion (already grep-verified zero production callers as of this spec; design/apply should re-verify at implementation time in case Slice 3 work introduces new callers before the old file is removed).

Next: sdd-design for Slice 3.
