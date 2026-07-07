# Design — Slice 3: Online Service Layer + Factories

Governs proposal #671, decision #670, spec-slice3 #690, design-slice1 #674, spec/design-slice2 #684/#685.
File: `openspec/changes/offline-online-service-parity/design-slice3.md`. Slice 3 ONLY (Slices 4-6 OUT).
Angular `frontend/` is the ONLY source of truth. Endpoint contract = Angular `*-online.service.ts`. No live API consulted.

## Architecture summary

Two new HTTP-backed services — `ProductOnlineService`, `ProductCategoryOnlineService` — live next to their
offline siblings under `app/sales/lib/services/`, delegate to the existing axios `apiClient`
(`shared/lib/http/api-client.ts`), and mirror the endpoint surface pinned in spec-slice3 #690. Two plain factory
functions (`createProductService` / `createProductCategoryService`) mirror Angular's
`productServiceFactory`/`productCategoryServiceFactory`, switching on `GlobalConfig.USE_ONLINE_SERVICE`. The dead
`shared/lib/services/service-factory.ts` (`createService<T>`/`ServiceImpl<T>`) is retired.

**Key finding that reframes the whole slice:** in Angular, BOTH the offline and the online services are
Observable-based (async) — `BaseService<T>` is HTTP/RxJS, and offline services extend the same async base. The
sync/async tension is therefore NOT something Angular "resolves"; it is a React-only artifact of the Slice-1 ADR-1
decision to make offline services plain-sync. Angular's factory works because both impls share one async contract.
React must bridge one async impl into a codebase whose offline contract is sync — WITHOUT rippling async into the
sync consumers.

**Second key finding (measured blast radius):** the factory is a brand-new seam with ZERO current consumers. All
18 production call-sites instantiate `new ProductOfflineService(storeId)` / `new ProductCategoryOfflineService(storeId)`
DIRECTLY and read synchronously (verified by rg: `sync/routes/{export,import}.tsx`, `shared/lib/auth/user-home.ts`,
`shared/components/cart-shell.tsx`, `sales/routes/{products,sale}.tsx`, `inventory/**` routes/components,
`reports/lib/services/inventory-today-sale-service.ts`, plus cross-service uses in `product-category-offline-service.ts`
and `order-offline-service.ts`). None goes through any factory. `USE_ONLINE_SERVICE` is hardcoded `false`. So the
async online layer can be introduced with the sync interface, sync offline class, all 18 call-sites, and every
Slice-1/2 test left UNTOUCHED.

## ADRs

### ADR-1 — Sync/async reconciliation: separate async interface via `Promisify<T>`, factory returns the async supertype, offline promisified ONLY at the factory boundary (THE core decision)

**Decision.** Keep the existing sync `ProductService` / `ProductCategoryService` interfaces EXACTLY as-is (zero edits).
Add a type-only `Promisify<S>` mapped type in `packages/domain` and derive
`AsyncProductService = Promisify<ProductService>` and `AsyncProductCategoryService = Promisify<ProductCategoryService>`.
The online services `implements` the Async variants. The factories are typed to return the Async supertype; the
offline branch is adapted to async at the factory boundary via a thin runtime `promisify()` Proxy wrapper. The sync
offline class and its 18 direct sync consumers are NOT rewired in Slice 3.

```ts
// packages/domain/src/services/promisify.ts
export type Promisify<S> = {
  [K in keyof S]: S[K] extends (...args: infer A) => infer R
    ? (...args: A) => Promise<Awaited<R>>
    : S[K];
};
export type AsyncProductService = Promisify<ProductService>;
export type AsyncProductCategoryService = Promisify<ProductCategoryService>;
```

```ts
// shared/lib/services/product-service.factory.ts
export function createProductService(storeId: string): AsyncProductService {
  return GlobalConfig.USE_ONLINE_SERVICE
    ? new ProductOnlineService()
    : promisifyService(new ProductOfflineService(storeId));
}
```

**Measured blast radius of the chosen option: ZERO on the existing sync surface.** No change to the sync interfaces,
no change to `ProductOfflineService`/`ProductCategoryOfflineService`, no change to the 18 call-sites, no change to any
Slice-1/2 test. New code only: the `Promisify` type, two online classes, one `promisifyService` helper, two factory
files.

**Rationale.** Preserving the sync offline surface is the binding constraint. Both online mutation and read methods
are genuinely async (axios Promises) and CANNOT be served synchronously — so the online impl must expose Promise
signatures. A `Promisify<T>` mapped type derives the async contract from the sync one with a single line, so
offline↔online drift stays a COMPILE error (the interface-conformance guarantee the whole program is built on).

**Rejected alternatives.**
- Spec option (a) — async-ify the shared interface (`Promise<T>` everywhere, offline wraps in `Promise.resolve`):
  rejected. Blast radius = all 18 sync call-sites + every Slice-1/2 test (they assert sync return values) — a
  large, cross-cutting rewrite outside the Slice-3 file set, for a kill-switch hardcoded `false`.
- Spec option (c) — async factory returns `Promise<Service>` where the service serves SYNC reads over a hydrated
  snapshot: rejected as **fundamentally broken for the mutation surface**. A hydrated read-through cache can serve
  `getAll`/`getById` synchronously, but `update`/`delete`/`save`/`activate`/`deactivate` are server POST/PUT/DELETE
  calls that a sync method cannot await. Making them sync forces fire-and-forget, which SWALLOWS axios errors —
  directly violating spec-slice3's error-propagation requirement. Snapshot staleness would also need its own design.
- Spec option (b) with a UNION-typed factory (`ProductService | AsyncProductService`): rejected. Forcing every
  factory consumer to narrow/await conditionally defeats the interchangeability the factory exists to provide. The
  chosen variant commits the factory to the async supertype and hides the offline sync→async adaptation inside a
  reusable Proxy, giving consumers ONE clean async type.

### ADR-2 — `update` (Product): mirror Angular's generic `BaseService.update(item)` — single PUT to `/{id}` with the product body

**Decision.** `ProductOnlineService.update(product)` issues one `PUT Products//{id}` with the full product as the
body and resolves the product. The React interface keeps its single `update(product): Product` member; the online
impl does NOT add a field-specific `updateProduct`.

**Rationale.** Angular's online service carries BOTH the inherited generic `update(item)` (PUT to `/{id}`, entity
body) AND a field-specific `updateProduct(id, categoryId, name, ...)` hitting the SAME URL with a structured body
(spec-slice3 ambiguity #1 — Angular never resolves this redundant overlap). React's Slice-1 interface already chose
the generic shape `update(product): Product`. Mirroring the generic `BaseService.update` is the faithful, minimal
choice and matches what the sync offline `update` already does (upsert the whole entity).

**Rejected alternative.** Implementing `updateProduct` with positional fields — would force a second interface member
with no sync-offline counterpart, re-importing Angular's redundant surface for no gain.

### ADR-3 — `save` (Category): id-presence branch mirroring the offline upsert — PUT when id present, POST when absent

**Decision.** `ProductCategoryOnlineService.save(category)` branches on the presence of `category.id`: if set →
`PUT ProductCategories//{id}` (Angular `updateProductCategory`); if absent/empty → `POST ProductCategories/`
(Angular `createProductCategory`). Resolves the passed category.

**Rationale.** Angular online exposes `createProductCategory` (POST) and `updateProductCategory` (PUT /{id})
separately with no unifying `save`; React's Slice-1 interface unified them into `save(category)` (an upsert, matching
the offline `save`). In a sync-offline world the honest create-vs-update signal is "does this entity already carry an
id" — the same signal the offline upsert uses. This keeps online and offline `save` semantically interchangeable.

**Rejected alternative.** Requiring an explicit `isNew` flag from the caller — no caller passes one today and it
would diverge from the offline `save` signature.

### ADR-4 — No-endpoint READ methods: client-side derivation over the online `getAll()`

**Decision.** The read-only interface members that have NO Angular online endpoint are derived client-side from the
online `getAll()` fetch, using the SAME predicate as the offline impl:
- `ProductOnlineService.getByName(name)` → `(await this.getAll()).find(p => p.name === name)`
- `ProductCategoryOnlineService.getByName(name)` → same over categories
- `ProductCategoryOnlineService.hasAnyCategory()` → `(await this.getAll()).length > 0`
- `ProductCategoryOnlineService.hasAnyAvailableCategory()` → `(await this.getAll()).some(c => c.isActive)`

**Rationale.** These were ported in Slice 2 from Angular's local-repository layer, which never had a server route
(spec-slice3 ambiguity #2). They are pure predicates over the full entity set, which the server DOES expose via
`all/false`. Deriving over the online fetch is faithful to Angular's repository logic, keeps the impls
interchangeable, and invents no endpoint. (Confirmed against Angular source: `getMaxOrder`, `getAvailableProductsByCategoryId`,
`getAvailableProductCategories`, `getProductCategoriesView`, `getMaxOrder`-category DO have real endpoints — they are
NOT derived; see the placement table.)

### ADR-5 — No-endpoint MUTATION methods (`activate`/`deactivate` on Product): read-modify-PUT via the update route — RECOMMENDED, needs user sign-off

**Decision (recommended, flagged for confirmation).** `ProductOnlineService.activate(id)` / `deactivate(id)` fetch the
product via `getById(id)`; if absent → no-op (mirrors the offline no-op-on-missing, Slice-2 ADR-5); if present → PUT
the product with `isActive` toggled to `true`/`false` via the existing update route (`PUT Products//{id}`).

**Rationale.** Angular's online service has NO `activate`/`deactivate` route whatsoever (they exist only in Angular's
offline repository). But React's SHARED interface (Slice 2) declares them on ALL impls, so the online impl MUST
provide them for tsc conformance. The server's update route carries `isActive` as a field (Angular `updateProduct`
sends it), so a read-modify-PUT is a functional, honest mirror using the ONE mutation route the server genuinely
exposes — it does NOT materially limit online functionality.

**Why this needs sign-off.** Under the strict "Angular is the ONLY source of truth" principle, Angular's online layer
literally has nothing here, so an equally-honest resolution is to `throw new Error('NotImplemented')`. This is the
single place in Slice 3 where I go beyond the literal Angular-online surface. See "Needs user confirmation" below.

**Rejected alternative (unless the user prefers it).** Throw NotImplemented — strictly faithful to Angular-online's
absence, but breaks the informal "impls fully interchangeable" guarantee and would make online-mode activate/deactivate
dead. Deferred to the user.

### ADR-6 — Error handling: let axios rejections propagate (no catch)

**Decision.** Online methods `await apiClient.<verb>(...)` and return the unwrapped body; they do NOT wrap calls in
try/catch or map errors to defaults. Axios failures reject and bubble to the caller.

**Rationale.** Spec-slice3 requires axios failures to propagate rather than being silently swallowed like Angular's
`catchError`-to-default pattern (which conflates network-error with genuine-not-found — an angular-bugs-policy #648
FIX-not-replicate). Not catching is both simpler and correct.

### ADR-7 — Factory placement + dead-code retirement

**Decision.** Create two factory files mirroring Angular's naming under `shared/lib/services/`:
`product-service.factory.ts` (`createProductService(storeId): AsyncProductService`) and
`product-category-service.factory.ts` (`createProductCategoryService(storeId): AsyncProductCategoryService`), both
switching on `GlobalConfig.USE_ONLINE_SERVICE`. Add one reusable `shared/lib/services/promisify-service.ts` Proxy
helper. Online services live next to offline siblings: `app/sales/lib/services/product-online-service.ts`,
`app/sales/lib/services/product-category-online-service.ts`. Online services take the api client as a defaulted
constructor param (`constructor(private client = apiClient)`) — a DI-free mock seam, no Angular-style injection.
Retire `shared/lib/services/service-factory.ts` and its `__tests__/service-factory.test.ts`.

**Rejected alternative.** Keeping `service-factory.ts` — it is DEAD: rg confirms the only references are its own test
and stale `openspec/changes/frontend-parity-audit/*` docs; zero production callers. Re-verify clean at apply time
before deletion (spec-slice3 open item #4).

## Interface-edit spec (`packages/domain/src/services/`)

- ADD `packages/domain/src/services/promisify.ts`: `Promisify<S>` mapped type + `AsyncProductService` +
  `AsyncProductCategoryService` aliases.
- MODIFY `packages/domain/src/index.ts`: export the three new type symbols. (Type-only additions — the existing sync
  `ProductService`/`ProductCategoryService`/`BaseService` are UNCHANGED.)
- **REBUILD** `pnpm -C packages/domain build` after export edits, BEFORE app `tsc --noEmit` (design-slice1 ADR-2
  gotcha: stale `dist` → "no exported member").

## Method-placement table

Base paths mirror Angular literally, including the source-literal double-slash (Angular `API_URL` ends in `/`, several
methods prepend another `/`). Version prefix `/v1/` matches the existing `auth-http-service` convention. Envelope
unwrapping is derived from Angular's response shapes (`getAllItems` list body `{ items, total }`; entity/number bodies
`BaseResponseModel.data`). Both the `/v1/` prefix + double-slash and the unwrap shape are UNVERIFIABLE without a live
API — see Risks; not a blocker (flag is `false`).

### ProductOnlineService (`app/sales/lib/services/product-online-service.ts`, `implements AsyncProductService`)

| method | signature | endpoint | unwrap / notes |
|---|---|---|---|
| getAll | `(): Promise<Product[]>` | `GET /v1/Products/all/false` | `res.data.items` |
| getById | `(id): Promise<Product\|undefined>` | `GET /v1/Products//{id}` | `res.data.data` (double-slash source-literal) |
| getByBarcode | `(barcode): Promise<Product\|undefined>` | `GET /v1/Products/byBarcode/{barcode}` | `res.data.data` |
| getMaxOrder | `(categoryId): Promise<number>` | `GET /v1/Products/maxOrderByCategoryId/{categoryId}` | `res.data.data` |
| getAvailableProductsByCategoryId | `(categoryId): Promise<Product[]>` | `GET /v1/Products/availableByCategoryId/{categoryId}` | `res.data.items` |
| update | `(product): Promise<Product>` | `PUT /v1/Products//{id}` body=product | resolves product (ADR-2) |
| delete | `(id): Promise<void>` | `DELETE /v1/Products//{id}` | — |
| getByName | `(name): Promise<Product\|undefined>` | NO endpoint | derive over getAll() (ADR-4) |
| activate | `(id): Promise<void>` | NO endpoint | read-modify-PUT via update route (ADR-5, **sign-off**) |
| deactivate | `(id): Promise<void>` | NO endpoint | read-modify-PUT via update route (ADR-5, **sign-off**) |

### ProductCategoryOnlineService (`app/sales/lib/services/product-category-online-service.ts`, `implements AsyncProductCategoryService`)

| method | signature | endpoint | unwrap / notes |
|---|---|---|---|
| getAll | `(): Promise<ProductCategory[]>` | `GET /v1/ProductCategories/all/false` | `res.data.items` |
| getById | `(id): Promise<ProductCategory\|undefined>` | `GET /v1/ProductCategories//{id}` | `res.data.data` |
| getMaxOrder | `(): Promise<number>` | `GET /v1/ProductCategories/maxOrder` | `res.data.data` |
| getAvailableProductCategories | `(): Promise<ProductCategory[]>` | `GET /v1/ProductCategories/all/false` | `res.data.items` (SAME URL as getAll — Angular `getProductCategories()` commented out, spec amb #3) |
| getProductCategoriesView | `(): Promise<ProductCategoryView[]>` | `GET /v1/ProductCategories/catalog` | `res.data.items` |
| save | `(category): Promise<ProductCategory>` | `PUT /v1/ProductCategories//{id}` if id else `POST /v1/ProductCategories/` | id-presence branch (ADR-3) |
| delete | `(id): Promise<void>` | `DELETE /v1/ProductCategories//{id}` | — |
| getByName | `(name): Promise<ProductCategory\|undefined>` | NO endpoint | derive over getAll() (ADR-4) |
| hasAnyCategory | `(): Promise<boolean>` | NO endpoint | derive: getAll().length>0 (ADR-4) |
| hasAnyAvailableCategory | `(): Promise<boolean>` | NO endpoint | derive: getAll().some(isActive) (ADR-4) |

## Test strategy (strict TDD — `pnpm test`, separate `tsc --noEmit`, `build`)

**Mock seam.** Online services take `constructor(private client = apiClient)`. Tests pass a fake client
`{ get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() }` — no live backend, no module mocking required. This
matches the existing `store-usage-tracker`/`auth-http` axios-mock pattern (`mockResolvedValue`/`mockRejectedValue`).

- **Per endpoint method:** RED-first — assert the client verb was called with the EXACT pinned URL, and that the body
  is unwrapped correctly (`mockResolvedValue({ data: { items: [...] } })` → resolves the array;
  `{ data: { data: entity } }` → resolves entity). Assert double-slash URLs literally.
- **Error propagation (ADR-6):** `mockRejectedValue(err)` → `await expect(svc.method()).rejects.toBe(err)` (no
  swallow, no default).
- **Derived reads (ADR-4):** stub `client.get(all/false)` once, assert `getByName`/`hasAny*` compute the right
  predicate over the returned set; assert only ONE fetch is issued.
- **save branch (ADR-3):** category with id → asserts PUT `/{id}`; without id → asserts POST.
- **activate/deactivate (ADR-5):** stub getById → assert a follow-up PUT with `isActive` toggled; missing id → no PUT
  (no-op). (Only if the read-modify-PUT resolution is confirmed; if NotImplemented is chosen, assert it rejects.)
- **Factory:** with `USE_ONLINE_SERVICE=false` → `createProductService(storeId)` returns a promisified offline whose
  `getAll()` resolves to the offline array; flipping the flag (module re-import, cf. the retired factory's own test
  pattern) → returns the online impl. Assert the return is thenable in both branches.
- **Conformance (compile-time oracle):** `class ProductOnlineService implements AsyncProductService` + `tsc --noEmit`
  green AFTER `pnpm -C packages/domain build`. Drift = compile error.
- **Retirement:** delete `service-factory.ts` + its test; re-run `tsc --noEmit` to confirm no dangling imports.

**Domain rebuild gotcha:** run `pnpm -C packages/domain build` after editing `packages/domain` exports, before app
`tsc --noEmit` (design-slice1 ADR-2).

## Review Workload Forecast

- **Changed lines (ballpark):** non-test — domain types ~15, `product-online-service.ts` ~90,
  `product-category-online-service.ts` ~80, `promisify-service.ts` ~15, two factory files ~24, minus retired
  `service-factory.ts` (~-16); tests — product-online ~130, category-online ~120, factory ~40, promisify ~30. Total
  ≈ **520-560 lines** (net, incl. deletions).
- **400-line budget risk: High.** The program is already `size:exception` (proposal #671), commits-only, no PR/push.
- **Chained PRs recommended: No** (delivery is commits-only). Use **three work-unit commits within the slice.**
- **Work-unit split:**
  - **WU1** — domain `Promisify` types + `promisify-service.ts` helper + two factory files + retire
    `service-factory.ts`/its test (+ factory & conformance tests). Commit first: unblocks the async types and the
    mock seam.
  - **WU2** — `ProductOnlineService` + tests.
  - **WU3** — `ProductCategoryOnlineService` + tests.
  WU2/WU3 are independent of each other; both depend only on WU1's types.
- **Decision needed before apply: YES** — ADR-5 (`activate`/`deactivate` online resolution) needs user sign-off
  before WU2 is implemented.

## Resolved autonomously vs. needs user confirmation

**Resolved autonomously:** ADR-1 (sync/async — Promisify + async factory, zero sync blast radius), ADR-2 (`update`
= generic PUT), ADR-3 (`save` id-presence branch), ADR-4 (no-endpoint reads derived over getAll), ADR-6 (errors
propagate), ADR-7 (factory placement + dead-factory retirement).

**Needs user confirmation BEFORE apply:**
1. **ADR-5 — `activate`/`deactivate` on ProductOnlineService.** Angular online has NO route. Recommended:
   read-modify-PUT via the update endpoint (functional, uses the server's real `isActive`-carrying update route).
   Alternative: `throw NotImplemented` (strict Angular-online mirror). Recommend the read-modify-PUT; confirm before
   WU2.

**Confirm before going live (NOT an apply blocker — flag is `false`):**
2. Online URL literal shape (`/v1/` prefix + source-literal double-slash) and response-envelope unwrapping
   (`res.data.items` for lists, `res.data.data` for entities/numbers) are DERIVED from Angular source and cannot be
   verified without a live API. Pinned faithfully per spec-slice3; validate against a real request before flipping
   `USE_ONLINE_SERVICE=true`.
