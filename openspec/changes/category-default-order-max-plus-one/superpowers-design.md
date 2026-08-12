# New Category Defaults to Max Order + 1 — Design

- **Date:** 2026-08-12
- **Status:** Approved design, pending implementation plan
- **Scope:** Frontend only (React `web-store-pos`). No backend, DB, or API changes.

## Goal

Two changes that land together, both on the product catalog screen
(`app/sales/routes/products.tsx`, route `/products`):

1. **Creating a category prefills `Orden` with `max + 1`**, so a new category
   always appears last in the catalog instead of first.
2. **Rename `ProductService.getMaxOrder(categoryId)` to
   `getMaxOrderByCategoryId(categoryId)`**, so the two distinct max-order
   operations stop sharing one name.

## Part 1 — Category default order

### The defect

`edit-product-category-modal.tsx:19` hardcodes the create-mode default:

```ts
order: category?.order.toString() ?? '1',
```

That `'1'` is not inherited from Angular. Angular's form declares
`order: [{ value: "", disabled: false }, ...]`
(`edit-product-category-modal.component.ts:91`) and patches it asynchronously
on open (lines 37-39):

```ts
this.categoryService.getMaxOrder().subscribe(response => {
  if (response && response.succeeded)
    this.formGroup.patchValue({order: response.data + 1});
});
```

So this is a **parity gap**, not a new feature. React ported
`ProductCategoryService.getMaxOrder()` to both the offline
(`product-category-offline-service.ts:111`) and online
(`product-category-online-service.ts:66`) implementations, then never called it
from any production file.

### Why the hardcoded `1` is worse than it looks

Creating a category does not simply append. `addProductCategoryData` calls
`updateCategoriesOrder`, which shifts every sibling at or after the insertion
point (`product-category-repository.ts:133-137`):

```ts
private updateCategoriesOrder(categories: Map<string, ProductCategory>, order: number): void {
  categories.forEach((category) => {
    if (category.order >= order) category.order = category.order + 1;
  });
}
```

With the default at `1`, every new category inserts at position 1 and rewrites
the `order` of **every existing category** in the store. The visible symptom is
that the new category appears first; the invisible cost is a full reorder and
rewrite of the catalog on each create.

With `max + 1`, no category satisfies `order >= max + 1`, so the loop is a
no-op. The new category lands last and nothing else is touched.

`max + 1` is also already the established value for this collection: the
repository's private `getNextOrder()` (`product-category-repository.ts:121-125`)
computes exactly `Math.max(0, ...orders) + 1`, and the CSV import path
(`addProductCategoryByName`) uses it. **The CSV path already appends at the end.
The manual modal is the only creation path that does not.** This change aligns
them.

### The change

Mirror the pattern the sibling product flow already uses in the same route file
(`handleAddProduct`, `products.tsx:94-96`): resolve the value in the page, pass
it into the modal as a prop.

**`app/sales/routes/products.tsx`**

- The `Modal` union member gains the prefilled value:
  `{ type: 'category'; category?: ProductCategory; defaultOrder: number }`
- New `handleAddCategory()`:
  ```ts
  const maxOrderResult = await categoryService.getMaxOrder();
  setModal({ type: 'category', defaultOrder: (maxOrderResult.data ?? 0) + 1 });
  ```
- The add-category fab (`products.tsx:377`) calls `handleAddCategory()` instead
  of `setModal({ type: 'category' })` directly.
- The edit-category entry point (`products.tsx:449`) also supplies
  `defaultOrder` to satisfy the type; the value is unused in edit mode, which
  reads the category's own `order`.

**`app/sales/components/edit-product-category-modal.tsx`**

- New required prop `defaultOrder: number`.
- Line 19 becomes:
  ```ts
  order: category?.order.toString() ?? defaultOrder.toString(),
  ```
- Edit mode is unchanged: it still shows the existing category's `order`.

### Prefetch before open, not patch after open

React resolves `getMaxOrder()` **before** opening the modal; Angular opens the
modal and patches the field when the response arrives. The two differ on
failure: Angular leaves the modal open with an empty field, React would not open
it at all.

We keep the React shape, because `handleAddProduct` in this same file already
works that way and two sibling modals with different failure behavior is worse
than either behavior on its own.

In practice the branch is reachable, and not through the network path the name
`getMaxOrder` suggests. The offline `getMaxOrder()` only *resolves* at its
tail; its body runs `categoryRepository.getProductCategories()` first, which
reaches the private `getProductCategoriesFromLocalStorage()`
(`product-category-repository.ts:237-249`).

The escaping throw is **not** the decrypt. That method wraps `decryptEntity(...)`
in a `try/catch` that swallows `MissingDataKeyError` and falls through to
auto-init — and auto-init writes: `setProductCategoriesLocalStorage(new Map())`
(line 247) calls `encryptEntity(...)` (line 229), which throws
`MissingDataKeyError` (`entity-crypto.ts:77`) when there is no data-encryption
key in memory and encryption is provisioned (or a device wrap exists). That
throw is uncaught. Because `handleAddCategory` is `async`, it becomes a rejected
promise that `onClick` drops silently — the FAB would become a no-op.
`categoryService` is also reconstructed on every render (`products.tsx:54`), so
there is no warm cache to route around it: the read-then-auto-init path runs on
every click.

That said, this is not a reason to add a `try/catch` here. The failure is
route-wide and pre-existing: `loadData()` in the mount effect
(`products.tsx:62-80`) walks the same storage path with no catch, so with no
DEK the page is already empty before the user can reach the FAB, and
`handleAddProduct` has the identical gap. Catching it in one handler buys
nothing while the other two remain exposed; the right seam is a single
route-level error boundary, left as a separate follow-up.

(Note that the file is *not* uniformly catch-free — `handleClearData`,
`products.tsx:328-350`, does use `try/catch`. The reason to leave this handler
bare is the route-wide scope of the failure, not a house style.)

### Behavior on an empty store is unchanged

`Math.max(...[], 0)` is `0`, so `0 + 1 = 1` — the same value the modal shows
today when a store has no categories. A brand-new store sees no difference.

The max is taken over **all** categories, active and inactive
(`getProductCategories()`, `product-category-repository.ts:68`), so a
deactivated category cannot cause an order collision. The repository is
store-scoped: it caches against `getCurrentStorageKey()` and reloads when the
key changes (`product-category-repository.ts:36-46`).

## Part 2 — Rename `getMaxOrder` on the product service

### Why the name is wrong

The backend declares both operations, with different names, on one interface
(`IProductRepository.cs:9,13`):

```csharp
Task<int> GetMaxOrderAsync();                              // global max across all products
Task<int> GetMaxOrderByCategoryIdAsync(Guid categoryId);   // max within one category
```

React's `ProductService.getMaxOrder(categoryId)` implements the **second** one —
its online branch calls `GET /v1/Products/maxOrderByCategoryId/:id`
(`product-online-service.ts:94`) — while carrying the **first** one's name. The
name is not merely vague; it is the name of a different operation that also
exists.

The collision already forced a defensive comment into the neighbouring service
(`product-category-offline-service.ts:107-109`):

> GLOBAL max across ALL categories (store-wide scope), never fails. Distinct
> from `ProductService.getMaxOrder(categoryId)`, which is per-category. Do not
> unify.

When a name needs three lines of prose to keep it from being confused with
another, the name is the defect.

`getMaxOrderByCategoryId` is not invented here — it is the backend's own method
name and the shape of its route segment.

### Deliberate divergence from Angular

Angular calls it `getMaxOrder(categoryId)`
(`product.service.ts:48`, `product-offline.service.ts:159`,
`product-online.service.ts:66`). This rename **diverges from Angular on
purpose**, authorized by the user on 2026-08-12. The migration is closed; the
Angular source is no longer the tiebreaker for naming.

### Scope

Pure rename. No signature, semantics, envelope, or behavior change: still
per-category, still `Math.max(...products.map(p => p.order), 0)`, still the same
endpoint.

| Production | Test |
|---|---|
| `packages/domain/src/services/product-service.ts` | `packages/domain/src/services/__tests__/product-service.test.ts` |
| `app/sales/lib/services/product-offline-service.ts` | `.../__tests__/product-offline-service.test.ts` |
| `app/sales/lib/services/product-online-service.ts` | `.../__tests__/product-online-service.test.ts` |
| `app/sales/routes/products.tsx` | `app/sales/routes/__tests__/products.test.tsx` |

`rg "getMaxOrder" e2e` returns nothing — **no E2E test or E2E support file
touches this name**, so no protected file is involved. The four test files above
are unit tests.

`ProductCategoryService.getMaxOrder()` keeps its name. On the category service,
with no arguments, it is already unambiguous and already matches the backend's
`ProductCategoryRepository.GetMaxOrderAsync()`.

## Out of scope

- **Product ordering behavior.** Products keep resolving their max per category
  and prefilling `max + 1`. Only the method's name changes.
- **`ProductRepository.cs:52-57`** returns `max + 1` from the repository while
  the frontend adds another `+ 1`, which would yield `max + 2` online. The path
  is dead under `USE_ONLINE_SERVICE: false`. Recorded, not fixed.
- **The sibling-shift semantics** of `updateCategoriesOrder`. `max + 1` makes it
  a no-op for new categories; the shift itself stays as is for explicit inserts.
- Backend, database, and API contracts.

## Testing

TDD: every test below is written failing first, against the real behavior it
pins. Unit tests only — no new E2E, no existing E2E touched.

**Offline services** — the primary coverage, per the user's instruction:

- `product-category-offline-service.test.ts`
  - `getMaxOrder()` resolves `0` for a store with no categories.
  - `getMaxOrder()` resolves the max `order` across categories, **including
    inactive ones**.
  - `getMaxOrder()` reads category `order`, not any product's order: a category
    holding products with higher `order` values does not raise the result.
- `product-offline-service.test.ts`
  - Existing `PROD-10` cases carried over verbatim under the new name
    `getMaxOrderByCategoryId`, proving the rename changed no behavior.

**Route** — `products.test.tsx`, mirroring the two product tests at lines
391 and 412:

- Opening the create-category modal awaits `categoryService.getMaxOrder()` and
  renders `max + 1` in `category-order-input` (mock `data: 4` → input shows `5`).
- Submitting without touching the field calls `createProductCategory` with
  `order = max + 1` (mock `data: 0` → `order = 1`). This is the test that
  matters: it proves the value reaches the service, not just the screen.
- Editing an existing category still shows that category's own `order`,
  unaffected by `getMaxOrder()`.

**Repository** — `lib/repositories/__tests__/product-category-repository.test.ts`:

- Creating a category at `max + 1` leaves every existing category's `order`
  untouched (the `updateCategoriesOrder` no-op).

**Modal** — `edit-product-category-modal.test.tsx` updated for the new required
prop. Existing assertions unchanged.

Gate: `npx turbo run test --force` in `frontend-react`. Playwright and the .NET
suites are run by the user, not by the agent.
