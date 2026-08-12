# New Category Defaults to Max Order + 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Creating a product category prefills `Orden` with `max(category.order) + 1` so the new category lands last, and the product service's ambiguous `getMaxOrder` is renamed to `getMaxOrderByCategoryId`.

**Architecture:** The route (`products.tsx`) resolves the next order before opening the modal and passes it in as a prop, mirroring the `handleAddProduct` / `CreateProductModal` pair that already exists in the same file. No new service, repository, or endpoint — `ProductCategoryService.getMaxOrder()` is already implemented on both the offline and online branches and simply has no production caller yet.

**Tech Stack:** React 19 + react-router, TypeScript, Vitest + @testing-library/react, pnpm workspaces + Turborepo.

Design: [`openspec/changes/category-default-order-max-plus-one/superpowers-design.md`](./superpowers-design.md)

## Global Constraints

- **Never modify, delete, rename, skip, or weaken an existing E2E test or E2E support file** (`frontend-react/e2e/**`, `backend/src/SMCA.WebApi.E2ETests/**`) without explicit user authorization. `rg "getMaxOrder" e2e` returns nothing and no task below touches `e2e/`. If an E2E file turns out to be in the way: stop, name the file, explain, ask.
- **Do not run Playwright or `dotnet` suites.** The agent runs frontend Vitest only. The user runs Playwright and .NET locally.
- **Strict TDD.** Every task writes the failing test first, runs it to watch it fail for the stated reason, then writes the minimal implementation.
- Unit-test files touched by these tasks are allowed to change; they are not E2E.
- Commit messages: conventional commits, **no `Co-Authored-By` and no AI attribution**.
- Run gates with `--force`: `npx turbo run test --force`. A cached replay is not evidence.
- Working directory for all commands: `frontend-react/`.
- All code, comments, identifiers, and commit messages in English. UI strings come from the existing i18n catalogue — no new message ids.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `packages/domain/src/services/product-service.ts` | `ProductService` interface — method renamed | 1 |
| `packages/domain/src/services/__tests__/product-service.test.ts` | Interface-conformance fake — renamed | 1 |
| `apps/web-store-pos/app/sales/lib/services/product-offline-service.ts` | Offline impl — renamed | 1 |
| `apps/web-store-pos/app/sales/lib/services/product-online-service.ts` | Online impl — renamed | 1 |
| `apps/web-store-pos/app/sales/lib/services/product-category-offline-service.ts` | Cross-reference comment — updated | 1 |
| `apps/web-store-pos/app/sales/lib/services/__tests__/product-offline-service.test.ts` | PROD-10 — renamed | 1 |
| `apps/web-store-pos/app/sales/lib/services/__tests__/product-online-service.test.ts` | ONLINE-10 — renamed | 1 |
| `apps/web-store-pos/app/sales/lib/services/__tests__/product-category-offline-service.test.ts` | CAT-09 — new coverage | 2 |
| `apps/web-store-pos/app/sales/lib/repositories/__tests__/product-category-repository.test.ts` | No-op-shift coverage | 3 |
| `apps/web-store-pos/app/sales/components/edit-product-category-modal.tsx` | New `defaultOrder` prop | 4 |
| `apps/web-store-pos/app/sales/components/__tests__/edit-product-category-modal.test.tsx` | Modal tests — new prop | 4 |
| `apps/web-store-pos/app/sales/routes/products.tsx` | `handleAddCategory`, `Modal` union | 1, 4, 5 |
| `apps/web-store-pos/app/sales/routes/__tests__/products.test.tsx` | Route tests | 1, 5 |

---

### Task 1: Rename `getMaxOrder` → `getMaxOrderByCategoryId` on the product service

Pure rename across the interface, both implementations, the one production caller, and four unit-test files. **No behavior, signature, envelope, or endpoint change.** `ProductCategoryService.getMaxOrder()` is NOT renamed — on the category service, with no arguments, the name is already unambiguous.

**Files:**
- Modify: `packages/domain/src/services/product-service.ts:14,62`
- Modify: `packages/domain/src/services/__tests__/product-service.test.ts:138,155,177`
- Modify: `apps/web-store-pos/app/sales/lib/services/product-offline-service.ts:53-57`
- Modify: `apps/web-store-pos/app/sales/lib/services/product-online-service.ts:94`
- Modify: `apps/web-store-pos/app/sales/lib/services/product-category-offline-service.ts:107-109`
- Modify: `apps/web-store-pos/app/sales/routes/products.tsx:93,95`
- Test: `apps/web-store-pos/app/sales/lib/services/__tests__/product-offline-service.test.ts:65,67,79`
- Test: `apps/web-store-pos/app/sales/lib/services/__tests__/product-online-service.test.ts:112,116`
- Test: `apps/web-store-pos/app/sales/routes/__tests__/products.test.tsx:57,74,204,205,387,391,393,410,416,443`

**Interfaces:**
- Consumes: nothing.
- Produces: `ProductService.getMaxOrderByCategoryId(categoryId: string): Promise<BaseResponseModel<number>>`. Task 5 does not use it, but the route file it edits must already be on the new name.

- [ ] **Step 1: Rename the calls in the tests first, so they fail against the old implementation**

In `apps/web-store-pos/app/sales/lib/services/__tests__/product-offline-service.test.ts`, change the `PROD-10` block to:

```ts
  describe('PROD-10: getMaxOrderByCategoryId (async)', () => {
    it('resolves a success envelope with 0 when the category has no products', async () => {
      const result = await service.getMaxOrderByCategoryId('empty-cat');
      expect(result).toEqual({ data: 0, succeeded: true, message: '', actionCode: 200, errors: [] });
    });

    it('resolves the max order among all products (active+inactive) in the category', async () => {
      const categoryRepository = new ProductCategoryRepository(storeId);
      const productRepository = new ProductRepository(storeId, categoryRepository);
      service = new ProductOfflineService(storeId, productRepository, categoryRepository);
      const categoryId = categoryRepository.addProductCategoryByName('Bebidas');
      productRepository.addProduct(categoryId, 'Coca Cola', 1.5, '', 1, true, true, true);
      productRepository.addProduct(categoryId, 'Fanta', 1.5, '', 5, false, true, true);

      const result = await service.getMaxOrderByCategoryId(categoryId);
      expect(result.data).toBe(5);
    });
  });
```

In `apps/web-store-pos/app/sales/lib/services/__tests__/product-online-service.test.ts`, change the `ONLINE-10` test to:

```ts
  it('ONLINE-10: getMaxOrderByCategoryId → GET /v1/Products/maxOrderByCategoryId/:id', async () => {
    const svc = await getService();
    const api = await mockedApiClient();
    api.get.mockResolvedValue(envelope(5));
    const result = await svc.getMaxOrderByCategoryId('cat-1');
    expect(api.get).toHaveBeenCalledWith('/v1/Products/maxOrderByCategoryId/cat-1');
    expect(result.data).toBe(5);
  });
```

In `packages/domain/src/services/__tests__/product-service.test.ts`, rename the fake's method and its two call sites:

```ts
  async getMaxOrderByCategoryId(categoryId: string): Promise<BaseResponseModel<number>> {
    const orders = this.items.filter((p) => p.categoryId === categoryId).map((p) => p.order);
    return success(orders.length > 0 ? Math.max(...orders) : 0);
  }
```

```ts
    const maxOrder = await svc.getMaxOrderByCategoryId('cat1');
    expect(maxOrder.data).toBe(2);
```

and in that file's `it(...)` title string, replace the substring `getMaxOrder/createProducts` with `getMaxOrderByCategoryId/createProducts`.

In `apps/web-store-pos/app/sales/routes/__tests__/products.test.tsx`, rename every occurrence of the spy key and the calls — lines 57, 74, 204, 205, 387, 391, 393, 410, 416, 443. The spy object key becomes `getMaxOrderByCategoryId`:

```ts
  getMaxOrderByCategoryId: vi.fn((..._args: unknown[]) => Promise.resolve({ data: 0, succeeded: true, message: '', actionCode: 200, errors: [] })),
```

```ts
    getMaxOrderByCategoryId: productServiceSpies.getMaxOrderByCategoryId,
```

```ts
    productServiceSpies.getMaxOrderByCategoryId.mockClear();
    productServiceSpies.getMaxOrderByCategoryId.mockResolvedValue({ data: 0, succeeded: true, message: '', actionCode: 200, errors: [] });
```

and inside the two tests:

```ts
    productServiceSpies.getMaxOrderByCategoryId.mockResolvedValueOnce({
```

```ts
    await waitFor(() => expect(productServiceSpies.getMaxOrderByCategoryId).toHaveBeenCalledWith('cat-1'));
```

Update the two test titles and the two comment blocks at lines 385-390 and 443 to use the new name as well.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd frontend-react/apps/web-store-pos && npx vitest run app/sales/lib/services/__tests__/product-offline-service.test.ts app/sales/lib/services/__tests__/product-online-service.test.ts app/sales/routes/__tests__/products.test.tsx
```

Expected: FAIL — `service.getMaxOrderByCategoryId is not a function` in the offline/online suites. `products.test.tsx` fails because the mocked service object no longer exposes the name `products.tsx` calls.

- [ ] **Step 3: Rename the interface method**

In `packages/domain/src/services/product-service.ts`, line 62:

```ts
  getMaxOrderByCategoryId(categoryId: string): Promise<BaseResponseModel<number>>;
```

In the same file's doc comment (line 14), replace `` `getMaxOrder(categoryId)` `` with `` `getMaxOrderByCategoryId(categoryId)` `` and append this sentence to the comment block:

```
 * NOTE: Angular names this `getMaxOrder(categoryId)`. React DIVERGES ON PURPOSE
 * (user-authorized 2026-08-12): the backend declares BOTH `GetMaxOrderAsync()`
 * (global across all products) and `GetMaxOrderByCategoryIdAsync(categoryId)`
 * on `IProductRepository`, and this method is the SECOND one — the bare name
 * belonged to a different operation.
```

- [ ] **Step 4: Rename both implementations**

In `apps/web-store-pos/app/sales/lib/services/product-offline-service.ts`:

```ts
  /**
   * Angular calls this `getMaxOrder` (product-offline.service.ts:159-162). Renamed here to
   * match the backend's `GetMaxOrderByCategoryIdAsync` — see `ProductService` for why.
   */
  async getMaxOrderByCategoryId(categoryId: string): Promise<BaseResponseModel<number>> {
    const products = this.productRepository.getProductsByCategoryId(categoryId);
    return success(Math.max(...products.map((p) => p.order), 0));
  }
```

In `apps/web-store-pos/app/sales/lib/services/product-online-service.ts`, line 94, change the method name only — the URL and body stay exactly as they are:

```ts
  async getMaxOrderByCategoryId(categoryId: string): Promise<BaseResponseModel<number>> {
```

- [ ] **Step 5: Rename the production call site**

In `apps/web-store-pos/app/sales/routes/products.tsx`, lines 92-96:

```tsx
  // Angular parity (edit-product-modal.component.ts:42-49): opening the modal for create awaits
  // the per-category max product order and prefills Orden with data+1.
  async function handleAddProduct(category: ProductCategory) {
    const maxOrderResult = await productService.getMaxOrderByCategoryId(category.id);
    setModal({ type: 'create', category, defaultOrder: (maxOrderResult.data ?? 0) + 1 });
  }
```

- [ ] **Step 6: Update the stale cross-reference comment**

In `apps/web-store-pos/app/sales/lib/services/product-category-offline-service.ts`, lines 106-110, the comment names the old method. Replace the block with:

```ts
  /**
   * 1:1 port of Angular `getMaxOrder` (product-category-offline.service.ts:100-103) — GLOBAL
   * max across ALL categories (store-wide scope), never fails. Distinct from
   * `ProductService.getMaxOrderByCategoryId(categoryId)`, which is per-category.
   */
```

- [ ] **Step 7: Run the tests to verify they pass**

```bash
cd frontend-react/apps/web-store-pos && npx vitest run app/sales
```

```bash
cd frontend-react/packages/domain && npx vitest run
```

Expected: PASS, both.

- [ ] **Step 8: Verify no occurrence of the old product-service name survives**

```bash
cd frontend-react && rg -n "productService\.getMaxOrder\b|ProductService\.getMaxOrder\(" apps packages
```

Expected: no output. `ProductCategoryService.getMaxOrder()` and `categoryService.getMaxOrder()` are the category method and MUST still be present — do not "fix" those.

- [ ] **Step 9: Typecheck**

```bash
cd frontend-react && npx turbo run typecheck --force
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add frontend-react/packages/domain frontend-react/apps/web-store-pos/app/sales
git commit -m "refactor(sales): rename ProductService.getMaxOrder to getMaxOrderByCategoryId"
```

---

### Task 2: Pin the category `getMaxOrder` contract the feature depends on

Test-only. Adds the two cases `CAT-09` is missing: that the max includes **inactive** categories, and that it reads the **category's** order rather than any product's order. No production file changes.

**Files:**
- Test: `apps/web-store-pos/app/sales/lib/services/__tests__/product-category-offline-service.test.ts:106-119`

**Interfaces:**
- Consumes: `ProductCategoryOfflineService.getMaxOrder(): Promise<BaseResponseModel<number>>` (already exists, `product-category-offline-service.ts:111`).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing tests**

Append these two `it` blocks inside the existing `describe('CAT-09: ...')` block, after the `resolves the global max order across all categories` case:

```ts
    // The catalog sorts by category.order (products.tsx), and an inactive category still
    // occupies its slot. If the max ignored inactive rows, a new category could be created
    // with an order that collides with a deactivated one.
    it('includes INACTIVE categories in the max', async () => {
      await service.createProductCategory('Bebidas', 1, true);
      await service.createProductCategory('Snacks', 7, false);
      const result = await service.getMaxOrder();
      expect(result.data).toBe(7);
    });

    // Guards the rename in ProductService: this method reads ProductCategory.order, NOT the
    // order of any product inside a category. A product at order 99 must not raise it.
    it('reads category.order, never a contained product order', async () => {
      const productRepository = new ProductRepository(storeId, categoryRepository);
      service = new ProductCategoryOfflineService(storeId, categoryRepository, productRepository);
      await service.createProductCategory('Bebidas', 2, true);
      const [bebidas] = categoryRepository.getProductCategories();
      productRepository.addProduct(bebidas.id, 'Coca Cola', 1.5, '', 99, true, true, true);

      const result = await service.getMaxOrder();
      expect(result.data).toBe(2);
    });
```

- [ ] **Step 2: Run the tests**

```bash
cd frontend-react/apps/web-store-pos && npx vitest run app/sales/lib/services/__tests__/product-category-offline-service.test.ts -t "CAT-09"
```

Expected: **PASS on the first run.** These pin behavior the implementation already has; they are regression guards, not a red-green cycle. If either FAILS, stop — the design's premise is wrong and the user must be told before any production code is written.

- [ ] **Step 3: Commit**

```bash
git add frontend-react/apps/web-store-pos/app/sales/lib/services/__tests__/product-category-offline-service.test.ts
git commit -m "test(sales): pin category getMaxOrder against inactive rows and product order"
```

---

### Task 3: Pin that inserting at `max + 1` leaves siblings untouched

Test-only. `addProductCategoryData` shifts every sibling with `order >= order` by `+1` (`product-category-repository.ts:133-137`). This is exactly why the hardcoded `'1'` rewrote the whole catalog on every create. This test pins the no-op that `max + 1` buys.

**Files:**
- Test: `apps/web-store-pos/app/sales/lib/repositories/__tests__/product-category-repository.test.ts`

**Interfaces:**
- Consumes: `ProductCategoryRepository.addProductCategory(name, order, isActive)`, plus the file's existing `seedCategories` / `readStoredCategories` / `makeCategory` helpers (lines 8-28).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing test**

Append this `describe` block at the end of the top-level `describe` in the file:

```ts
  describe('insertion order and the sibling shift', () => {
    it('inserting at order 1 shifts EVERY existing category down by one', () => {
      seedCategories([
        makeCategory('c1', { name: 'Bebidas', order: 1 }),
        makeCategory('c2', { name: 'Snacks', order: 2 }),
      ]);
      const repository = new ProductCategoryRepository(storeId);

      repository.addProductCategory('Galletas', 1, true);

      const stored = readStoredCategories();
      expect(stored.find((c) => c.name === 'Bebidas')?.order).toBe(2);
      expect(stored.find((c) => c.name === 'Snacks')?.order).toBe(3);
      expect(stored.find((c) => c.name === 'Galletas')?.order).toBe(1);
    });

    it('inserting at max+1 leaves every existing category order untouched', () => {
      seedCategories([
        makeCategory('c1', { name: 'Bebidas', order: 1 }),
        makeCategory('c2', { name: 'Snacks', order: 2 }),
      ]);
      const repository = new ProductCategoryRepository(storeId);

      repository.addProductCategory('Galletas', 3, true);

      const stored = readStoredCategories();
      expect(stored.find((c) => c.name === 'Bebidas')?.order).toBe(1);
      expect(stored.find((c) => c.name === 'Snacks')?.order).toBe(2);
      expect(stored.find((c) => c.name === 'Galletas')?.order).toBe(3);
    });
  });
```

- [ ] **Step 2: Run the tests**

```bash
cd frontend-react/apps/web-store-pos && npx vitest run app/sales/lib/repositories/__tests__/product-category-repository.test.ts -t "sibling shift"
```

Expected: **PASS on the first run** — both pin existing repository behavior. The first test documents the defect being fixed at the modal layer; the second documents the payoff. If either FAILS, stop and report: the design's account of `updateCategoriesOrder` is wrong.

- [ ] **Step 3: Commit**

```bash
git add frontend-react/apps/web-store-pos/app/sales/lib/repositories/__tests__/product-category-repository.test.ts
git commit -m "test(sales): pin the category sibling-order shift on insert"
```

---

### Task 4: `EditProductCategoryModal` accepts `defaultOrder`

The modal stops hardcoding `'1'` and renders the value it is given. `products.tsx` passes a literal `1` for now — Task 5 replaces it with the resolved value. Behavior after this task is identical to today; only the source of the number moves.

**Files:**
- Modify: `apps/web-store-pos/app/sales/components/edit-product-category-modal.tsx:7-21`
- Modify: `apps/web-store-pos/app/sales/routes/products.tsx:504-510`
- Test: `apps/web-store-pos/app/sales/components/__tests__/edit-product-category-modal.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `EditProductCategoryModal` prop `defaultOrder: number` (required). Task 5 supplies it from route state.

- [ ] **Step 1: Write the failing tests**

Append this `describe` block at the end of `edit-product-category-modal.test.tsx`:

```tsx
describe('EditProductCategoryModal — default order', () => {
  it('prefills the order field with defaultOrder in create-mode', () => {
    render(
      <Wrapper>
        <EditProductCategoryModal defaultOrder={8} onSave={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByTestId('category-order-input')).toHaveValue(8);
  });

  it('submits defaultOrder untouched when the user only types a name', () => {
    const onSave = vi.fn();
    render(
      <Wrapper>
        <EditProductCategoryModal defaultOrder={8} onSave={onSave} onClose={vi.fn()} />
      </Wrapper>,
    );
    fireEvent.change(screen.getByTestId('category-name-input'), { target: { value: 'Galletas' } });
    fireEvent.click(screen.getByTestId('category-save-button'));
    expect(onSave).toHaveBeenCalledWith({ id: undefined, name: 'Galletas', order: 8, isActive: true });
  });

  it('ignores defaultOrder in edit-mode and shows the category own order', () => {
    render(
      <Wrapper>
        <EditProductCategoryModal
          category={{ id: 'cat-1', name: 'Bebidas', order: 3, isActive: true }}
          defaultOrder={99}
          onSave={vi.fn()}
          onClose={vi.fn()}
        />
      </Wrapper>,
    );
    expect(screen.getByTestId('category-order-input')).toHaveValue(3);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd frontend-react/apps/web-store-pos && npx vitest run app/sales/components/__tests__/edit-product-category-modal.test.tsx -t "default order"
```

Expected: FAIL — the first test reports the input has value `1`, not `8`, because the prop is ignored.

- [ ] **Step 3: Add the prop and use it**

In `apps/web-store-pos/app/sales/components/edit-product-category-modal.tsx`, replace lines 7-21 with:

```tsx
interface EditProductCategoryModalProps {
  category?: ProductCategory;
  /**
   * Create-mode prefill for `Orden`, resolved by the caller as
   * `ProductCategoryService.getMaxOrder() + 1` so a new category lands last. Ignored in
   * edit-mode, which shows the category's own order. Angular patches this value into the
   * form after opening (edit-product-category-modal.component.ts:37-39); React resolves it
   * before opening, matching the sibling CreateProductModal.
   */
  defaultOrder: number;
  onSave: (category: { name: string; order: number; isActive: boolean; id?: string }) => void;
  onClose: () => void;
}

export function EditProductCategoryModal({
  category,
  defaultOrder,
  onSave,
  onClose,
}: EditProductCategoryModalProps) {
  const intl = useIntl();
  const isEditing = !!category;

  const [form, setForm] = useState({
    name: category?.name ?? '',
    order: category?.order.toString() ?? defaultOrder.toString(),
    isActive: category?.isActive ?? true,
  });
```

- [ ] **Step 4: Add the required prop to the existing render sites**

`defaultOrder` is required, so the 11 pre-existing `<EditProductCategoryModal ... />` renders in `edit-product-category-modal.test.tsx` no longer typecheck. Add `defaultOrder={1}` to each one — `1` is the value they got implicitly before, so **no existing assertion changes**.

```bash
cd frontend-react && rg -c "<EditProductCategoryModal" apps/web-store-pos/app/sales/components/__tests__/edit-product-category-modal.test.tsx
```

Expected after editing: every occurrence carries either `defaultOrder={1}` or the explicit value used by the Step 1 tests.

In `apps/web-store-pos/app/sales/routes/products.tsx`, lines 504-510, pass the temporary literal:

```tsx
      {modal?.type === 'category' && (
        <EditProductCategoryModal
          category={modal.category}
          defaultOrder={1}
          onSave={handleCategorySave}
          onClose={() => setModal(null)}
        />
      )}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd frontend-react/apps/web-store-pos && npx vitest run app/sales/components/__tests__/edit-product-category-modal.test.tsx
```

Expected: PASS, all blocks including the pre-existing validation/focus/footer ones.

- [ ] **Step 6: Typecheck**

```bash
cd frontend-react && npx turbo run typecheck --force
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend-react/apps/web-store-pos/app/sales/components frontend-react/apps/web-store-pos/app/sales/routes/products.tsx
git commit -m "feat(sales): let EditProductCategoryModal take its create-mode default order"
```

---

### Task 5: The route resolves `max + 1` before opening the modal

Replaces the temporary literal from Task 4 with the real value.

**Files:**
- Modify: `apps/web-store-pos/app/sales/routes/products.tsx:33-38,377,449,504-510`
- Test: `apps/web-store-pos/app/sales/routes/__tests__/products.test.tsx:129-135,658-724`

**Interfaces:**
- Consumes: `EditProductCategoryModal` prop `defaultOrder: number` (Task 4); `ProductCategoryService.getMaxOrder(): Promise<BaseResponseModel<number>>` (Task 2 pinned it).
- Produces: final behavior. Nothing downstream.

- [ ] **Step 1: Add `getMaxOrder` to the mocked category service**

`products.test.tsx:129-135` mocks `ProductCategoryOfflineService` with only three methods. The route is about to call a fourth, so **every existing test that opens the category modal would die on `categoryService.getMaxOrder is not a function`** before reaching its own assertions. Add the spy first.

In the `categoryServiceSpies` hoisted block (line 81), add:

```ts
  getMaxOrder: vi.fn<() => Promise<BaseResponseModel<number>>>(async () => ({
    data: 0,
    succeeded: true,
    message: '',
    actionCode: 200,
    errors: [],
  })),
```

In the `vi.mock('~/sales/lib/services/product-category-offline-service', ...)` factory (line 129), add:

```ts
    getMaxOrder: categoryServiceSpies.getMaxOrder,
```

In `beforeEach` (after line 215's `updateProductCategory` reset), add:

```ts
    categoryServiceSpies.getMaxOrder.mockClear();
    categoryServiceSpies.getMaxOrder.mockResolvedValue({
      data: 0,
      succeeded: true,
      message: '',
      actionCode: 200,
      errors: [],
    });
```

- [ ] **Step 2: Write the failing tests**

Append these three `it` blocks inside the existing `describe('handleCategorySave — Angular async category-C parity', ...)` block:

```tsx
    // Angular parity (edit-product-category-modal.component.ts:37-39): create-mode resolves the
    // GLOBAL max category order and prefills Orden with data+1, so the new category lands last.
    it('awaits categoryService.getMaxOrder() and prefills Orden with max+1', async () => {
      categoryServiceSpies.getMaxOrder.mockResolvedValueOnce({
        data: 4,
        succeeded: true,
        message: '',
        actionCode: 200,
        errors: [],
      });

      render(
        <Wrapper>
          <ProductsPage />
        </Wrapper>,
      );

      fireEvent.click(screen.getByTestId('add-category-button'));

      await waitFor(() => expect(categoryServiceSpies.getMaxOrder).toHaveBeenCalled());
      expect(await screen.findByTestId('category-order-input')).toHaveValue(5);
    });

    // The one that matters: the value must reach the service, not just the screen.
    it('calls createProductCategory with max+1 when the user never touches the order field', async () => {
      categoryServiceSpies.getMaxOrder.mockResolvedValueOnce({
        data: 6,
        succeeded: true,
        message: '',
        actionCode: 200,
        errors: [],
      });

      render(
        <Wrapper>
          <ProductsPage />
        </Wrapper>,
      );

      fireEvent.click(screen.getByTestId('add-category-button'));
      fireEvent.change(await screen.findByTestId('category-name-input'), { target: { value: 'Galletas' } });
      fireEvent.click(screen.getByTestId('category-save-button'));

      await waitFor(() =>
        expect(categoryServiceSpies.createProductCategory).toHaveBeenCalledWith('Galletas', 7, true),
      );
    });

    it('does NOT consult getMaxOrder when editing — the category keeps its own order', async () => {
      mockCategories = [makeCategory({ order: 3 })];
      render(
        <Wrapper>
          <ProductsPage />
        </Wrapper>,
      );

      fireEvent.click(await screen.findByTestId('category-actions-toggle-cat-1'));
      fireEvent.click(screen.getByTestId('edit-category-button'));

      expect(await screen.findByTestId('category-order-input')).toHaveValue(3);
      expect(categoryServiceSpies.getMaxOrder).not.toHaveBeenCalled();
    });
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
cd frontend-react/apps/web-store-pos && npx vitest run app/sales/routes/__tests__/products.test.tsx -t "handleCategorySave"
```

Expected: FAIL — the first reports the input has value `1` instead of `5` and `getMaxOrder` was never called; the second reports `createProductCategory` was called with `1` instead of `7`.

- [ ] **Step 4: Wire the route**

In `apps/web-store-pos/app/sales/routes/products.tsx`, change the `Modal` union member (line 37):

```ts
  | { type: 'category'; category?: ProductCategory; defaultOrder: number }
```

Add `handleAddCategory` immediately after `handleAddProduct` (after line 97):

```tsx
  // --- Add category (opens the create modal) ---
  // Angular parity (edit-product-category-modal.component.ts:37-39): create-mode prefills Orden
  // with the GLOBAL max category order + 1. Resolved here rather than inside the modal, matching
  // handleAddProduct above. This is not cosmetic: addProductCategoryData shifts every sibling
  // with `order >= order` by +1 (product-category-repository.ts:133-137), so the old hardcoded
  // `1` rewrote the order of EVERY existing category on each create. At max+1 that loop is a
  // no-op. Note the scope difference from handleAddProduct: this max is store-wide across all
  // categories, not per-category.
  async function handleAddCategory() {
    const maxOrderResult = await categoryService.getMaxOrder();
    setModal({ type: 'category', defaultOrder: (maxOrderResult.data ?? 0) + 1 });
  }
```

Change the header FAB (line 377):

```tsx
            <Button variant="fab" onClick={handleAddCategory} data-testid="add-category-button">
```

Change the edit entry point (line 449) — `defaultOrder` is required by the union but unused in edit-mode, which reads `category.order`:

```tsx
                    onEditCategory={() => setModal({ type: 'category', category, defaultOrder: category.order })}
```

Replace the temporary literal from Task 4 (lines 504-510):

```tsx
      {modal?.type === 'category' && (
        <EditProductCategoryModal
          category={modal.category}
          defaultOrder={modal.defaultOrder}
          onSave={handleCategorySave}
          onClose={() => setModal(null)}
        />
      )}
```

- [ ] **Step 5: Run the new tests to verify they pass**

```bash
cd frontend-react/apps/web-store-pos && npx vitest run app/sales/routes/__tests__/products.test.tsx -t "handleCategorySave"
```

Expected: PASS.

- [ ] **Step 6: Fix the pre-existing tests that opened the modal synchronously**

Opening the create-category modal is now async, so `fireEvent.click(add-category-button)` no longer renders the modal in the same tick. Two pre-existing tests in the same `describe` query the modal synchronously right after the click and will fail with "Unable to find an element by: [data-testid='category-name-input']".

These are **unit tests, not E2E** — allowed to change. The edit is minimal: `screen.getByTestId` → `await screen.findByTestId` on the first query after the click. Assertions are untouched.

In `calls createProductCategory(name, order, isActive) and reloads on create` (line ~668):

```tsx
      fireEvent.click(screen.getByTestId('add-category-button'));
      fireEvent.change(await screen.findByTestId('category-name-input'), { target: { value: 'Snacks' } });
      fireEvent.click(screen.getByTestId('category-save-button'));
```

In `surfaces a failure via showBlockingError and keeps the modal open ...` (line ~714):

```tsx
      fireEvent.click(screen.getByTestId('add-category-button'));
      fireEvent.change(await screen.findByTestId('category-name-input'), { target: { value: 'Bebidas' } });
      fireEvent.click(screen.getByTestId('category-save-button'));
```

The first of these asserts `createProductCategory` is called with order `1`. That stays correct: `getMaxOrder` defaults to `data: 0`, so `0 + 1 = 1`. Do not change that assertion — it is the empty-store case the design says must not shift.

The FAB-label test at line 262 only reads the button's text and never opens the modal; leave it alone.

- [ ] **Step 7: Run the full route suite**

```bash
cd frontend-react/apps/web-store-pos && npx vitest run app/sales/routes/__tests__/products.test.tsx
```

Expected: PASS, every block.

- [ ] **Step 8: Full gate**

```bash
cd frontend-react && npx turbo run typecheck --force
```

```bash
cd frontend-react && npx turbo run test --force
```

Expected: PASS. Report the actual totals — do not claim green without the output.

- [ ] **Step 9: Commit**

```bash
git add frontend-react/apps/web-store-pos/app/sales/routes
git commit -m "fix(sales): default a new category order to max+1 so it lands last"
```

---

## Verification checklist

- [ ] `rg -n "productService\.getMaxOrder\b" frontend-react/apps frontend-react/packages` → no output.
- [ ] `rg -n "getMaxOrder" frontend-react/e2e` → no output (no E2E file was touched).
- [ ] `npx turbo run typecheck --force` passes.
- [ ] `npx turbo run test --force` passes; totals reported in the completion message.
- [ ] Creating a category in a store with categories at orders 1, 2, 3 prefills `Orden` with `4` and leaves the three existing orders unchanged.
- [ ] Creating a category in an empty store still prefills `1`.
- [ ] Editing a category still shows that category's own order.
- [ ] Adding a product still prefills the per-category product max + 1 — behavior unchanged, name changed.

## Out of scope

Do not touch these, even if they look adjacent:

- Product ordering behavior. Task 1 is a rename with no semantic change.
- `backend/src/Infrastructure/Persistence/Repositories/ProductRepository.cs:52-57`, which returns `max + 1` from the repository while the frontend adds another `+ 1`. Dead under `USE_ONLINE_SERVICE: false`. Recorded in the design, not fixed here.
- The `updateCategoriesOrder` shift semantics. Task 3 pins them; nothing changes them.
- Backend, database, and API contracts.
- Any Playwright spec or backend E2E test.
