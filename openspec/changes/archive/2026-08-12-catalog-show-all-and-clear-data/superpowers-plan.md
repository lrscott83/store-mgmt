# Catalog Shows Everything + Clear-All Button — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the product catalog list every category and product (inactive ones visually marked, counter matching the rows), and add an OwnerAdmin-only red "Limpiar" button that wipes the active store's six business entities plus the cart after an irreversible-action confirmation.

**Architecture:** Both catalog data methods (`getProductCategoriesView`, `getAvailableProductsByCategoryId`) have exactly one production call site — the catalog — so they are modified in place, with no duplicates and no reach into the sale screen. The wipe lives in one pure function, `clearStoreData(storeId)`, fed by a single canonical entity-name list shared with the existing encryption migration. The cart is cleared through its own store action, not by deleting its key.

**Tech Stack:** React 19 + react-router, TypeScript, zustand (with `persist`), react-intl, Tailwind, vitest + @testing-library/react, pnpm + turbo.

## Global Constraints

- **Scope is the catalog only.** Do not change the sale screen (`sales/routes/sale.tsx`) or the inventory egress screen (`inventory/routes/egress.tsx`), or any method they call. If a method turns out to be shared, duplicate it and change only the catalog's copy.
- **E2E tests are untouchable.** Never modify, delete, rename, skip, or weaken anything under `frontend-react/e2e/` — tests or support files. If an E2E test fails against this change, STOP, name it, explain, and ask. Adding new E2E tests is allowed; this plan adds none.
- **Do not run Playwright or `dotnet`.** Vitest only.
- **Do not touch repository methods shared with the sale path:** `ProductRepository.getAvailableToSaleProductsByCategoryId` and `ProductCategoryRepository.getAvailableProductCategories` stay byte-identical.
- **Do not change `packages/domain` interfaces**, and do not rename any service method.
- **Do not touch the online services** (`product-online-service.ts`, `product-category-online-service.ts`) or their tests.
- **Commit messages:** conventional commits. No `Co-Authored-By` and no AI attribution lines.
- **New user-facing copy is hardcoded Spanish** (no i18n keys), matching the CSV-import strings already in `products.tsx:184,269`. Exact strings, verbatim:
  - Button label: `Limpiar`
  - Confirm title: `¿Está seguro que desea eliminar todos los datos?`
  - Confirm message: `Este proceso no se podrá revertir.`
  - Success toast: `Todos los datos fueron eliminados.`
  - Inactive marker: `Inactivo`
- **Reference document:** `openspec/changes/catalog-show-all-and-clear-data/superpowers-design.md`.

## Commands

All paths below are relative to the repo root `/home/coder/sources/appollo/store-mgmt`.

Single test file (fast loop) — run from `frontend-react/apps/web-store-pos`:

```bash
cd frontend-react/apps/web-store-pos && npx vitest run app/path/to/file.test.ts
```

Full gate — run from `frontend-react`. `--force` is mandatory: without it turbo replays a cached run and the output is not evidence.

```bash
cd frontend-react && npx turbo run test --force
```

Note: `pnpm typecheck` and `pnpm lint` do **not** cover `frontend-react/e2e/` — that directory is not a workspace package. Never cite them as proof that an e2e file compiles.

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `frontend-react/apps/web-store-pos/app/shared/lib/storage/storage-keys.ts` | Modify | Key shapes **and** the canonical `BUSINESS_ENTITY_NAMES` list |
| `frontend-react/apps/web-store-pos/app/shared/lib/storage/store-data-reset.ts` | Create | `clearStoreData(storeId)` — remove one store's six entity keys. Pure, sync, no React, no cart |
| `frontend-react/apps/web-store-pos/app/shared/lib/storage/entity-migration.ts` | Modify | Same behaviour; imports the shared list instead of owning a private copy |
| `frontend-react/apps/web-store-pos/app/shared/components/ui/button.tsx` | Modify | Adds the `fab-danger` variant |
| `frontend-react/apps/web-store-pos/app/sales/lib/services/product-category-offline-service.ts` | Modify | Catalog view projection: all categories, total product counts |
| `frontend-react/apps/web-store-pos/app/sales/lib/services/product-offline-service.ts` | Modify | Catalog product list: all products of a category |
| `frontend-react/apps/web-store-pos/app/sales/components/inactive-badge.tsx` | Create | The "Inactivo" marker, one definition for both the category header and the product row |
| `frontend-react/apps/web-store-pos/app/sales/components/category-product-list.tsx` | Modify | Product row marks inactive products |
| `frontend-react/apps/web-store-pos/app/sales/routes/products.tsx` | Modify | Category header marks inactive categories; Clear button, owner gate, confirm, wipe, cart clear, reload, toast |

Tests, in the same order:

| Test file | Status |
|---|---|
| `app/sales/routes/__tests__/sale.test.tsx` | Modify — add the call-site pin (Task 1) |
| `app/shared/lib/storage/__tests__/store-data-reset.test.ts` | Create (Task 2) |
| `app/shared/components/ui/__tests__/button.test.tsx` | Modify (Task 3) |
| `app/sales/lib/services/__tests__/product-category-offline-service.test.ts` | Modify (Task 4) |
| `app/sales/lib/services/__tests__/product-offline-service.test.ts` | Modify (Task 4) |
| `app/sales/components/__tests__/category-product-list.test.tsx` | Modify (Task 5) |
| `app/sales/routes/__tests__/products.test.tsx` | Modify (Tasks 5 and 6) |

---

### Task 1: Pin the sale screen's call sites

The service-level filters are already pinned by PROD-17 (`product-offline-service.test.ts:192`) and CAT-10 (`product-category-offline-service.test.ts:121`), and this change does not touch either method. What is **not** pinned is that `sale.tsx` keeps *calling* them: if someone later swapped it to the catalog's now-unfiltered method, both of those tests would stay green while Ventas quietly started showing inactive products.

This task lands **before** any production change, so the guard exists before the thing it guards against.

**Files:**
- Test: `frontend-react/apps/web-store-pos/app/sales/routes/__tests__/sale.test.tsx:26-47,105-111`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing consumed by later tasks. Pure guard.

- [ ] **Step 1: Hoist the two sale-path service mocks into inspectable spies**

The current mocks build a fresh `vi.fn()` inside `mockImplementation`, so every service instantiation creates a new spy and no test can inspect it. Replace lines 26-47 of `sale.test.tsx` with:

```tsx
const saleServiceSpies = vi.hoisted(() => ({
  getProductsToSaleByCategoryId: vi.fn(),
  getAvailableProductCategories: vi.fn(),
}));

vi.mock('~/sales/lib/services/product-offline-service', () => ({
  ProductOfflineService: vi.fn().mockImplementation(() => ({
    // Angular parity: getProductsToSaleByCategoryId -> categoryId + isActive + availableToSale,
    // sorted by order. Implementation is set in beforeEach so the spy stays inspectable.
    getProductsToSaleByCategoryId: saleServiceSpies.getProductsToSaleByCategoryId,
  })),
}));

vi.mock('~/sales/lib/services/product-category-offline-service', () => ({
  ProductCategoryOfflineService: vi.fn().mockImplementation(() => ({
    // Angular parity: getAvailableProductCategories -> active-only, sorted by order.
    getAvailableProductCategories: saleServiceSpies.getAvailableProductCategories,
  })),
}));
```

- [ ] **Step 2: Restore the mock behaviour in `beforeEach`**

The implementations must be re-registered per test because they close over `mockProducts` / `mockCategories`, which the existing `beforeEach` resets. Replace the `beforeEach` body at lines 105-111 with:

```tsx
  beforeEach(() => {
    mockCategories = [];
    mockProducts = [];
    addItemMock.mockClear();
    mockUser.storeModuleIds = [];
    localStorage.clear();

    saleServiceSpies.getProductsToSaleByCategoryId.mockReset();
    saleServiceSpies.getProductsToSaleByCategoryId.mockImplementation(async (categoryId: string) =>
      bm(
        mockProducts
          .filter((p) => p.categoryId === categoryId && p.isActive && p.availableToSale)
          .sort((a, b) => a.order - b.order),
      ),
    );
    saleServiceSpies.getAvailableProductCategories.mockReset();
    saleServiceSpies.getAvailableProductCategories.mockImplementation(async () =>
      bm(mockCategories.filter((c) => c.isActive).sort((a, b) => a.order - b.order)),
    );
  });
```

- [ ] **Step 3: Run the existing sale tests to prove the mock refactor changed nothing**

```bash
cd frontend-react/apps/web-store-pos && npx vitest run app/sales/routes/__tests__/sale.test.tsx
```

Expected: PASS, same number of tests as before the refactor. If anything fails here, the refactor is wrong — fix it before adding the new test.

- [ ] **Step 4: Add the call-site pin**

Append this test inside the existing `describe('SalePage — Angular parity (sale.component.html)')` block:

```tsx
  // CATALOG-SCOPE PIN (catalog-show-all-and-clear-data): the catalog's
  // getProductCategoriesView / getAvailableProductsByCategoryId now return
  // inactive rows too. This screen must keep reading through the
  // active-and-sellable methods. Swapping it to a catalog method would leave
  // PROD-17 and CAT-10 green while Ventas started listing inactive products.
  it('reads its category and product lists through the active-and-sellable service methods', async () => {
    mockCategories = [makeCategory({ id: 'c1', name: 'Bebidas' })];
    mockProducts = [makeProduct({ id: 'p1', name: 'Coca Cola', categoryId: 'c1' })];

    render(
      <Wrapper>
        <SalePage />
      </Wrapper>,
    );

    expect(await screen.findByText('Coca Cola')).toBeInTheDocument();
    expect(saleServiceSpies.getAvailableProductCategories).toHaveBeenCalled();
    expect(saleServiceSpies.getProductsToSaleByCategoryId).toHaveBeenCalledWith('c1');
  });
```

- [ ] **Step 5: Run the file and verify the new test passes**

```bash
cd frontend-react/apps/web-store-pos && npx vitest run app/sales/routes/__tests__/sale.test.tsx
```

Expected: PASS, one more test than in Step 3.

- [ ] **Step 6: Commit**

```bash
git add frontend-react/apps/web-store-pos/app/sales/routes/__tests__/sale.test.tsx
git commit -m "test(sales): pin the sale screen to its active-and-sellable service methods"
```

---

### Task 2: `clearStoreData` and one canonical entity list

`entity-migration.ts` already owns the authoritative list of the six business entities. Copying it into the wipe would mean a seventh entity gets added in one place and not the other, and the resulting bug reads as "I clicked Limpiar and it did not clear everything" — silent, and visible much later. The list moves to `storage-keys.ts`; both call sites import it.

**Files:**
- Modify: `frontend-react/apps/web-store-pos/app/shared/lib/storage/storage-keys.ts`
- Modify: `frontend-react/apps/web-store-pos/app/shared/lib/storage/entity-migration.ts:26,34-42,75`
- Create: `frontend-react/apps/web-store-pos/app/shared/lib/storage/store-data-reset.ts`
- Test: `frontend-react/apps/web-store-pos/app/shared/lib/storage/__tests__/store-data-reset.test.ts`

**Interfaces:**
- Consumes: `StorageKeys.entityKey(entity: string, storeId: string): string` (existing, `storage-keys.ts:8-9`).
- Produces:
  - `BUSINESS_ENTITY_NAMES: readonly ['products','product-categories','inventory-entries','orders','expenses','saleCredits']` exported from `~/shared/lib/storage/storage-keys`.
  - `clearStoreData(storeId: string): void` exported from `~/shared/lib/storage/store-data-reset`. Task 6 calls it.

- [ ] **Step 1: Write the failing test**

Create `frontend-react/apps/web-store-pos/app/shared/lib/storage/__tests__/store-data-reset.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStoreData } from '../store-data-reset';
import { StorageKeys, BUSINESS_ENTITY_NAMES } from '../storage-keys';

const STORE_A = 's1';
const STORE_B = 's2';

function seedStore(storeId: string): void {
  for (const entity of BUSINESS_ENTITY_NAMES) {
    localStorage.setItem(StorageKeys.entityKey(entity, storeId), `["${entity}"]`);
  }
}

describe('clearStoreData', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('covers exactly the six business entities', () => {
    expect([...BUSINESS_ENTITY_NAMES]).toEqual([
      'products',
      'product-categories',
      'inventory-entries',
      'orders',
      'expenses',
      'saleCredits',
    ]);
  });

  it('removes every business-entity key of the given store', () => {
    seedStore(STORE_A);

    clearStoreData(STORE_A);

    for (const entity of BUSINESS_ENTITY_NAMES) {
      expect(localStorage.getItem(StorageKeys.entityKey(entity, STORE_A))).toBeNull();
    }
  });

  it('leaves another store’s data untouched', () => {
    seedStore(STORE_A);
    seedStore(STORE_B);

    clearStoreData(STORE_A);

    for (const entity of BUSINESS_ENTITY_NAMES) {
      expect(localStorage.getItem(StorageKeys.entityKey(entity, STORE_B))).not.toBeNull();
    }
  });

  it('leaves session and device keys untouched', () => {
    seedStore(STORE_A);
    localStorage.setItem(StorageKeys.TOKEN, 'tok');
    localStorage.setItem(StorageKeys.AUTH_MODEL, '{"authToken":"tok"}');
    localStorage.setItem(StorageKeys.CURRENT_USER, '{"login":"jdoe"}');
    localStorage.setItem(StorageKeys.LANGUAGE, 'es');

    clearStoreData(STORE_A);

    expect(localStorage.getItem(StorageKeys.TOKEN)).toBe('tok');
    expect(localStorage.getItem(StorageKeys.AUTH_MODEL)).toBe('{"authToken":"tok"}');
    expect(localStorage.getItem(StorageKeys.CURRENT_USER)).toBe('{"login":"jdoe"}');
    expect(localStorage.getItem(StorageKeys.LANGUAGE)).toBe('es');
  });

  it('does not create keys for a store that has nothing stored', () => {
    clearStoreData(STORE_A);

    for (const entity of BUSINESS_ENTITY_NAMES) {
      expect(localStorage.getItem(StorageKeys.entityKey(entity, STORE_A))).toBeNull();
    }
    expect(localStorage.length).toBe(0);
  });

  it('keeps removing the remaining keys when one removal throws', () => {
    seedStore(STORE_A);
    const failingKey = StorageKeys.entityKey('inventory-entries', STORE_A);
    const realRemoveItem = Storage.prototype.removeItem;
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (
      this: Storage,
      key: string,
    ) {
      if (key === failingKey) throw new Error('quota');
      realRemoveItem.call(this, key);
    });

    expect(() => clearStoreData(STORE_A)).not.toThrow();

    vi.restoreAllMocks();
    expect(localStorage.getItem(failingKey)).not.toBeNull();
    expect(localStorage.getItem(StorageKeys.entityKey('orders', STORE_A))).toBeNull();
    expect(localStorage.getItem(StorageKeys.entityKey('saleCredits', STORE_A))).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend-react/apps/web-store-pos && npx vitest run app/shared/lib/storage/__tests__/store-data-reset.test.ts
```

Expected: FAIL — cannot resolve `../store-data-reset`, and `BUSINESS_ENTITY_NAMES` is not exported from `../storage-keys`.

- [ ] **Step 3: Export the canonical entity list from `storage-keys.ts`**

Replace the whole contents of `frontend-react/apps/web-store-pos/app/shared/lib/storage/storage-keys.ts` with:

```ts
import { GlobalConfig } from '../config/global-config';

export const StorageKeys = {
  TOKEN: 'token',
  AUTH_MODEL: `${GlobalConfig.APP_VERSION}-authf496fc5a9f17`,
  CURRENT_USER: 'currentUser',
  LANGUAGE: 'language',
  entityKey: (entity: string, storeId: string) =>
    `lizoft.store-${entity}-${storeId}`,
} as const;

/**
 * The six business entities persisted per store, in the order their storage
 * seams landed. Single source of truth: consumed by `entity-migration.ts`
 * (which encrypts them) and `store-data-reset.ts` (which wipes them). A new
 * entity added here reaches both, which is the point — a private copy in
 * either module would let a wipe silently miss one.
 */
export const BUSINESS_ENTITY_NAMES = [
  'products',
  'product-categories',
  'inventory-entries',
  'orders',
  'expenses',
  'saleCredits',
] as const;
```

- [ ] **Step 4: Point `entity-migration.ts` at the shared list**

In `frontend-react/apps/web-store-pos/app/shared/lib/storage/entity-migration.ts`, change the import on line 26 from:

```ts
import { StorageKeys } from './storage-keys';
```

to:

```ts
import { StorageKeys, BUSINESS_ENTITY_NAMES } from './storage-keys';
```

Then delete the local declaration at lines 30-42 (the `/** The six business-entity names migrated... */` doc comment together with `const MIGRATED_ENTITY_NAMES = [...] as const;`) and change the loop header at line 75 from:

```ts
  for (const entity of MIGRATED_ENTITY_NAMES) {
```

to:

```ts
  for (const entity of BUSINESS_ENTITY_NAMES) {
```

Behaviour is unchanged: same six names, same order.

- [ ] **Step 5: Write `store-data-reset.ts`**

Create `frontend-react/apps/web-store-pos/app/shared/lib/storage/store-data-reset.ts`:

```ts
// The irreversible wipe behind the catalog's "Limpiar" button
// (openspec/changes/catalog-show-all-and-clear-data/superpowers-design.md §D5).
//
// SCOPE: the six business entities of ONE store. It never touches `token`,
// `AUTH_MODEL`, `currentUser`, `language`, the offline roster, or the
// device-wrapped DEK — the session survives the wipe and the device keeps its
// offline access.
//
// It also never touches the cart. The cart is zustand-persisted state with an
// in-memory copy (`cart-store.ts:111,136`); removing its key here would leave
// that copy populated in the current tab, which would then re-persist itself.
// The caller clears the cart through the store's own `clear()` action.
import { StorageKeys, BUSINESS_ENTITY_NAMES } from './storage-keys';

/**
 * Removes every business-entity key belonging to `storeId`.
 *
 * Per-key isolation mirrors `entity-migration.ts:77-88`: each removal is
 * wrapped on its own so a storage failure on one entity cannot abort the
 * remaining five. A partial wipe is a worse outcome than a full one, but a
 * far better outcome than "the first key threw and the other five are still
 * there without anyone knowing which".
 *
 * Idempotent: absent keys are skipped by `removeItem` itself and are never
 * created.
 */
export function clearStoreData(storeId: string): void {
  for (const entity of BUSINESS_ENTITY_NAMES) {
    try {
      localStorage.removeItem(StorageKeys.entityKey(entity, storeId));
    } catch {
      // Per-key isolation — swallow so the loop reaches the remaining keys.
    }
  }
}
```

- [ ] **Step 6: Run both storage test files to verify green**

```bash
cd frontend-react/apps/web-store-pos && npx vitest run app/shared/lib/storage/__tests__/store-data-reset.test.ts app/shared/lib/storage/__tests__/entity-migration.test.ts
```

Expected: PASS. `entity-migration.test.ts` must be green **without edits** — it is the proof that moving the constant changed no behaviour.

- [ ] **Step 7: Commit**

```bash
git add frontend-react/apps/web-store-pos/app/shared/lib/storage/storage-keys.ts \
        frontend-react/apps/web-store-pos/app/shared/lib/storage/entity-migration.ts \
        frontend-react/apps/web-store-pos/app/shared/lib/storage/store-data-reset.ts \
        frontend-react/apps/web-store-pos/app/shared/lib/storage/__tests__/store-data-reset.test.ts
git commit -m "feat(storage): add clearStoreData behind a single canonical business-entity list"
```

---

### Task 3: `fab-danger` button variant

The Clear button must be both pill-shaped (like the Importar FAB beside it) and red. `variant="fab"` with an inline `className="bg-danger"` override would put a one-off colour in a page, where the next red pill button copies it instead of the system.

**Files:**
- Modify: `frontend-react/apps/web-store-pos/app/shared/components/ui/button.tsx:3,5-14,25`
- Test: `frontend-react/apps/web-store-pos/app/shared/components/ui/__tests__/button.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `ButtonVariant` gains the literal `'fab-danger'`. Task 6 renders `<Button variant="fab-danger">`.

- [ ] **Step 1: Write the failing test**

Add to the existing `describe('Button — variants and interaction')` block in `button.test.tsx`, after the `outline` variant test:

```tsx
  it('applies fab-danger variant classes when variant="fab-danger"', () => {
    render(<Button variant="fab-danger">Limpiar</Button>);
    const btn = screen.getByRole('button', { name: 'Limpiar' });
    // Pill geometry from `fab`, colour from `danger` — the composition is the
    // whole point of the variant existing.
    expect(btn.className).toContain('rounded-full');
    expect(btn.className).toContain('bg-danger');
  });
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend-react/apps/web-store-pos && npx vitest run app/shared/components/ui/__tests__/button.test.tsx
```

Expected: FAIL — TypeScript rejects `variant="fab-danger"` (not assignable to `ButtonVariant`), and at runtime `VARIANT_CLASSES['fab-danger']` is `undefined`, so neither class is present.

- [ ] **Step 3: Add the variant**

In `button.tsx`, change line 3 to:

```ts
export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'outline' | 'fab' | 'fab-danger';
```

and add this entry to `VARIANT_CLASSES`, immediately after the `fab` entry (line 13):

```ts
  // Same extended-FAB geometry as `fab`, in the danger colour — for prominent
  // destructive actions that sit beside a `fab` button (the catalog's
  // "Limpiar" next to "Importar Productos").
  'fab-danger': 'rounded-full px-5 py-3 shadow-lg bg-danger text-white hover:opacity-90',
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd frontend-react/apps/web-store-pos && npx vitest run app/shared/components/ui/__tests__/button.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend-react/apps/web-store-pos/app/shared/components/ui/button.tsx \
        frontend-react/apps/web-store-pos/app/shared/components/ui/__tests__/button.test.tsx
git commit -m "feat(ui): add a fab-danger button variant for destructive prominent actions"
```

---

### Task 4: The catalog's two service methods return everything

Both methods are catalog-exclusive in production (`products.tsx:53` and `products.tsx:58`), verified by grep across `apps/` and `packages/`, so changing their bodies cannot reach another screen. No duplication is needed.

The counter and the list are made to resolve through the **same** repository method, `ProductRepository.getProductsByCategoryId` — so "the number matches the rows" becomes a property of the code rather than a rule someone has to remember.

**Files:**
- Modify: `frontend-react/apps/web-store-pos/app/sales/lib/services/product-category-offline-service.ts:72-88`
- Modify: `frontend-react/apps/web-store-pos/app/sales/lib/services/product-offline-service.ts:59-63`
- Test: `frontend-react/apps/web-store-pos/app/sales/lib/services/__tests__/product-category-offline-service.test.ts:156-195`
- Test: `frontend-react/apps/web-store-pos/app/sales/lib/services/__tests__/product-offline-service.test.ts:84-106`

**Interfaces:**
- Consumes: `ProductCategoryRepository.getProductCategories(): ProductCategory[]` (all, sorted by `order`) and `ProductRepository.getProductsByCategoryId(categoryId: string): Product[]` (all of that category, sorted by `order`). Both already exist and are unchanged.
- Produces: no signature changes. `getProductCategoriesView()` still returns `Promise<BaseResponseModel<ProductCategoryView[]>>` and `getAvailableProductsByCategoryId(categoryId)` still returns `Promise<BaseResponseModel<Product[]>>`. Only the contents widen: inactive rows now included, `productsCount` now the category total.

- [ ] **Step 1: Rewrite the two CAT-12 tests to demand the new behaviour**

In `product-category-offline-service.test.ts`, replace the whole `describe('CAT-12: getProductCategoriesView')` block (lines 156-195) with:

```ts
  describe('CAT-12: getProductCategoriesView (catalog view — everything)', () => {
    // catalog-show-all-and-clear-data: this view feeds the product catalog and
    // nothing else, and the catalog must show every category and count every
    // product. The sale path keeps its own stricter methods (CAT-10,
    // PROD-17), which this change does not touch.
    it('counts EVERY product of the category, including inactive and non-sellable ones', async () => {
      await service.createProductCategory('Bebidas', 1, true);
      await service.createProductCategory('Snacks', 2, true);
      const [bebidas, snacks] = categoryRepository.getProductCategories();

      const productRepository = new ProductRepository(storeId, categoryRepository);
      // isActive && availableToSale
      productRepository.addProduct(bebidas.id, 'Coca Cola', 1, 'biz', 1, true, true, false, '1');
      // isActive but NOT availableToSale — counted now, excluded before
      productRepository.addProduct(bebidas.id, 'Fanta', 1, 'biz', 2, true, false, false, '2');
      // not active at all — counted now, excluded before
      productRepository.addProduct(bebidas.id, 'Sprite', 1, 'biz', 3, false, true, false, '3');

      const view = await service.getProductCategoriesView();
      expect(view.succeeded).toBe(true);
      const viewData = unwrap(view);
      const bebidasView = viewData.find((v) => v.id === bebidas.id)!;
      expect(bebidasView.productsCount).toBe(3);
      const snacksView = viewData.find((v) => v.id === snacks.id)!;
      expect(snacksView.productsCount).toBe(0);
    });

    it('includes inactive categories in the view result, flagged by isActive', async () => {
      await service.createProductCategory('ActiveCat', 1, true);
      await service.createProductCategory('InactiveCat', 2, true);
      const [active, inactive] = categoryRepository.getProductCategories();
      await service.updateProductCategory(inactive.id, inactive.name, inactive.order, false);

      const view = await service.getProductCategoriesView();
      const viewData = unwrap(view);
      expect(viewData.map((v) => v.id)).toEqual([active.id, inactive.id]);
      expect(viewData.find((v) => v.id === active.id)!.isActive).toBe(true);
      expect(viewData.find((v) => v.id === inactive.id)!.isActive).toBe(false);
    });

    it('resolves an empty array when there are no categories at all', async () => {
      const view = await service.getProductCategoriesView();
      expect(view).toEqual({ data: [], succeeded: true, message: '', actionCode: 200, errors: [] });
    });
  });
```

- [ ] **Step 2: Rewrite the PROD-11 test to demand the new behaviour**

In `product-offline-service.test.ts`, replace the whole `describe('PROD-11: getAvailableProductsByCategoryId (async)')` block (lines 84-106) with:

```ts
  describe('PROD-11: getAvailableProductsByCategoryId (catalog list — everything)', () => {
    // catalog-show-all-and-clear-data: sole consumer is the product catalog
    // (products.tsx:58), which must list inactive products too. The sale path
    // uses getProductsToSaleByCategoryId (PROD-17), untouched by this change.
    it('resolves every product of the category regardless of isActive/availableToSale, sorted by order', async () => {
      const categoryRepository = new ProductCategoryRepository(storeId);
      const productRepository = new ProductRepository(storeId, categoryRepository);
      service = new ProductOfflineService(storeId, productRepository, categoryRepository);
      const categoryId = categoryRepository.addProductCategoryByName('Bebidas');
      // Add in ascending order to avoid the repository's order-shift reordering the setup.
      productRepository.addProduct(categoryId, 'B', 1, '', 1, true, true, true);
      productRepository.addProduct(categoryId, 'A', 1, '', 2, true, false, true);
      productRepository.addProduct(categoryId, 'C', 1, '', 3, false, true, true);

      const result = await service.getAvailableProductsByCategoryId(categoryId);
      const data = unwrap(result);
      expect(data).toHaveLength(3);
      expect(data.map((p) => p.name)).toEqual(['B', 'A', 'C']);
      expect(data.map((p) => p.order)).toEqual([1, 2, 3]);
    });

    it('does not leak products from another category', async () => {
      const categoryRepository = new ProductCategoryRepository(storeId);
      const productRepository = new ProductRepository(storeId, categoryRepository);
      service = new ProductOfflineService(storeId, productRepository, categoryRepository);
      const bebidasId = categoryRepository.addProductCategoryByName('Bebidas');
      const snacksId = categoryRepository.addProductCategoryByName('Snacks');
      productRepository.addProduct(bebidasId, 'Coca Cola', 1, '', 1, false, false, true);

      const result = await service.getAvailableProductsByCategoryId(snacksId);
      expect(unwrap(result)).toEqual([]);
    });

    it('resolves an empty array when no products match', async () => {
      const result = await service.getAvailableProductsByCategoryId('none');
      expect(result.data).toEqual([]);
    });
  });
```

`addProductCategoryByName(name: string): string` returns the generated id
directly (`product-category-repository.ts:114-119`), which is why the ids above
are used unwrapped — same as PROD-08 at line 57.

- [ ] **Step 3: Run both test files to verify they fail**

```bash
cd frontend-react/apps/web-store-pos && npx vitest run app/sales/lib/services/__tests__/product-category-offline-service.test.ts app/sales/lib/services/__tests__/product-offline-service.test.ts
```

Expected: FAIL — `productsCount` is `1` instead of `3`; the view omits the inactive category; the product list has 2 entries instead of 3.

- [ ] **Step 4: Widen `getProductCategoriesView`**

In `product-category-offline-service.ts`, replace lines 72-88 with:

```ts
  /**
   * Catalog view projection — ALL categories, each with its TOTAL product count.
   *
   * DIVERGES DELIBERATELY from the Angular 1:1 port
   * (`product-category-offline.service.ts:50-65`, which projects only
   * `getAvailableProductCategories()` and counts with the stricter
   * `isActive && availableToSale` predicate). See
   * `openspec/changes/catalog-show-all-and-clear-data/superpowers-design.md` §D1.
   *
   * The product catalog (`products.tsx:53`) is the SOLE production consumer of
   * this method, so widening it reaches no other screen. It must show every
   * category, inactive included — `isActive` travels on each row so the UI can
   * mark them.
   *
   * `productsCount` deliberately resolves through the SAME repository method
   * the catalog uses for its per-category list,
   * `ProductRepository.getProductsByCategoryId` (`products.tsx:58` ->
   * `ProductOfflineService.getAvailableProductsByCategoryId`). Two different
   * predicates are exactly how the badge came to disagree with the rows below
   * it; sharing one makes them agree by construction. Never fails.
   */
  getProductCategoriesView(): Promise<BaseResponseModel<ProductCategoryView[]>> {
    const categories = this.categoryRepository.getProductCategories();
    const categoriesView: ProductCategoryView[] = categories.map((category) => ({
      id: category.id,
      name: category.name,
      order: category.order,
      isActive: category.isActive,
      productsCount: this.productRepository.getProductsByCategoryId(category.id).length,
    }));
    return Promise.resolve(success(categoriesView));
  }
```

- [ ] **Step 5: Widen `getAvailableProductsByCategoryId`**

In `product-offline-service.ts`, replace lines 59-63 with:

```ts
  /**
   * Catalog product list — ALL products of the category, sorted by `order`.
   *
   * DIVERGES DELIBERATELY from the Angular 1:1 port
   * (`product-offline.service.ts:123-126`, isActive-only). See
   * `openspec/changes/catalog-show-all-and-clear-data/superpowers-design.md` §D1.
   *
   * The product catalog (`products.tsx:58`) is the SOLE production consumer, so
   * widening it reaches no other screen — the sale path and the inventory
   * egress path both go through `getProductsToSaleByCategoryId`, which keeps
   * its `isActive && availableToSale` filter untouched.
   *
   * The name is now inaccurate ("Available" returns everything). Renaming would
   * mean editing `packages/domain`'s `ProductService` interface and
   * `ProductOnlineService` — i.e. leaving the catalog, which this change's scope
   * rule forbids (design §D3).
   */
  async getAvailableProductsByCategoryId(categoryId: string): Promise<BaseResponseModel<Product[]>> {
    return success(this.productRepository.getProductsByCategoryId(categoryId));
  }
```

- [ ] **Step 6: Run both test files to verify they pass**

```bash
cd frontend-react/apps/web-store-pos && npx vitest run app/sales/lib/services/__tests__/product-category-offline-service.test.ts app/sales/lib/services/__tests__/product-offline-service.test.ts
```

Expected: PASS, including the untouched CAT-10 and PROD-17 blocks — those are the proof the sale path's filters still hold.

- [ ] **Step 7: Commit**

```bash
git add frontend-react/apps/web-store-pos/app/sales/lib/services/product-category-offline-service.ts \
        frontend-react/apps/web-store-pos/app/sales/lib/services/product-offline-service.ts \
        frontend-react/apps/web-store-pos/app/sales/lib/services/__tests__/product-category-offline-service.test.ts \
        frontend-react/apps/web-store-pos/app/sales/lib/services/__tests__/product-offline-service.test.ts
git commit -m "feat(sales): serve the product catalog every category and product, active or not"
```

---

### Task 5: Mark inactive categories and products in the catalog

Showing inactive rows without saying so is worse than hiding them: the user sees a product in the catalog, does not see it in Ventas, and has no way to tell why — the exact symptom of a bug. Opacity alone is invisible to a screen reader and unreliable at low brightness, so the marker carries text.

**Files:**
- Create: `frontend-react/apps/web-store-pos/app/sales/components/inactive-badge.tsx`
- Modify: `frontend-react/apps/web-store-pos/app/sales/components/category-product-list.tsx:62-68`
- Modify: `frontend-react/apps/web-store-pos/app/sales/routes/products.tsx:318-341`
- Test: `frontend-react/apps/web-store-pos/app/sales/components/__tests__/category-product-list.test.tsx`
- Test: `frontend-react/apps/web-store-pos/app/sales/routes/__tests__/products.test.tsx:43-55,97-112,270-286`

**Interfaces:**
- Consumes: `Product.isActive: boolean`, `ProductCategoryView.isActive: boolean` (both already present on the models).
- Produces: `InactiveBadge` — a props-less component exported from `~/sales/components/inactive-badge`, rendering the text `Inactivo` with `data-testid="inactive-badge"`.

- [ ] **Step 1: Write the failing product-row test**

Add to `category-product-list.test.tsx`, inside its existing top-level `describe` block:

```tsx
  it('marks an inactive product with the Inactivo badge', () => {
    render(
      <Wrapper>
        <CategoryProductList
          products={[makeProduct({ id: 'p1', name: 'Sprite', isActive: false })]}
          onEditProduct={vi.fn()}
          onDeleteProduct={vi.fn()}
        />
      </Wrapper>,
    );
    expect(screen.getByText('Sprite')).toBeInTheDocument();
    expect(screen.getByTestId('inactive-badge')).toHaveTextContent('Inactivo');
  });

  it('does not mark an active product', () => {
    render(
      <Wrapper>
        <CategoryProductList
          products={[makeProduct({ id: 'p1', name: 'Coca Cola', isActive: true })]}
          onEditProduct={vi.fn()}
          onDeleteProduct={vi.fn()}
        />
      </Wrapper>,
    );
    expect(screen.queryByTestId('inactive-badge')).not.toBeInTheDocument();
  });
```

The file already defines `Wrapper` (line 8) and `makeProduct` (line 16) with exactly these names and signatures, and already imports `vi`, `render` and `screen` — add nothing to the imports.

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend-react/apps/web-store-pos && npx vitest run app/sales/components/__tests__/category-product-list.test.tsx
```

Expected: FAIL — `Unable to find an element by: [data-testid="inactive-badge"]`.

- [ ] **Step 3: Create the badge component**

Create `frontend-react/apps/web-store-pos/app/sales/components/inactive-badge.tsx`:

```tsx
/**
 * The "Inactivo" marker used by the product catalog, on both category headers
 * and product rows (`openspec/changes/catalog-show-all-and-clear-data/
 * superpowers-design.md` §D4).
 *
 * The catalog lists inactive categories and products; the sale screen does not.
 * Without a marker the user sees a row in the catalog, does not see it in
 * Ventas, and has no way to tell why. It carries TEXT, not just the reduced
 * opacity its container applies — colour and opacity say nothing to a screen
 * reader and little on a dim display.
 *
 * Copy stays hardcoded Spanish, matching the CSV-import strings in
 * `products.tsx:184,269`.
 */
export function InactiveBadge() {
  return (
    <span
      data-testid="inactive-badge"
      className="shrink-0 rounded-full border border-danger px-2 py-0.5 text-xs font-medium text-danger"
    >
      Inactivo
    </span>
  );
}
```

- [ ] **Step 4: Mark inactive product rows**

In `category-product-list.tsx`, add the import after line 5:

```tsx
import { InactiveBadge } from './inactive-badge';
```

Then replace the `ProductRow` opening markup (lines 66-68) — that is, the `<li>` element and the product-name `<span>` — with:

```tsx
  return (
    <li className={`flex items-center justify-between py-3 ${product.isActive ? '' : 'opacity-60'}`.trim()}>
      <span className="flex items-center gap-2">
        <span className="text-sm text-text">{product.name}</span>
        {!product.isActive && <InactiveBadge />}
      </span>
```

Leave the rest of `ProductRow` (the price and the `ActionMenu` block, lines 69-85) untouched.

- [ ] **Step 5: Run the component test to verify it passes**

```bash
cd frontend-react/apps/web-store-pos && npx vitest run app/sales/components/__tests__/category-product-list.test.tsx
```

Expected: PASS, including the file's pre-existing tests.

- [ ] **Step 6: Stop the page tests from re-implementing the old filters**

`products.test.tsx` mocks the services and re-implements their filtering inside the test file, so the page tests would keep exercising the old behaviour even after Task 4. Three edits:

Replace the `getAvailableProductsByCategoryId` mock at lines 45-47 with:

```tsx
    getAvailableProductsByCategoryId: vi.fn(async (categoryId: string) =>
      bm(mockProducts.filter((p) => p.categoryId === categoryId)),
    ),
```

Replace the `getProductCategoriesView` mock at lines 99-108 with:

```tsx
    getProductCategoriesView: vi.fn(async () =>
      bm(
        mockCategories.map((c) => ({
          ...c,
          productsCount: mockProducts.filter((p) => p.categoryId === c.id).length,
        })),
      ),
    ),
```

Replace the stale comment at lines 281-282 with:

```tsx
    // badge count comes from getProductCategoriesView's productsCount, which is
    // now the category's TOTAL product count — the same set the panel lists.
```

The `expect(screen.getByText('1')).toBeInTheDocument()` assertion on line 283 stays as it is: the fixture has one product, so the total is still 1.

- [ ] **Step 7: Write the failing page tests**

Add to `products.test.tsx`, inside the existing `describe('ProductsPage — strict Angular parity (products.component.html)')` block:

```tsx
  it('lists inactive categories, marked', async () => {
    mockCategories = [
      makeCategory({ id: 'cat-1', name: 'Bebidas', isActive: true }),
      makeCategory({ id: 'cat-2', name: 'Descontinuados', isActive: false }),
    ];

    render(
      <Wrapper>
        <ProductsPage />
      </Wrapper>,
    );

    expect(await screen.findByText('Descontinuados')).toBeInTheDocument();
    expect(screen.getAllByTestId('inactive-badge')).toHaveLength(1);
  });

  it('lists inactive products inside an expanded panel, marked', async () => {
    mockCategories = [makeCategory()];
    mockProducts = [
      makeProduct({ id: 'p1', name: 'Coca Cola', isActive: true }),
      makeProduct({ id: 'p2', name: 'Sprite', isActive: false, order: 2 }),
    ];

    render(
      <Wrapper>
        <ProductsPage />
      </Wrapper>,
    );

    fireEvent.click(await screen.findByTestId('category-panel-toggle-cat-1'));
    expect(await screen.findByText('Sprite')).toBeInTheDocument();
    expect(screen.getAllByTestId('inactive-badge')).toHaveLength(1);
  });

  it('shows a category count that matches the number of rows listed', async () => {
    mockCategories = [makeCategory()];
    mockProducts = [
      makeProduct({ id: 'p1', name: 'Coca Cola', isActive: true, availableToSale: true }),
      makeProduct({ id: 'p2', name: 'Fanta', isActive: true, availableToSale: false, order: 2 }),
      makeProduct({ id: 'p3', name: 'Sprite', isActive: false, availableToSale: true, order: 3 }),
    ];

    render(
      <Wrapper>
        <ProductsPage />
      </Wrapper>,
    );

    expect(await screen.findByText('3')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('category-panel-toggle-cat-1'));
    expect(await screen.findByText('Coca Cola')).toBeInTheDocument();
    expect(screen.getByText('Fanta')).toBeInTheDocument();
    expect(screen.getByText('Sprite')).toBeInTheDocument();
  });
```

- [ ] **Step 8: Run the page tests to verify the category ones fail**

```bash
cd frontend-react/apps/web-store-pos && npx vitest run app/sales/routes/__tests__/products.test.tsx
```

Expected: the "lists inactive products" and "count matches" tests PASS already (Step 4 plus the mock fix cover them); "lists inactive categories, marked" FAILS — the category header renders no badge.

- [ ] **Step 9: Mark inactive category headers**

In `products.tsx`, add the import after line 25:

```tsx
import { InactiveBadge } from '../components/inactive-badge';
```

Then, inside the accordion `map` (lines 318-341), apply the dimming to the panel wrapper and the badge to the header. Replace the wrapper `<div>` on line 322 with:

```tsx
              <div
                key={category.id}
                className={`rounded-lg border border-border bg-surface ${category.isActive ? '' : 'opacity-60'}`.trim()}
              >
```

and replace the category-name `<span>` on line 335 with:

```tsx
                    <span className="flex-1 text-left text-base font-medium text-text">{category.name}</span>
                    {!category.isActive && <InactiveBadge />}
```

Leave the count `<span>` on line 340 and the two toggle buttons untouched.

- [ ] **Step 10: Run the page tests to verify they pass**

```bash
cd frontend-react/apps/web-store-pos && npx vitest run app/sales/routes/__tests__/products.test.tsx
```

Expected: PASS, all tests in the file.

- [ ] **Step 11: Commit**

```bash
git add frontend-react/apps/web-store-pos/app/sales/components/inactive-badge.tsx \
        frontend-react/apps/web-store-pos/app/sales/components/category-product-list.tsx \
        frontend-react/apps/web-store-pos/app/sales/routes/products.tsx \
        frontend-react/apps/web-store-pos/app/sales/components/__tests__/category-product-list.test.tsx \
        frontend-react/apps/web-store-pos/app/sales/routes/__tests__/products.test.tsx
git commit -m "feat(sales): mark inactive categories and products in the product catalog"
```

---

### Task 6: The Limpiar button

**Files:**
- Modify: `frontend-react/apps/web-store-pos/app/sales/routes/products.tsx:1-46,307-314`
- Test: `frontend-react/apps/web-store-pos/app/sales/routes/__tests__/products.test.tsx:11-18`

**Interfaces:**
- Consumes: `clearStoreData(storeId: string): void` from `~/shared/lib/storage/store-data-reset` (Task 2); `ButtonVariant` value `'fab-danger'` (Task 3); `isOwnerAdmin(user: UserModel): boolean` from `~/shared/lib/auth/authorization-service` (existing, line 8); `TrashIcon` from `~/shared/components/ui/icons` (existing, line 121); `useCartStore` action `clear(): void` (existing, `cart-store.ts:111`); `confirmDialog` and `showToastSuccess`, both already imported by `products.tsx`.
- Produces: nothing. Final task.

- [ ] **Step 1: Make the test file's auth user mutable and mock the cart store**

`products.test.tsx` builds its auth state inline inside the mock factory, so no test can flip `isOwnerAdmin`. Replace lines 11-18 with:

```tsx
const mockUser = vi.hoisted(() => ({
  selectedStoreId: 's1',
  login: 'jdoe',
  isOwnerAdmin: true,
}));

vi.mock('~/shared/lib/stores/auth-store', () => {
  const state = { user: mockUser, isAuthenticated: true };
  const useAuthStore = vi.fn((selector?: (s: typeof state) => unknown) => {
    if (typeof selector === 'function') return selector(state);
    return state;
  });
  return { useAuthStore };
});

const clearCartMock = vi.hoisted(() => vi.fn());
vi.mock('~/shared/lib/stores/cart-store', () => {
  const state = { clear: clearCartMock };
  const useCartStore = vi.fn((selector?: (s: typeof state) => unknown) => {
    if (typeof selector === 'function') return selector(state);
    return state;
  });
  return { useCartStore };
});

const clearStoreDataMock = vi.hoisted(() => vi.fn());
vi.mock('~/shared/lib/storage/store-data-reset', () => ({
  clearStoreData: (...args: unknown[]) => clearStoreDataMock(...args),
}));
```

Then add these three lines to the existing `beforeEach` (after `showToastErrorMock.mockClear();` at line 212):

```tsx
    mockUser.isOwnerAdmin = true;
    clearCartMock.mockClear();
    clearStoreDataMock.mockClear();
```

- [ ] **Step 2: Write the failing tests**

Add to `products.test.tsx`, inside the existing `describe('ProductsPage — strict Angular parity (products.component.html)')` block:

```tsx
  it('renders the "Limpiar" button to the LEFT of "Importar Productos" for an OwnerAdmin', () => {
    render(
      <Wrapper>
        <ProductsPage />
      </Wrapper>,
    );

    const clearButton = screen.getByTestId('clear-data-button');
    const importButton = screen.getByTestId('import-csv-button');
    expect(clearButton).toHaveTextContent('Limpiar');
    // DOCUMENT_POSITION_FOLLOWING === 4: import comes after clear in the DOM,
    // which in this left-to-right flex row means clear sits to its left.
    expect(clearButton.compareDocumentPosition(importButton)).toBe(4);
  });

  it('hides the "Limpiar" button from a non-owner', () => {
    mockUser.isOwnerAdmin = false;
    render(
      <Wrapper>
        <ProductsPage />
      </Wrapper>,
    );
    expect(screen.queryByTestId('clear-data-button')).not.toBeInTheDocument();
    expect(screen.getByTestId('import-csv-button')).toBeInTheDocument();
  });

  it('asks for confirmation with the irreversible-action copy before wiping anything', async () => {
    confirmDialogMock.mockResolvedValue(false);
    render(
      <Wrapper>
        <ProductsPage />
      </Wrapper>,
    );

    fireEvent.click(screen.getByTestId('clear-data-button'));

    await waitFor(() => expect(confirmDialogMock).toHaveBeenCalledTimes(1));
    expect(confirmDialogMock).toHaveBeenCalledWith({
      title: '¿Está seguro que desea eliminar todos los datos?',
      message: 'Este proceso no se podrá revertir.',
      confirmButtonText: 'Si',
      cancelButtonText: 'No',
    });
  });

  it('wipes nothing when the confirmation is cancelled', async () => {
    confirmDialogMock.mockResolvedValue(false);
    render(
      <Wrapper>
        <ProductsPage />
      </Wrapper>,
    );

    fireEvent.click(screen.getByTestId('clear-data-button'));

    await waitFor(() => expect(confirmDialogMock).toHaveBeenCalledTimes(1));
    expect(clearStoreDataMock).not.toHaveBeenCalled();
    expect(clearCartMock).not.toHaveBeenCalled();
    expect(showToastSuccessMock).not.toHaveBeenCalled();
  });

  it('wipes the store data AND the cart on confirm, then repaints empty with a toast', async () => {
    confirmDialogMock.mockResolvedValue(true);
    mockCategories = [makeCategory()];
    mockProducts = [makeProduct()];

    render(
      <Wrapper>
        <ProductsPage />
      </Wrapper>,
    );
    expect(await screen.findByText('Bebidas')).toBeInTheDocument();

    // The wipe is mocked, so empty the fixtures the reload will read back.
    mockCategories = [];
    mockProducts = [];
    fireEvent.click(screen.getByTestId('clear-data-button'));

    await waitFor(() => expect(clearStoreDataMock).toHaveBeenCalledWith('s1'));
    expect(clearCartMock).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByText('Bebidas')).not.toBeInTheDocument());
    expect(showToastSuccessMock).toHaveBeenCalledWith('Todos los datos fueron eliminados.');
  });
```

The `'Si'` / `'No'` above are the resolved values of `GENERAL.YES` and `GENERAL.NO` in `app/shared/lib/i18n/es.ts:38-39` — verbatim, `'Si'` without an accent. Do not "correct" it to `'Sí'`; the assertion compares against the message catalogue, not against Spanish orthography.

- [ ] **Step 3: Run the tests to verify they fail**

```bash
cd frontend-react/apps/web-store-pos && npx vitest run app/sales/routes/__tests__/products.test.tsx
```

Expected: FAIL — `Unable to find an element by: [data-testid="clear-data-button"]` on the first, third, fourth and fifth tests. The "hides from a non-owner" test passes vacuously; that is fine, it becomes meaningful once the button exists.

- [ ] **Step 4: Wire the button into the page**

In `products.tsx`:

Add `TrashIcon` to the existing icons import on line 10:

```tsx
import { PlusIcon, PaperclipIcon, ChevronDownIcon, TrashIcon } from '~/shared/components/ui/icons';
```

Add these imports after line 13 (`InventoryOfflineService`):

```tsx
import { isOwnerAdmin } from '~/shared/lib/auth/authorization-service';
import { useCartStore } from '~/shared/lib/stores/cart-store';
import { clearStoreData } from '~/shared/lib/storage/store-data-reset';
```

Add these two selectors immediately after the `storeId` selector on line 38:

```tsx
  // The wipe is irreversible and local-only, so this is a render guard, not an
  // authorization boundary — there is no server call to protect.
  const isOwner = useAuthStore((s) => (s.user ? isOwnerAdmin(s.user) : false));
  const clearCart = useCartStore((s) => s.clear);
```

Add this handler immediately after `handleCsvImport` (after line 278):

```tsx
  // --- Clear all data ---
  // catalog-show-all-and-clear-data §D5/D6/D9. Wipes the six business entities of
  // the ACTIVE store; never touches token/AUTH_MODEL/currentUser/roster/DEK, so the
  // session survives and the device keeps offline access.
  //
  // The cart goes through the store's own clear() action rather than its
  // localStorage key: the key alone would leave the in-memory zustand copy
  // populated in this tab, which would then re-persist itself. Left behind, that
  // cart points at products that no longer exist and can still be checked out.
  async function handleClearData() {
    const confirmed = await confirmDialog({
      title: '¿Está seguro que desea eliminar todos los datos?',
      message: 'Este proceso no se podrá revertir.',
      confirmButtonText: intl.formatMessage({ id: 'GENERAL.YES' }),
      cancelButtonText: intl.formatMessage({ id: 'GENERAL.NO' }),
    });
    if (!confirmed) return;

    clearStoreData(storeId);
    clearCart();
    await loadData();
    showToastSuccess('Todos los datos fueron eliminados.');
  }
```

Finally, replace the button row at lines 307-314 with:

```tsx
        <div className="flex justify-end gap-3 mb-4">
          {isOwner && (
            <Button variant="fab-danger" onClick={handleClearData} data-testid="clear-data-button">
              <TrashIcon />
              Limpiar
            </Button>
          )}
          <Button variant="fab" onClick={() => setModal({ type: 'csv' })} data-testid="import-csv-button">
            {/* Angular: <mat-icon>attach_file</mat-icon> */}
            <PaperclipIcon />
            {/* PRODUCT_CATEGORY.IMPORT_PRODUCTS */}
            {intl.formatMessage({ id: 'PRODUCT_CATEGORY.IMPORT_PRODUCTS' })}
          </Button>
        </div>
```

- [ ] **Step 5: Run the page tests to verify they pass**

```bash
cd frontend-react/apps/web-store-pos && npx vitest run app/sales/routes/__tests__/products.test.tsx
```

Expected: PASS, all tests in the file.

- [ ] **Step 6: Run the full gate**

```bash
cd frontend-react && npx turbo run test --force
```

Expected: PASS across every package. `--force` is required — a cached replay is not evidence. If anything outside this change's files is red, STOP and report it rather than adjusting the failing test.

- [ ] **Step 7: Typecheck and lint**

```bash
cd frontend-react && npx turbo run typecheck lint --force
```

Expected: PASS. Remember these do not cover `frontend-react/e2e/`.

- [ ] **Step 8: Commit**

```bash
git add frontend-react/apps/web-store-pos/app/sales/routes/products.tsx \
        frontend-react/apps/web-store-pos/app/sales/routes/__tests__/products.test.tsx
git commit -m "feat(sales): add an owner-only Limpiar button that wipes the store's local data"
```

---

## Verification Checklist

Run before declaring the work done. Evidence means pasted output, not recollection.

- [ ] `cd frontend-react && npx turbo run test --force` — green
- [ ] `cd frontend-react && npx turbo run typecheck lint --force` — green
- [ ] `git diff --stat main...HEAD` lists only the files named in the File Structure table
- [ ] `git diff main...HEAD -- frontend-react/e2e/` is **empty** — no E2E file touched
- [ ] `rg -n "getAvailableProductCategories|getProductsToSaleByCategoryId" frontend-react/apps/web-store-pos/app/sales/routes/sale.tsx` still matches both — the sale screen never moved
- [ ] `git diff main...HEAD -- frontend-react/apps/web-store-pos/app/sales/lib/repositories/` is **empty** — no shared repository method changed
- [ ] Playwright is **not** run by the implementer. Hand the branch to the user for that.

## Known Follow-Ups (out of scope, do not implement)

- `getAvailableProductsByCategoryId` and `getProductCategoriesView` now have names that overstate their filtering. Renaming needs `packages/domain` and the online services, which is a separate change.
- `ProductOnlineService` / `ProductCategoryOnlineService` still filter server-side. `GlobalConfig.USE_ONLINE_SERVICE` is a hardcoded `false` and those services are reference-only, so no running path is affected today.
- The new Spanish strings are hardcoded, matching the CSV-import precedent in the same file. Introducing i18n keys is a separate change.
