# Product Catalog: Show Everything, Plus a Clear-All Button — Design

- **Date:** 2026-08-12
- **Status:** Approved design, pending implementation plan
- **Scope:** Frontend only (React `web-store-pos`). No backend, DB, or API changes.

## Goal

Two independent changes, both landing on the product catalog screen
(`app/sales/routes/products.tsx`, route `/products`):

1. **The catalog shows everything.** Every category and every product, active or
   inactive. Inactive rows are visually marked. The per-category counter equals
   the number of rows listed under it.
2. **A Clear button.** To the left of "Importar productos", red, trash icon.
   It wipes the six business entities of the active store from `localStorage`,
   plus the persisted cart, after an irreversible-action confirmation. Visible
   to `OwnerAdmin` only.

**The sale screen is out of scope and does not change.** It already shows
active-and-sellable only, and this design pins that with tests so the catalog
change cannot leak into it.

## Scope rule (user-mandated, 2026-08-12)

> The scope is the catalog only. The change is made in the method the catalog
> uses. If several screens use the same method, duplicate it and fix only the
> catalog's copy. Everything else stays as it is.

Verified by grep across `apps/` and `packages/` — **neither method the catalog
uses has any other production call site**, so no duplication is required:

| Method | Production call sites |
|---|---|
| `ProductCategoryService.getProductCategoriesView()` | `products.tsx:53` only |
| `ProductService.getAvailableProductsByCategoryId()` | `products.tsx:58` only |

The sale screen calls **different** methods — `getAvailableProductCategories()`
(`sale.tsx:41`) and `getProductsToSaleByCategoryId()` (`sale.tsx:60`) — as does
the inventory egress screen (`egress.tsx:47,66`). None of them is touched.

`inventory/routes/__tests__/inventory-routes.test.tsx:84` mocks
`getAvailableProductsByCategoryId` as part of a whole-interface service stub;
no inventory production file calls it.

## What exists today

| Piece | Where | Current behaviour |
|---|---|---|
| Catalog category list | `product-category-offline-service.ts:78-88` | `getAvailableProductCategories()` → `isActive` only (`product-category-repository.ts:73-75`) |
| Catalog counter | `product-category-offline-service.ts:85` | `getAvailableToSaleProductsByCategoryId().length` → `isActive && availableToSale` |
| Catalog product list | `product-offline-service.ts:60-63` | `.filter(p => p.isActive)` |
| Import button | `products.tsx:307-314` | `variant="fab"` (blue pill), `PaperclipIcon` |
| Six business entities | `entity-migration.ts:35-42` | `products`, `product-categories`, `inventory-entries`, `orders`, `expenses`, `saleCredits` |
| Entity key shape | `storage-keys.ts:8-9` | `lizoft.store-<entity>-<storeId>` |
| Cart persistence | `cart-store.ts:136` | zustand `persist`, key `lizoft-cart`, with a `clear()` action at `:111` |
| Confirmation dialog | `blocking-alert.ts` `confirmDialog` | Already used by delete-product at `products.tsx:156-164` |
| Owner check | `authorization-service.ts:8` | `isOwnerAdmin(user)` |

Three separate filters produce today's inconsistency: the counter counts
`isActive && availableToSale` while the list under it shows `isActive`, so a
category with two sellable and three merely-active products already reads "2"
above five rows. Opening the catalog to inactive rows would widen that gap, so
the counter is part of this change, not a nicety.

## Decisions

### D1 — Modify the two catalog-exclusive methods in place. No new methods, no duplicates.

Both methods are consumed by the catalog alone, so changing their bodies cannot
reach another screen. Adding parallel `getAll*` variants would leave the
originals dead and give a future reader two plausible methods to pick from.

**`ProductCategoryOfflineService.getProductCategoriesView()`**
- source list: `getAvailableProductCategories()` → `getProductCategories()`
  (all, already sorted ascending by `order`, `product-category-repository.ts:68-70`)
- `productsCount`: `getAvailableToSaleProductsByCategoryId(id).length` →
  `getProductsByCategoryId(id).length`

**`ProductOfflineService.getAvailableProductsByCategoryId()`**
- drop the `.filter(p => p.isActive)`; return
  `productRepository.getProductsByCategoryId(categoryId)` as-is (already sorted
  by `order`, `product-repository.ts:107-112`).

**No repository method changes.** `getAvailableToSaleProductsByCategoryId`
(`product-repository.ts:118`) and `getAvailableProductCategories`
(`product-category-repository.ts:73`) are shared with the sale path and stay
exactly as they are — only which of them the catalog's service calls changes.

### D2 — The counter is derived from the same query as the list, not a parallel one.

`getProductCategoriesView().productsCount` and the catalog's product list now
both resolve to `ProductRepository.getProductsByCategoryId(categoryId)`. Same
repository method, same predicate, so "the number matches the rows" is a
property of the code rather than a rule someone has to remember.

### D3 — The method names stay. The divergence is documented in place.

`getAvailableProductsByCategoryId` returning unfiltered products makes the name
inaccurate. Renaming it would mean touching `packages/domain`'s
`ProductService` interface and `ProductOnlineService` — i.e. leaving the
catalog, which the scope rule above forbids.

Both methods get a comment marking a **deliberate divergence** from the Angular
1:1 port, in the same style the codebase already uses for the CSV-import
divergence (`products.tsx:214-218`), naming the catalog as the sole consumer and
this document as the reason.

**Accepted, documented gap:** `ProductOnlineService`'s counterparts still filter
server-side (`GET /v1/Products/availableByCategoryId`,
`GET /v1/ProductCategories/catalog`). `GlobalConfig.USE_ONLINE_SERVICE` is a
hardcoded `false` (`global-config.ts:2`) and the online services are
reference-only, never validated live (`product-service.factory.ts:9-13`), so no
running code path is affected. Flipping that flag would need a backend change
outside this scope.

### D4 — Inactive rows are marked, not merely dimmed.

Both an inactive **category** header and an inactive **product** row render at
reduced opacity **and** carry a visible "Inactivo" label. Opacity alone is
invisible to a screen reader and unreliable at low brightness; the label is the
part that actually answers "why doesn't this show up in Ventas?".

`ProductCategoryView` already carries `isActive`
(`product-category-offline-service.ts:84`) and `Product` carries `isActive`, so
no shape changes are needed — the flags reach the components already.

Placement: the category label sits in the header row of `products.tsx:327-357`,
next to the name; the product label sits in `ProductRow`
(`category-product-list.tsx:62`), which already receives the whole `product`.

### D5 — Clear-all lives behind one function, sourced from the existing entity list.

New `clearStoreData(storeId: string): void` in
`app/shared/lib/storage/store-data-reset.ts`.

The six entity names already exist as `MIGRATED_ENTITY_NAMES` in
`entity-migration.ts:35-42`. They move to `storage-keys.ts` as an exported
`BUSINESS_ENTITY_NAMES`, and both `entity-migration.ts` and the new function
import it. Copying the list instead would mean a seventh entity gets added in
one place and not the other, and the resulting bug reads as "I clicked Clear and
it did not clear everything" — silent, and only visible much later.

`clearStoreData` removes, for the given `storeId`:

- `lizoft.store-products-<storeId>`
- `lizoft.store-product-categories-<storeId>`
- `lizoft.store-inventory-entries-<storeId>`
- `lizoft.store-orders-<storeId>`
- `lizoft.store-expenses-<storeId>`
- `lizoft.store-saleCredits-<storeId>`

It does **not** touch `token`, `AUTH_MODEL`, `currentUser`, `language`, the
offline roster, or the device-wrapped DEK. The session survives; the device
keeps offline access.

Per-key `try/catch` isolation, mirroring `entity-migration.ts:77-88`, so one
failing key cannot abort the remaining five.

### D6 — The cart is cleared through the store, not by deleting its key.

The cart persists to `localStorage` under `lizoft-cart` (`cart-store.ts:136`)
and holds product snapshots. Left behind, it would point at products that no
longer exist and could still be checked out into a new order.

The button calls the cart store's own `clear()` action (`cart-store.ts:111`),
read through the usual selector — `useCartStore((s) => s.clear)` — not
`localStorage.removeItem('lizoft-cart')`. `removeItem` would leave the in-memory
zustand state populated in the current tab, so the cart would look full until a
reload and then re-persist itself. `clear()` resets the in-memory state and the
persisted copy together.

`clear()` is invoked from the catalog page, outside `clearStoreData`, which stays
a pure `localStorage`-entity function.

### D7 — The button is a `fab-danger` variant, not a colour override.

`ButtonVariant` (`button.tsx:3`) has `danger` (red, square) and `fab` (blue,
pill). The new button must be both. A fourth option — `variant="fab"` with an
inline `className="bg-danger"` override — puts a one-off colour in a page,
where the next red pill button copies it instead of the system.

Added: `'fab-danger'` to the union, and
`rounded-full px-5 py-3 shadow-lg bg-danger text-white hover:opacity-90` to
`VARIANT_CLASSES`. That composes the existing `fab` geometry with the existing
`danger` colour; no new token.

Markup, inside the existing flex row at `products.tsx:307`, which becomes
`justify-end gap-3` with Clear first:

```tsx
<Button variant="fab-danger" onClick={handleClearData} data-testid="clear-data-button">
  <TrashIcon />
  Limpiar
</Button>
```

`TrashIcon` already exists (`icons.tsx:121`).

### D8 — OwnerAdmin only.

The button renders only when `isOwnerAdmin(user)` is true
(`authorization-service.ts:8`), read from `useAuthStore`. A non-owner does not
see it. This is a render guard on a local-only destructive action, not an
authorization boundary — there is no server call to protect.

`isOwnerAdmin` is consumed as-is. Open finding H-16 (two bugs that cancel each
other around this helper) is **not** touched by this change.

### D9 — Confirmation copy and post-clear behaviour.

`confirmDialog` (`blocking-alert.ts`), same call shape as delete-product at
`products.tsx:156-164`:

- title: `¿Está seguro que desea eliminar todos los datos?`
- message: `Este proceso no se podrá revertir.`
- confirm: `GENERAL.YES` · cancel: `GENERAL.NO`

Cancel does nothing at all — no cart clear, no key removal. Confirm runs
`clearStoreData(storeId)`, then `useCartStore.getState().clear()`, then
`loadData()` so the catalog repaints empty in place, then a success toast via
`showToastSuccess` (already imported at `products.tsx:12`). No page reload, no
navigation.

Copy stays hardcoded Spanish, matching the CSV-import strings already in this
file (`products.tsx:184`, `:269`). Introducing i18n keys is out of scope.

## Components and boundaries

| Unit | Responsibility | Depends on |
|---|---|---|
| `storage-keys.ts` | Key shapes **and** the canonical `BUSINESS_ENTITY_NAMES` list | `global-config` |
| `store-data-reset.ts` (new) | Remove one store's six entity keys. Pure, sync, no UI, no cart | `storage-keys` |
| `entity-migration.ts` | Unchanged behaviour; now imports the shared entity list | `storage-keys` |
| `ProductCategoryOfflineService` | Catalog view projection: all categories, total counts | `ProductCategoryRepository`, `ProductRepository` |
| `ProductOfflineService` | Catalog product list: all products of a category | `ProductRepository` |
| `products.tsx` | Screen orchestration: owner check, confirm, reset + cart clear, reload, toast | services, `store-data-reset`, `cart-store`, `authorization-service` |
| `CategoryProductList` | Renders a product row, inactive ones marked | `Product` |
| `Button` | Adds the `fab-danger` variant | — |

`store-data-reset.ts` knows nothing about React, the cart, or the catalog, so it
is testable as a plain function against a `localStorage` double.

## Error handling

- **Per-key failure during clear** — swallowed per key (D5). A quota or storage
  error on one entity leaves the other five removed. Not surfaced: the user
  asked for a wipe, and a partial wipe followed by a reload shows what remains.
- **Cancelled confirmation** — no side effects whatsoever.
- **Empty store** — clearing with nothing stored is a no-op that still shows the
  success toast; absent keys are skipped, never created.
- **Catalog load failures** — unchanged. Both services resolve
  `success(...)` and never reject; `?? []` fallbacks at `products.tsx:54,62`
  stay as they are.

## Testing

Unit tests (vitest, `npx turbo run test --force`):

- `product-category-offline-service.test.ts` — the view returns **inactive**
  categories too; `productsCount` equals the category's total product count,
  including inactive and non-sellable ones. **Two existing CAT-12 tests must be
  updated: `:157`** (asserts the old `isActive && availableToSale` count) **and
  `:181`** (asserts inactive categories are excluded entirely). Both are unit
  tests, not E2E.
- `product-offline-service.test.ts` — `getAvailableProductsByCategoryId` returns
  inactive products. **Existing PROD-11 at `:84-103` asserts isActive-only
  filtering and must be updated** — unit test, not E2E.
- `products.test.tsx` — inactive category and product render with the "Inactivo"
  label; the counter equals the number of rows listed; Clear is hidden for a
  non-owner; confirm-cancel wipes nothing; confirm-accept calls
  `clearStoreData` and `cart.clear()` and repaints empty. **The service mocks at
  `:45-46` and `:99-108` re-implement the old filters inside the test file and
  must be updated**, along with the stale comment at `:281-282`; the `'1'`
  assertion itself still holds. Unit test, not E2E.
- `store-data-reset.test.ts` (new) — removes exactly the six keys for the given
  store; leaves `token` / `AUTH_MODEL` / `currentUser` / another store's keys
  untouched; one throwing key does not stop the rest.
- **Regression pin for the sale screen.** The service-level filters are already
  pinned — `product-offline-service.test.ts:192` (PROD-17) and
  `product-category-offline-service.test.ts:121` (CAT-10) — and this change does
  not touch either method. What is **not** pinned is that `sale.tsx` keeps
  *calling* them: swapping it to the catalog's now-unfiltered method would leave
  PROD-17 and CAT-10 green while Ventas started showing inactive products. So
  `sale.test.tsx` gains an explicit assertion that both methods were called.
  That is the guard that makes "catalog only" enforceable rather than a promise.

**E2E: none written, none modified.** The existing Playwright suite
(`frontend-react/e2e/`) and its support files are untouchable without explicit
authorization (project CLAUDE.md). If one of them fails against this change,
implementation stops and reports it.

## Out of scope

- The sale screen and the inventory egress screen — behaviour unchanged.
- `ProductOnlineService` / `ProductCategoryOnlineService` and their endpoints.
- Renaming any method or changing `packages/domain` interfaces.
- Clearing data for stores other than the active one, or clearing auth/roster/DEK.
- i18n keys for the new strings.
- Backend, database, and API.

## Risks

| Risk | Mitigation |
|---|---|
| Method names no longer describe behaviour (`getAvailable…` returns all) | In-place divergence comments naming the sole consumer and this document (D3) |
| Catalog and online services now disagree semantically | `USE_ONLINE_SERVICE` is hardcoded `false`; online path is reference-only and unreachable (D3) |
| A future entity is added to storage and not to the wipe | Single canonical `BUSINESS_ENTITY_NAMES` consumed by both call sites (D5) |
| Someone wipes a store by accident | OwnerAdmin-only render guard plus an explicit irreversible-action confirmation (D8, D9) |
| Three existing unit tests encode the old filters and will go red | Expected and listed above; all three are vitest unit tests, not E2E |
