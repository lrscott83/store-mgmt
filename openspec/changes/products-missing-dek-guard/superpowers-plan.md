# Guard products.tsx Against a Swallowed MissingDataKeyError Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When any of `products.tsx`'s eight guardable call sites — `loadData()`'s mount effect, `handleAddProduct`, `handleAddCategory`, and the five mutation handlers (`handleCreateProduct`, `handleEditProduct`, `handleDeactivateProduct`, `handleBulkSave`, `handleCategorySave`) — hit a `MissingDataKeyError` (no encryption key in memory), the user sees an accurate blocking error message and stays on the page, instead of today's silent no-op with an unhandled promise rejection in the console.

**Architecture:** A new, narrowly-scoped async helper (`runGuardedAgainstMissingDek`) catches specifically `MissingDataKeyError` and calls the app's existing `showBlockingError` primitive; any other error re-throws unchanged. Task 2 wires it onto the three read-only call sites. Task 3 wires it onto the five mutation handlers, each with TWO guards — one around the mutating service call (mirrors Task 2's shape: nothing persisted, modal stays open), one around the trailing `loadData()` repaint (mirrors `handleClearData`'s own established `succeeded`-flag idiom: the mutation already succeeded, only the repaint failed). `loadData()`'s own body and `handleClearData`'s existing, unrelated `try/catch` around it are untouched throughout.

**Tech Stack:** React 19 + react-router, TypeScript, Vitest + @testing-library/react, pnpm workspaces + Turborepo.

Design: [`openspec/changes/products-missing-dek-guard/superpowers-design.md`](./superpowers-design.md)

## Global Constraints

- **Never modify, delete, rename, skip, or weaken an existing E2E test or E2E support file** (`frontend-react/e2e/**`, `backend/src/SMCA.WebApi.E2ETests/**`) without explicit user authorization. This change adds unit tests only; no task below touches `e2e/`. If an E2E file turns out to be in the way: stop, name the file, explain, ask.
- **Do not run Playwright or `dotnet`.** The agent runs frontend Vitest only. The user runs Playwright and .NET locally.
- Unit-test files touched by these tasks are allowed to change; they are not E2E.
- Commit messages: conventional commits, **no `Co-Authored-By` and no AI attribution**.
- Run gates with `--force`: `npx turbo run test --force`. A cached replay is not evidence.
- Working directory for all commands: `frontend-react/`.
- All code, comments, identifiers, and commit messages in English. UI strings come from the existing i18n catalogue or match `handleClearData`'s established raw-Spanish-literal convention (`products.tsx:353-374`) — no new i18n message ids.
- The guard catches **only** `MissingDataKeyError` and re-throws everything else — never widen it to a blanket `catch`.
- `loadData()` (`products.tsx:62-76`) and `handleClearData`'s existing `try { await loadData() } catch { repainted = false }` (`products.tsx:346-351`) are **not modified** by this change.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `apps/web-store-pos/app/shared/lib/storage/run-guarded-against-missing-dek.ts` | The guard: catch `MissingDataKeyError`, show the blocking error; re-throw anything else | 1 |
| `apps/web-store-pos/app/shared/lib/storage/__tests__/run-guarded-against-missing-dek.test.ts` | Unit tests for the guard in isolation | 1 |
| `apps/web-store-pos/app/sales/routes/products.tsx` | Wires the guard onto the three read-only call sites (Task 2) and the five mutation handlers (Task 3) | 2, 3 |
| `apps/web-store-pos/app/sales/routes/__tests__/products.test.tsx` | Route-level tests proving each call site is guarded | 2, 3 |

---

### Task 1: The `runGuardedAgainstMissingDek` helper

A standalone async wrapper with no dependency on `products.tsx`. Task 2 imports it.

**Files:**
- Create: `apps/web-store-pos/app/shared/lib/storage/run-guarded-against-missing-dek.ts`
- Test: `apps/web-store-pos/app/shared/lib/storage/__tests__/run-guarded-against-missing-dek.test.ts`

**Interfaces:**
- Consumes: `MissingDataKeyError` (already exists, `apps/web-store-pos/app/shared/lib/storage/entity-crypto.ts:25-30`, no-arg constructor); `showBlockingError` (already exists, `apps/web-store-pos/app/shared/lib/blocking-alert.ts:20-22`, signature `(title: string, message: string): void`).
- Produces: `runGuardedAgainstMissingDek(fn: () => Promise<void>, title: string, message: string): Promise<void>` — resolves whether `fn` succeeds or throws `MissingDataKeyError` (calling `showBlockingError(title, message)` in the latter case); rejects with the original error for anything else. Task 2 imports this from `~/shared/lib/storage/run-guarded-against-missing-dek`.

- [ ] **Step 1: Write the failing tests**

Create `apps/web-store-pos/app/shared/lib/storage/__tests__/run-guarded-against-missing-dek.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { MissingDataKeyError } from '../entity-crypto';

const showBlockingErrorMock = vi.fn();
vi.mock('../../blocking-alert', () => ({
  showBlockingError: (...args: unknown[]) => showBlockingErrorMock(...args),
}));

import { runGuardedAgainstMissingDek } from '../run-guarded-against-missing-dek';

describe('runGuardedAgainstMissingDek', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('runs fn and does not call showBlockingError when fn resolves', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);

    await runGuardedAgainstMissingDek(fn, 'Error', 'message');

    expect(fn).toHaveBeenCalledTimes(1);
    expect(showBlockingErrorMock).not.toHaveBeenCalled();
  });

  it('catches a MissingDataKeyError and calls showBlockingError with the given title/message', async () => {
    const fn = vi.fn().mockRejectedValue(new MissingDataKeyError());

    await expect(
      runGuardedAgainstMissingDek(fn, 'Error', 'No se pudieron cargar los datos. Recargue la página.'),
    ).resolves.toBeUndefined();

    expect(showBlockingErrorMock).toHaveBeenCalledWith(
      'Error',
      'No se pudieron cargar los datos. Recargue la página.',
    );
  });

  it('re-throws any other error and does not call showBlockingError', async () => {
    const otherError = new Error('boom');
    const fn = vi.fn().mockRejectedValue(otherError);

    await expect(runGuardedAgainstMissingDek(fn, 'Error', 'message')).rejects.toBe(otherError);

    expect(showBlockingErrorMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd frontend-react/apps/web-store-pos && npx vitest run app/shared/lib/storage/__tests__/run-guarded-against-missing-dek.test.ts
```

Expected: FAIL — `Cannot find module '../run-guarded-against-missing-dek'` (the source file does not exist yet).

- [ ] **Step 3: Write the implementation**

Create `apps/web-store-pos/app/shared/lib/storage/run-guarded-against-missing-dek.ts`:

```ts
import { MissingDataKeyError } from './entity-crypto';
import { showBlockingError } from '../blocking-alert';

/**
 * Wraps an async call that is typed to never reject but can, in practice, throw
 * `MissingDataKeyError` when encryption is provisioned and no data key is in memory
 * (`entity-crypto.ts`'s `decryptEntity`/`encryptEntity`). Surfaces that one failure mode as a
 * blocking error instead of an unhandled promise rejection; any other error re-throws
 * unchanged, so an unrelated bug is never silently relabeled "reload the page".
 */
export async function runGuardedAgainstMissingDek(
  fn: () => Promise<void>,
  title: string,
  message: string,
): Promise<void> {
  try {
    await fn();
  } catch (err) {
    if (!(err instanceof MissingDataKeyError)) throw err;
    showBlockingError(title, message);
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd frontend-react/apps/web-store-pos && npx vitest run app/shared/lib/storage/__tests__/run-guarded-against-missing-dek.test.ts
```

Expected: PASS, 3/3.

- [ ] **Step 5: Typecheck**

```bash
cd frontend-react && npx turbo run typecheck --force
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend-react/apps/web-store-pos/app/shared/lib/storage/run-guarded-against-missing-dek.ts frontend-react/apps/web-store-pos/app/shared/lib/storage/__tests__/run-guarded-against-missing-dek.test.ts
git commit -m "feat(shared): add a guard for MissingDataKeyError leaking out of resolve-never-reject services"
```

---

### Task 2: Wire the guard onto `products.tsx`'s three call sites

**Files:**
- Modify: `apps/web-store-pos/app/sales/routes/products.tsx:16` (new import), `:62-80` (mount `useEffect`), `:94-97` (`handleAddProduct`), `:107-110` (`handleAddCategory`)
- Test: `apps/web-store-pos/app/sales/routes/__tests__/products.test.tsx`

**Interfaces:**
- Consumes: `runGuardedAgainstMissingDek(fn: () => Promise<void>, title: string, message: string): Promise<void>` (Task 1, `~/shared/lib/storage/run-guarded-against-missing-dek`).
- Produces: final behavior. Nothing downstream.

- [ ] **Step 1: Write the failing tests**

Open `apps/web-store-pos/app/sales/routes/__tests__/products.test.tsx`. Add the import near the top, alongside the other `~/shared/lib/*` imports (e.g. next to the existing `import esMessages from '~/shared/lib/i18n/es';` at line 4):

```ts
import { MissingDataKeyError } from '~/shared/lib/storage/entity-crypto';
```

Insert the following new `describe` block after line 672's closing `});` (the end of the `'surfaces a failure via showBlockingError...'` test) and before line 674's comment (`// Angular parity (edit-product-category-modal.component.ts:50-63): ...`) that precedes `describe('handleCategorySave — Angular async category-C parity', ...)`:

```tsx
  // products-missing-dek-guard: all three services here are typed "resolve, never reject"
  // (ProductService/ProductCategoryService doc comments), but the underlying repository call
  // can throw MissingDataKeyError when encryption is provisioned and no data key is in memory.
  // Each of these three call sites must surface that specific failure as a blocking error
  // instead of the silent no-op an unhandled promise rejection produces today.
  describe('MissingDataKeyError guard — loadData/handleAddProduct/handleAddCategory', () => {
    it('shows a blocking error instead of leaving the catalog silently empty when loadData throws on mount', async () => {
      categoryServiceSpies.getProductCategoriesView.mockRejectedValueOnce(new MissingDataKeyError());

      render(
        <Wrapper>
          <ProductsPage />
        </Wrapper>,
      );

      await waitFor(() =>
        expect(showBlockingErrorMock).toHaveBeenCalledWith(
          'Error',
          'No se pudieron cargar los datos. Recargue la página.',
        ),
      );
    });

    it('shows a blocking error instead of a silent no-op when getMaxOrderByCategoryId throws', async () => {
      mockCategories = [makeCategory()];
      productServiceSpies.getMaxOrderByCategoryId.mockRejectedValueOnce(new MissingDataKeyError());

      render(
        <Wrapper>
          <ProductsPage />
        </Wrapper>,
      );

      fireEvent.click(await screen.findByTestId('category-actions-toggle-cat-1'));
      fireEvent.click(screen.getByTestId('add-product-button'));

      await waitFor(() =>
        expect(showBlockingErrorMock).toHaveBeenCalledWith(
          'Error',
          'No se pudo abrir el formulario. Recargue la página.',
        ),
      );
      // The guard caught the failure before setModal ran — the create-product modal must not open.
      expect(screen.queryByTestId('product-name-input')).not.toBeInTheDocument();
    });

    it('shows a blocking error instead of a silent no-op when categoryService.getMaxOrder throws', async () => {
      categoryServiceSpies.getMaxOrder.mockRejectedValueOnce(new MissingDataKeyError());

      render(
        <Wrapper>
          <ProductsPage />
        </Wrapper>,
      );

      fireEvent.click(screen.getByTestId('add-category-button'));

      await waitFor(() =>
        expect(showBlockingErrorMock).toHaveBeenCalledWith(
          'Error',
          'No se pudo abrir el formulario. Recargue la página.',
        ),
      );
      // The guard caught the failure before setModal ran — the create-category modal must not open.
      expect(screen.queryByTestId('category-name-input')).not.toBeInTheDocument();
    });
  });

```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd frontend-react/apps/web-store-pos && npx vitest run app/sales/routes/__tests__/products.test.tsx -t "MissingDataKeyError guard"
```

Expected: FAIL, 3/3 — `showBlockingErrorMock` was never called (today's code has no guard, so the rejection is unhandled and `showBlockingError` is never reached). The first test may also print an unhandled-rejection warning to stderr; that warning disappearing after Step 4 is part of the fix.

- [ ] **Step 3: Wire the three call sites**

In `apps/web-store-pos/app/sales/routes/products.tsx`, add the import after line 16 (`import { clearStoreData } from '~/shared/lib/storage/store-data-reset';`):

```ts
import { runGuardedAgainstMissingDek } from '~/shared/lib/storage/run-guarded-against-missing-dek';
```

Replace the mount `useEffect` (lines 77-80):

```tsx
  useEffect(() => {
    runGuardedAgainstMissingDek(
      loadData,
      intl.formatMessage({ id: 'GENERAL.ERROR' }),
      'No se pudieron cargar los datos. Recargue la página.',
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps -- loadData reads only storeId
  }, [storeId]);
```

Replace `handleAddProduct` (lines 94-97):

```tsx
  async function handleAddProduct(category: ProductCategory) {
    await runGuardedAgainstMissingDek(
      async () => {
        const maxOrderResult = await productService.getMaxOrderByCategoryId(category.id);
        setModal({ type: 'create', category, defaultOrder: (maxOrderResult.data ?? 0) + 1 });
      },
      intl.formatMessage({ id: 'GENERAL.ERROR' }),
      'No se pudo abrir el formulario. Recargue la página.',
    );
  }
```

Replace `handleAddCategory` (lines 107-110):

```tsx
  async function handleAddCategory() {
    await runGuardedAgainstMissingDek(
      async () => {
        const maxOrderResult = await categoryService.getMaxOrder();
        setModal({ type: 'category', defaultOrder: (maxOrderResult.data ?? 0) + 1 });
      },
      intl.formatMessage({ id: 'GENERAL.ERROR' }),
      'No se pudo abrir el formulario. Recargue la página.',
    );
  }
```

Do not touch `loadData()`'s own body (lines 62-76) or `handleClearData`'s `try { await loadData() } catch { repainted = false }` (lines 346-351, unchanged by this edit but renumbered by the lines added above — locate by content, not line number, when verifying).

- [ ] **Step 4: Run the new tests to verify they pass**

```bash
cd frontend-react/apps/web-store-pos && npx vitest run app/sales/routes/__tests__/products.test.tsx -t "MissingDataKeyError guard"
```

Expected: PASS, 3/3, no unhandled-rejection warning in the output.

- [ ] **Step 5: Run the full route suite to confirm no pre-existing test broke**

```bash
cd frontend-react/apps/web-store-pos && npx vitest run app/sales/routes/__tests__/products.test.tsx
```

Expected: PASS, every block — including the two `handleClearData` repaint-failure tests (`products.test.tsx:1346-1372` and neighbors), which exercise `loadData()`'s OWN try/catch and must be completely unaffected by this change.

- [ ] **Step 6: Full gate**

```bash
cd frontend-react && npx turbo run typecheck --force
```

```bash
cd frontend-react && npx turbo run test --force
```

Expected: PASS. Report the actual totals — do not claim green without the output.

- [ ] **Step 7: Commit**

```bash
git add frontend-react/apps/web-store-pos/app/sales/routes
git commit -m "fix(sales): guard products.tsx's three call sites against a swallowed MissingDataKeyError"
```

---

### Task 3: Guard the five sibling mutation handlers

`handleCreateProduct`, `handleEditProduct`, `handleDeactivateProduct`, `handleBulkSave`, and `handleCategorySave` each await a mutating service call and then fire a bare, unguarded `loadData()` repaint. Every mutating repository write calls `encryptEntity` synchronously before `localStorage.setItem`, so a missing DEK throws there exactly like the three already-fixed reads — nothing persists, no partial-mutation state exists (see the design's "The five sibling mutation handlers" section for the full trace). Each handler gets TWO guards: one around the mutating call (mirrors Task 2's shape), one around the trailing repaint (mirrors `handleClearData`'s own `succeeded`-flag idiom). `handleClearData` itself is not touched.

**Files:**
- Modify: `apps/web-store-pos/app/sales/routes/products.tsx:134-161` (`handleCreateProduct`), `:166-188` (`handleEditProduct`), `:202-214` (`handleDeactivateProduct`), `:221-231` (`handleBulkSave`), `:239-251` (`handleCategorySave`)
- Test: `apps/web-store-pos/app/sales/routes/__tests__/products.test.tsx`

**Interfaces:**
- Consumes: `runGuardedAgainstMissingDek(fn: () => Promise<void>, title: string, message: string): Promise<void>` (Task 1, `~/shared/lib/storage/run-guarded-against-missing-dek`, already imported by Task 2's edits to this same file).
- Produces: final behavior. Nothing downstream.

- [ ] **Step 1: Write the failing tests**

Line numbers below describe content that exists NOW at those approximate positions after Task 2's edits — verify by reading the actual current file before editing, and locate by the code shown, not by blind line-number editing.

Add the following ten tests to `apps/web-store-pos/app/sales/routes/__tests__/products.test.tsx`. Each is placed inside the `describe` block whose existing tests exercise the same handler (do not create new top-level `describe` blocks — these are siblings of tests you have already read while working this plan).

**Next to `'calls createProduct with positional args carrying the modal order/isActive (service owns audit stamping)'`** (currently ends around line 462), add:

```tsx
  it('shows a blocking error and keeps the modal open when createProduct throws MissingDataKeyError', async () => {
    mockCategories = [makeCategory()];
    productServiceSpies.createProduct.mockRejectedValueOnce(new MissingDataKeyError());

    render(
      <Wrapper>
        <ProductsPage />
      </Wrapper>,
    );

    fireEvent.click(await screen.findByTestId('category-actions-toggle-cat-1'));
    fireEvent.click(screen.getByTestId('add-product-button'));
    fireEvent.change(await screen.findByTestId('product-name-input'), { target: { value: 'Sprite' } });
    fireEvent.change(screen.getByTestId('product-price-input'), { target: { value: '2.5' } });
    fireEvent.click(screen.getByTestId('create-product-submit'));

    await waitFor(() =>
      expect(showBlockingErrorMock).toHaveBeenCalledWith(
        'Error',
        'No se pudo guardar el producto. Recargue la página.',
      ),
    );
    // The mutation guard caught the failure — the modal must stay open, same as a domain failure.
    expect(screen.getByTestId('product-name-input')).toBeInTheDocument();
  });

  it('shows a blocking error and closes the modal when the post-create repaint throws MissingDataKeyError', async () => {
    mockCategories = [makeCategory()];

    render(
      <Wrapper>
        <ProductsPage />
      </Wrapper>,
    );
    // Let the initial mount's loadData() resolve normally before queuing the rejection —
    // otherwise the Once rejection would be consumed by the mount call instead of the
    // create-triggered repaint this test targets.
    expect(await screen.findByText('Bebidas')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('category-actions-toggle-cat-1'));
    fireEvent.click(screen.getByTestId('add-product-button'));
    fireEvent.change(await screen.findByTestId('product-name-input'), { target: { value: 'Sprite' } });
    fireEvent.change(screen.getByTestId('product-price-input'), { target: { value: '2.5' } });
    categoryServiceSpies.getProductCategoriesView.mockRejectedValueOnce(new MissingDataKeyError());
    fireEvent.click(screen.getByTestId('create-product-submit'));

    await waitFor(() =>
      expect(showBlockingErrorMock).toHaveBeenCalledWith(
        'Error',
        'El producto fue guardado, pero no se pudo actualizar la vista. Recargue la página.',
      ),
    );
    // The mutation itself succeeded — the modal closes even though the repaint failed.
    expect(screen.queryByTestId('product-name-input')).not.toBeInTheDocument();
  });
```

**Next to `'calls updateProduct with the edited product positional args (WU4.2)'`** (currently ends around line 488), add:

```tsx
  it('shows a blocking error and keeps the modal open when updateProduct throws MissingDataKeyError', async () => {
    mockCategories = [makeCategory()];
    mockProducts = [makeProduct()];
    productServiceSpies.updateProduct.mockRejectedValueOnce(new MissingDataKeyError());

    render(
      <Wrapper>
        <ProductsPage />
      </Wrapper>,
    );

    fireEvent.click(await screen.findByTestId('category-panel-toggle-cat-1'));
    fireEvent.click(await screen.findByLabelText('Acciones'));
    fireEvent.click(screen.getByText('Editar Producto'));
    fireEvent.change(screen.getByTestId('edit-product-name-input'), { target: { value: 'Coca Cola Zero' } });
    fireEvent.click(screen.getByTestId('edit-product-submit'));

    await waitFor(() =>
      expect(showBlockingErrorMock).toHaveBeenCalledWith(
        'Error',
        'No se pudo actualizar el producto. Recargue la página.',
      ),
    );
    expect(screen.getByTestId('edit-product-name-input')).toBeInTheDocument();
  });

  it('shows a blocking error and closes the modal when the post-edit repaint throws MissingDataKeyError', async () => {
    mockCategories = [makeCategory()];
    mockProducts = [makeProduct()];

    render(
      <Wrapper>
        <ProductsPage />
      </Wrapper>,
    );
    expect(await screen.findByText('Bebidas')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('category-panel-toggle-cat-1'));
    fireEvent.click(await screen.findByLabelText('Acciones'));
    fireEvent.click(screen.getByText('Editar Producto'));
    fireEvent.change(screen.getByTestId('edit-product-name-input'), { target: { value: 'Coca Cola Zero' } });
    categoryServiceSpies.getProductCategoriesView.mockRejectedValueOnce(new MissingDataKeyError());
    fireEvent.click(screen.getByTestId('edit-product-submit'));

    await waitFor(() =>
      expect(showBlockingErrorMock).toHaveBeenCalledWith(
        'Error',
        'El producto fue actualizado, pero no se pudo actualizar la vista. Recargue la página.',
      ),
    );
    expect(screen.queryByTestId('edit-product-name-input')).not.toBeInTheDocument();
  });
```

**Next to `'confirms via confirmDialog with the hardcoded "desactivar" copy, then calls deleteProduct(id)'`** (currently ends around line 564), add:

```tsx
  it('shows a blocking error when deleteProduct throws MissingDataKeyError', async () => {
    mockCategories = [makeCategory()];
    mockProducts = [makeProduct()];
    productServiceSpies.deleteProduct.mockRejectedValueOnce(new MissingDataKeyError());

    render(
      <Wrapper>
        <ProductsPage />
      </Wrapper>,
    );

    fireEvent.click(await screen.findByTestId('category-panel-toggle-cat-1'));
    fireEvent.click(await screen.findByLabelText('Acciones'));
    fireEvent.click(screen.getByText('Desactivar Producto'));

    await waitFor(() =>
      expect(showBlockingErrorMock).toHaveBeenCalledWith(
        'Error',
        'No se pudo desactivar el producto. Recargue la página.',
      ),
    );
  });

  it('shows a blocking error when the post-deactivate repaint throws MissingDataKeyError', async () => {
    mockCategories = [makeCategory()];
    mockProducts = [makeProduct()];

    render(
      <Wrapper>
        <ProductsPage />
      </Wrapper>,
    );
    expect(await screen.findByText('Bebidas')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('category-panel-toggle-cat-1'));
    fireEvent.click(await screen.findByLabelText('Acciones'));
    categoryServiceSpies.getProductCategoriesView.mockRejectedValueOnce(new MissingDataKeyError());
    fireEvent.click(screen.getByText('Desactivar Producto'));

    await waitFor(() =>
      expect(showBlockingErrorMock).toHaveBeenCalledWith(
        'Error',
        'El producto fue desactivado, pero no se pudo actualizar la vista. Recargue la página.',
      ),
    );
  });
```

**Next to `'calls createProducts(categoryId, items) for the filled rows and reloads the list'`** (currently ends around line 609), add:

```tsx
  it('shows a blocking error and keeps the modal open when createProducts throws MissingDataKeyError', async () => {
    mockCategories = [makeCategory()];
    mockProducts = [makeProduct()];
    productServiceSpies.createProducts.mockRejectedValueOnce(new MissingDataKeyError());

    render(
      <Wrapper>
        <ProductsPage />
      </Wrapper>,
    );

    fireEvent.click(await screen.findByTestId('category-actions-toggle-cat-1'));
    fireEvent.click(screen.getByTestId('add-products-button'));
    fireEvent.change(await screen.findByTestId('product-name-0'), { target: { value: 'Fanta' } });
    fireEvent.change(await screen.findByTestId('product-price-0'), { target: { value: '9.99' } });
    fireEvent.click(screen.getByTestId('bulk-save-button'));

    await waitFor(() =>
      expect(showBlockingErrorMock).toHaveBeenCalledWith(
        'Error',
        'No se pudieron guardar los productos. Recargue la página.',
      ),
    );
    expect(screen.getByTestId('bulk-save-button')).toBeInTheDocument();
  });

  it('shows a blocking error and closes the modal when the post-bulk-save repaint throws MissingDataKeyError', async () => {
    mockCategories = [makeCategory()];
    mockProducts = [makeProduct()];

    render(
      <Wrapper>
        <ProductsPage />
      </Wrapper>,
    );
    expect(await screen.findByText('Bebidas')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('category-actions-toggle-cat-1'));
    fireEvent.click(screen.getByTestId('add-products-button'));
    fireEvent.change(await screen.findByTestId('product-name-0'), { target: { value: 'Fanta' } });
    fireEvent.change(await screen.findByTestId('product-price-0'), { target: { value: '9.99' } });
    categoryServiceSpies.getProductCategoriesView.mockRejectedValueOnce(new MissingDataKeyError());
    fireEvent.click(screen.getByTestId('bulk-save-button'));

    await waitFor(() =>
      expect(showBlockingErrorMock).toHaveBeenCalledWith(
        'Error',
        'Los productos fueron guardados, pero no se pudo actualizar la vista. Recargue la página.',
      ),
    );
    expect(screen.queryByTestId('bulk-save-button')).not.toBeInTheDocument();
  });
```

**Next to `'calls createProductCategory(name, order, isActive) and reloads on create'`** (inside `describe('handleCategorySave — Angular async category-C parity', ...)`, currently ends around line 764), add:

```tsx
    it('shows a blocking error and keeps the modal open when createProductCategory throws MissingDataKeyError', async () => {
      categoryServiceSpies.createProductCategory.mockRejectedValueOnce(new MissingDataKeyError());

      render(
        <Wrapper>
          <ProductsPage />
        </Wrapper>,
      );

      fireEvent.click(screen.getByTestId('add-category-button'));
      fireEvent.change(await screen.findByTestId('category-name-input'), { target: { value: 'Snacks' } });
      fireEvent.click(screen.getByTestId('category-save-button'));

      await waitFor(() =>
        expect(showBlockingErrorMock).toHaveBeenCalledWith(
          'Error',
          'No se pudo guardar la categoría. Recargue la página.',
        ),
      );
      expect(screen.getByTestId('category-name-input')).toBeInTheDocument();
    });

    it('shows a blocking error and closes the modal when the post-category-save repaint throws MissingDataKeyError', async () => {
      render(
        <Wrapper>
          <ProductsPage />
        </Wrapper>,
      );

      fireEvent.click(screen.getByTestId('add-category-button'));
      fireEvent.change(await screen.findByTestId('category-name-input'), { target: { value: 'Snacks' } });
      categoryServiceSpies.getProductCategoriesView.mockRejectedValueOnce(new MissingDataKeyError());
      fireEvent.click(screen.getByTestId('category-save-button'));

      await waitFor(() =>
        expect(showBlockingErrorMock).toHaveBeenCalledWith(
          'Error',
          'La categoría fue guardada, pero no se pudo actualizar la vista. Recargue la página.',
        ),
      );
      expect(screen.queryByTestId('category-name-input')).not.toBeInTheDocument();
    });
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd frontend-react/apps/web-store-pos && npx vitest run app/sales/routes/__tests__/products.test.tsx -t "MissingDataKeyError"
```

Expected: FAIL, all ten new tests — today's code has no guard on any of the five handlers, so `showBlockingErrorMock` is never called with any of these messages (the mutation-guard cases hang on an unhandled rejection instead; the repaint-guard cases succeed the mutation but the bare `loadData()` repaint's rejection is unhandled too).

- [ ] **Step 3: Wire the five handlers**

In `apps/web-store-pos/app/sales/routes/products.tsx`, replace `handleCreateProduct`:

```tsx
  async function handleCreateProduct(data: {
    name: string;
    price: number;
    barcode?: string;
    categoryId: string;
    order: number;
    isActive: boolean;
    availableToSale: boolean;
    discountFromInvantory: boolean;
  }) {
    let succeeded = false;
    await runGuardedAgainstMissingDek(
      async () => {
        const result = await productService.createProduct(
          data.categoryId,
          data.name,
          data.price,
          '',
          data.order,
          data.isActive,
          data.availableToSale,
          data.discountFromInvantory,
          data.barcode,
        );
        if (!result.succeeded) {
          showBlockingError(intl.formatMessage({ id: 'GENERAL.ERROR' }), result.errors[0]?.description ?? '');
          return;
        }
        succeeded = true;
      },
      intl.formatMessage({ id: 'GENERAL.ERROR' }),
      'No se pudo guardar el producto. Recargue la página.',
    );
    if (!succeeded) return;

    setModal(null);
    runGuardedAgainstMissingDek(
      loadData,
      intl.formatMessage({ id: 'GENERAL.ERROR' }),
      'El producto fue guardado, pero no se pudo actualizar la vista. Recargue la página.',
    );
  }
```

Replace `handleEditProduct`:

```tsx
  async function handleEditProduct(product: Product) {
    let succeeded = false;
    await runGuardedAgainstMissingDek(
      async () => {
        const result = await productService.updateProduct(
          product.id,
          product.categoryId,
          product.name,
          product.price,
          product.businessId,
          product.order,
          product.isActive,
          product.availableToSale,
          product.discountFromInvantory,
          // Angular parity (edit-product-modal.component.ts:125): the barcode FormControl is
          // commented out, so `barcodeValue` is ALWAYS undefined on update — even for a product
          // that already has a stored barcode.
          undefined,
        );
        if (!result.succeeded) {
          showBlockingError(intl.formatMessage({ id: 'GENERAL.ERROR' }), result.errors[0]?.description ?? '');
          return;
        }
        succeeded = true;
      },
      intl.formatMessage({ id: 'GENERAL.ERROR' }),
      'No se pudo actualizar el producto. Recargue la página.',
    );
    if (!succeeded) return;

    setModal(null);
    runGuardedAgainstMissingDek(
      loadData,
      intl.formatMessage({ id: 'GENERAL.ERROR' }),
      'El producto fue actualizado, pero no se pudo actualizar la vista. Recargue la página.',
    );
  }
```

Replace `handleDeactivateProduct`:

```tsx
  async function handleDeactivateProduct(id: string) {
    const confirmed = await confirmDialog({
      title: 'Confirmación para desactivar',
      message: '¿Está seguro que desea desactivar este producto?',
      confirmButtonText: intl.formatMessage({ id: 'GENERAL.YES' }),
      cancelButtonText: intl.formatMessage({ id: 'GENERAL.NO' }),
    });
    if (!confirmed) return;

    let succeeded = false;
    await runGuardedAgainstMissingDek(
      async () => {
        await productService.deleteProduct(id);
        succeeded = true;
      },
      intl.formatMessage({ id: 'GENERAL.ERROR' }),
      'No se pudo desactivar el producto. Recargue la página.',
    );
    if (!succeeded) return;

    setModal(null);
    runGuardedAgainstMissingDek(
      loadData,
      intl.formatMessage({ id: 'GENERAL.ERROR' }),
      'El producto fue desactivado, pero no se pudo actualizar la vista. Recargue la página.',
    );
  }
```

Replace `handleBulkSave`:

```tsx
  async function handleBulkSave(categoryId: string, items: { name: string; price: number }[]) {
    let mutationSucceeded = false;
    let domainSucceeded = true;
    await runGuardedAgainstMissingDek(
      async () => {
        const result = await productService.createProducts(categoryId, items);
        mutationSucceeded = true;
        domainSucceeded = result.succeeded;
      },
      intl.formatMessage({ id: 'GENERAL.ERROR' }),
      'No se pudieron guardar los productos. Recargue la página.',
    );
    if (!mutationSucceeded) return;

    setModal(null);
    runGuardedAgainstMissingDek(
      loadData,
      intl.formatMessage({ id: 'GENERAL.ERROR' }),
      'Los productos fueron guardados, pero no se pudo actualizar la vista. Recargue la página.',
    );
    if (!domainSucceeded) {
      showBlockingError(
        intl.formatMessage({ id: 'GENERAL.ERROR' }),
        'Algunos productos no fueron adicionados porque ya existen.',
      );
    }
  }
```

Replace `handleCategorySave`:

```tsx
  async function handleCategorySave(data: { name: string; order: number; isActive: boolean; id?: string }) {
    let succeeded = false;
    await runGuardedAgainstMissingDek(
      async () => {
        const result = data.id
          ? await categoryService.updateProductCategory(data.id, data.name, data.order, data.isActive)
          : await categoryService.createProductCategory(data.name, data.order, data.isActive);

        if (!result.succeeded) {
          showBlockingError(intl.formatMessage({ id: 'GENERAL.ERROR' }), result.errors[0]?.description ?? '');
          return;
        }
        succeeded = true;
      },
      intl.formatMessage({ id: 'GENERAL.ERROR' }),
      'No se pudo guardar la categoría. Recargue la página.',
    );
    if (!succeeded) return;

    setModal(null);
    runGuardedAgainstMissingDek(
      loadData,
      intl.formatMessage({ id: 'GENERAL.ERROR' }),
      'La categoría fue guardada, pero no se pudo actualizar la vista. Recargue la página.',
    );
  }
```

Do not touch `loadData()`'s own body, `handleClearData`, `handleAddProduct`, `handleAddCategory`, `handleCsvImport`, or the mount `useEffect` — none of them are in this task's scope.

- [ ] **Step 4: Run the new tests to verify they pass**

```bash
cd frontend-react/apps/web-store-pos && npx vitest run app/sales/routes/__tests__/products.test.tsx -t "MissingDataKeyError"
```

Expected: PASS, all ten new tests plus the three from Task 2 (thirteen total under this filter).

- [ ] **Step 5: Run the full route suite to confirm no pre-existing test broke**

```bash
cd frontend-react/apps/web-store-pos && npx vitest run app/sales/routes/__tests__/products.test.tsx
```

Expected: PASS, every block. Pay particular attention to `'shows a blocking error when createProducts reports some products already existed, but still closes the modal'` (the pre-existing test around line 614 before this task's edits) — it must still pass unmodified, proving the `MissingDataKeyError` guard and the pre-existing `{succeeded: false}` domain-failure path stayed independent for `handleBulkSave`.

- [ ] **Step 6: Full gate**

```bash
cd frontend-react && npx turbo run typecheck --force
```

```bash
cd frontend-react && npx turbo run test --force
```

Expected: PASS. Report the actual totals — do not claim green without the output.

- [ ] **Step 7: Commit**

```bash
git add frontend-react/apps/web-store-pos/app/sales/routes
git commit -m "fix(sales): guard products.tsx's five mutation handlers against a swallowed MissingDataKeyError"
```

---

### Task 4: Simplify the eight call sites — `runGuardedAgainstMissingDek` returns `Promise<boolean>`

Task 3's review flagged real duplication (Important, plan-mandated): every one of the eight `runGuardedAgainstMissingDek` call sites that needs to know whether it's safe to proceed hoists a mutable `let succeeded = false` flag and assigns it from inside the guarded callback as an out-parameter. Root cause: the helper returns `Promise<void>`. The user chose the fix that addresses the cause — change the helper's contract so the callback reports its own outcome (`Promise<boolean>`) and the wrapper resolves that same boolean straight through, only forcing it to `false` when it catches a `MissingDataKeyError` itself. Every caller that needs the answer becomes `const ok = await runGuardedAgainstMissingDek(...); if (!ok) return;` — no more hoisted flag.

`handleBulkSave` keeps ONE flag (`domainSucceeded`) — that one is not the artifact being removed. It exists because Angular parity requires the modal to close and the repaint to fire even when the mutation resolves with a domain-level `{succeeded: false}` (a different question from "did a `MissingDataKeyError` happen"), so the handler genuinely needs two independent answers out of one call. Every other handler needs only one.

This task changes Task 1's already-merged helper and every call site Tasks 2 and 3 already wired. None of the 13 existing route tests assert on the internal flag — they only assert on `showBlockingErrorMock` calls and modal presence/absence via testid — so none of them should need to change; this task proves that by running them, not by assuming it.

**Files:**
- Modify: `apps/web-store-pos/app/shared/lib/storage/run-guarded-against-missing-dek.ts` (full rewrite)
- Modify: `apps/web-store-pos/app/shared/lib/storage/__tests__/run-guarded-against-missing-dek.test.ts` (full rewrite)
- Modify: `apps/web-store-pos/app/sales/routes/products.tsx` — all eight `runGuardedAgainstMissingDek` call sites (mount `useEffect`, `handleAddProduct`, `handleAddCategory`, `handleCreateProduct`, `handleEditProduct`, `handleDeactivateProduct`, `handleBulkSave`, `handleCategorySave`)

**Interfaces:**
- Produces: `runGuardedAgainstMissingDek(fn: () => Promise<boolean>, title: string, message: string): Promise<boolean>` — `fn` resolving `true`/`false` passes straight through; a caught `MissingDataKeyError` shows the message and forces `false`; any other thrown error re-throws unchanged (unchanged from before).
- Consumes: nothing new.

- [ ] **Step 1: Write the failing tests for the new helper contract**

Replace the entire contents of `apps/web-store-pos/app/shared/lib/storage/__tests__/run-guarded-against-missing-dek.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { MissingDataKeyError } from '../entity-crypto';

const showBlockingErrorMock = vi.fn();
vi.mock('../../blocking-alert', () => ({
  showBlockingError: (...args: unknown[]) => showBlockingErrorMock(...args),
}));

import { runGuardedAgainstMissingDek } from '../run-guarded-against-missing-dek';

describe('runGuardedAgainstMissingDek', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('resolves true and does not call showBlockingError when fn resolves true', async () => {
    const fn = vi.fn().mockResolvedValue(true);

    await expect(runGuardedAgainstMissingDek(fn, 'Error', 'message')).resolves.toBe(true);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(showBlockingErrorMock).not.toHaveBeenCalled();
  });

  it('resolves false and does not call showBlockingError when fn itself resolves false', async () => {
    const fn = vi.fn().mockResolvedValue(false);

    await expect(runGuardedAgainstMissingDek(fn, 'Error', 'message')).resolves.toBe(false);

    expect(showBlockingErrorMock).not.toHaveBeenCalled();
  });

  it('catches a MissingDataKeyError, calls showBlockingError with the given title/message, and resolves false', async () => {
    const fn = vi.fn().mockRejectedValue(new MissingDataKeyError());

    await expect(
      runGuardedAgainstMissingDek(fn, 'Error', 'No se pudieron cargar los datos. Recargue la página.'),
    ).resolves.toBe(false);

    expect(showBlockingErrorMock).toHaveBeenCalledWith(
      'Error',
      'No se pudieron cargar los datos. Recargue la página.',
    );
  });

  it('re-throws any other error and does not call showBlockingError', async () => {
    const otherError = new Error('boom');
    const fn = vi.fn().mockRejectedValue(otherError);

    await expect(runGuardedAgainstMissingDek(fn, 'Error', 'message')).rejects.toBe(otherError);

    expect(showBlockingErrorMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd frontend-react/apps/web-store-pos && npx vitest run app/shared/lib/storage/__tests__/run-guarded-against-missing-dek.test.ts
```

Expected: FAIL — the current implementation resolves `Promise<void>`, so `resolves.toBe(true)`/`resolves.toBe(false)` fail with the actual resolved value being `undefined`.

- [ ] **Step 3: Rewrite the helper**

Replace the entire contents of `apps/web-store-pos/app/shared/lib/storage/run-guarded-against-missing-dek.ts`:

```ts
import { MissingDataKeyError } from './entity-crypto';
import { showBlockingError } from '../blocking-alert';

/**
 * Wraps an async call that is typed to never reject but can, in practice, throw
 * `MissingDataKeyError` when encryption is provisioned and no data key is in memory
 * (`entity-crypto.ts`'s `decryptEntity`/`encryptEntity`). Surfaces that one failure mode as a
 * blocking error instead of an unhandled promise rejection; any other error re-throws
 * unchanged, so an unrelated bug is never silently relabeled "reload the page".
 *
 * `fn` reports its own outcome by returning `true`/`false` (e.g. a domain-level failure it
 * already surfaced itself) — the wrapper resolves that same boolean straight through. Only a
 * caught `MissingDataKeyError` forces the result to `false`, after showing its own message.
 * This lets a caller write `const ok = await runGuardedAgainstMissingDek(...); if (!ok) return;`
 * instead of hoisting a mutable flag that `fn` assigns as an out-parameter.
 */
export async function runGuardedAgainstMissingDek(
  fn: () => Promise<boolean>,
  title: string,
  message: string,
): Promise<boolean> {
  try {
    return await fn();
  } catch (err) {
    if (!(err instanceof MissingDataKeyError)) throw err;
    showBlockingError(title, message);
    return false;
  }
}
```

- [ ] **Step 4: Run the helper tests to verify they pass**

```bash
cd frontend-react/apps/web-store-pos && npx vitest run app/shared/lib/storage/__tests__/run-guarded-against-missing-dek.test.ts
```

Expected: PASS, 4/4.

- [ ] **Step 5: Update all eight call sites in `products.tsx`**

Every call site whose callback previously ended without a `return` statement now needs `return true;` at the end. Every call site that previously set an outer `let succeeded`/`mutationSucceeded` flag now returns that boolean directly from the callback and captures the helper's own return value with `const`.

Replace the mount `useEffect`:

```tsx
  useEffect(() => {
    runGuardedAgainstMissingDek(
      async () => {
        await loadData();
        return true;
      },
      intl.formatMessage({ id: 'GENERAL.ERROR' }),
      'No se pudieron cargar los datos. Recargue la página.',
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps -- loadData reads only storeId
  }, [storeId]);
```

Replace `handleAddProduct`:

```tsx
  async function handleAddProduct(category: ProductCategory) {
    await runGuardedAgainstMissingDek(
      async () => {
        const maxOrderResult = await productService.getMaxOrderByCategoryId(category.id);
        setModal({ type: 'create', category, defaultOrder: (maxOrderResult.data ?? 0) + 1 });
        return true;
      },
      intl.formatMessage({ id: 'GENERAL.ERROR' }),
      'No se pudo abrir el formulario. Recargue la página.',
    );
  }
```

Replace `handleAddCategory`:

```tsx
  async function handleAddCategory() {
    await runGuardedAgainstMissingDek(
      async () => {
        const maxOrderResult = await categoryService.getMaxOrder();
        setModal({ type: 'category', defaultOrder: (maxOrderResult.data ?? 0) + 1 });
        return true;
      },
      intl.formatMessage({ id: 'GENERAL.ERROR' }),
      'No se pudo abrir el formulario. Recargue la página.',
    );
  }
```

Replace `handleCreateProduct`:

```tsx
  async function handleCreateProduct(data: {
    name: string;
    price: number;
    barcode?: string;
    categoryId: string;
    order: number;
    isActive: boolean;
    availableToSale: boolean;
    discountFromInvantory: boolean;
  }) {
    const succeeded = await runGuardedAgainstMissingDek(
      async () => {
        const result = await productService.createProduct(
          data.categoryId,
          data.name,
          data.price,
          '',
          data.order,
          data.isActive,
          data.availableToSale,
          data.discountFromInvantory,
          data.barcode,
        );
        if (!result.succeeded) {
          showBlockingError(intl.formatMessage({ id: 'GENERAL.ERROR' }), result.errors[0]?.description ?? '');
          return false;
        }
        return true;
      },
      intl.formatMessage({ id: 'GENERAL.ERROR' }),
      'No se pudo guardar el producto. Recargue la página.',
    );
    if (!succeeded) return;

    setModal(null);
    runGuardedAgainstMissingDek(
      async () => {
        await loadData();
        return true;
      },
      intl.formatMessage({ id: 'GENERAL.ERROR' }),
      'El producto fue guardado, pero no se pudo actualizar la vista. Recargue la página.',
    );
  }
```

Replace `handleEditProduct`:

```tsx
  async function handleEditProduct(product: Product) {
    const succeeded = await runGuardedAgainstMissingDek(
      async () => {
        const result = await productService.updateProduct(
          product.id,
          product.categoryId,
          product.name,
          product.price,
          product.businessId,
          product.order,
          product.isActive,
          product.availableToSale,
          product.discountFromInvantory,
          // Angular parity (edit-product-modal.component.ts:125): the barcode FormControl is
          // commented out, so `barcodeValue` is ALWAYS undefined on update — even for a product
          // that already has a stored barcode.
          undefined,
        );
        if (!result.succeeded) {
          showBlockingError(intl.formatMessage({ id: 'GENERAL.ERROR' }), result.errors[0]?.description ?? '');
          return false;
        }
        return true;
      },
      intl.formatMessage({ id: 'GENERAL.ERROR' }),
      'No se pudo actualizar el producto. Recargue la página.',
    );
    if (!succeeded) return;

    setModal(null);
    runGuardedAgainstMissingDek(
      async () => {
        await loadData();
        return true;
      },
      intl.formatMessage({ id: 'GENERAL.ERROR' }),
      'El producto fue actualizado, pero no se pudo actualizar la vista. Recargue la página.',
    );
  }
```

Replace `handleDeactivateProduct`:

```tsx
  async function handleDeactivateProduct(id: string) {
    const confirmed = await confirmDialog({
      title: 'Confirmación para desactivar',
      message: '¿Está seguro que desea desactivar este producto?',
      confirmButtonText: intl.formatMessage({ id: 'GENERAL.YES' }),
      cancelButtonText: intl.formatMessage({ id: 'GENERAL.NO' }),
    });
    if (!confirmed) return;

    const succeeded = await runGuardedAgainstMissingDek(
      async () => {
        await productService.deleteProduct(id);
        return true;
      },
      intl.formatMessage({ id: 'GENERAL.ERROR' }),
      'No se pudo desactivar el producto. Recargue la página.',
    );
    if (!succeeded) return;

    setModal(null);
    runGuardedAgainstMissingDek(
      async () => {
        await loadData();
        return true;
      },
      intl.formatMessage({ id: 'GENERAL.ERROR' }),
      'El producto fue desactivado, pero no se pudo actualizar la vista. Recargue la página.',
    );
  }
```

Replace `handleBulkSave` — note `domainSucceeded` is kept; only `mutationSucceeded`'s flag is replaced:

```tsx
  async function handleBulkSave(categoryId: string, items: { name: string; price: number }[]) {
    let domainSucceeded = true;
    const mutationSucceeded = await runGuardedAgainstMissingDek(
      async () => {
        const result = await productService.createProducts(categoryId, items);
        domainSucceeded = result.succeeded;
        return true;
      },
      intl.formatMessage({ id: 'GENERAL.ERROR' }),
      'No se pudieron guardar los productos. Recargue la página.',
    );
    if (!mutationSucceeded) return;

    setModal(null);
    runGuardedAgainstMissingDek(
      async () => {
        await loadData();
        return true;
      },
      intl.formatMessage({ id: 'GENERAL.ERROR' }),
      'Los productos fueron guardados, pero no se pudo actualizar la vista. Recargue la página.',
    );
    if (!domainSucceeded) {
      showBlockingError(
        intl.formatMessage({ id: 'GENERAL.ERROR' }),
        'Algunos productos no fueron adicionados porque ya existen.',
      );
    }
  }
```

Replace `handleCategorySave`:

```tsx
  async function handleCategorySave(data: { name: string; order: number; isActive: boolean; id?: string }) {
    const succeeded = await runGuardedAgainstMissingDek(
      async () => {
        const result = data.id
          ? await categoryService.updateProductCategory(data.id, data.name, data.order, data.isActive)
          : await categoryService.createProductCategory(data.name, data.order, data.isActive);

        if (!result.succeeded) {
          showBlockingError(intl.formatMessage({ id: 'GENERAL.ERROR' }), result.errors[0]?.description ?? '');
          return false;
        }
        return true;
      },
      intl.formatMessage({ id: 'GENERAL.ERROR' }),
      'No se pudo guardar la categoría. Recargue la página.',
    );
    if (!succeeded) return;

    setModal(null);
    runGuardedAgainstMissingDek(
      async () => {
        await loadData();
        return true;
      },
      intl.formatMessage({ id: 'GENERAL.ERROR' }),
      'La categoría fue guardada, pero no se pudo actualizar la vista. Recargue la página.',
    );
  }
```

Do not touch `loadData()`'s own body or `handleClearData` — neither is in this task's scope, and neither calls `runGuardedAgainstMissingDek` directly.

- [ ] **Step 6: Run the full route suite to confirm no pre-existing test broke**

```bash
cd frontend-react/apps/web-store-pos && npx vitest run app/sales/routes/__tests__/products.test.tsx
```

Expected: PASS, all 66 tests (56 pre-Task-3 + 10 from Task 3), byte-for-byte the same assertions as before this task — this task changes no test file under `sales/`.

- [ ] **Step 7: Full gate**

```bash
cd frontend-react && npx turbo run typecheck --force
```

```bash
cd frontend-react && npx turbo run test --force
```

Expected: PASS. Report the actual totals — do not claim green without the output.

- [ ] **Step 8: Commit**

```bash
git add frontend-react/apps/web-store-pos/app/shared/lib/storage/run-guarded-against-missing-dek.ts frontend-react/apps/web-store-pos/app/shared/lib/storage/__tests__/run-guarded-against-missing-dek.test.ts frontend-react/apps/web-store-pos/app/sales/routes/products.tsx
git commit -m "refactor(sales): return a boolean from runGuardedAgainstMissingDek to drop the hoisted succeeded flags"
```

---

## Verification checklist

- [ ] `npx turbo run typecheck --force` passes.
- [ ] `npx turbo run test --force` passes; totals reported in the completion message.
- [ ] `run-guarded-against-missing-dek.test.ts`: 4/4 passing (fn resolves true, fn resolves false, MissingDataKeyError caught, other errors re-thrown).
- [ ] `products.test.tsx`'s new `describe('MissingDataKeyError guard ...')`: 3/3 passing.
- [ ] `products.test.tsx`'s two pre-existing `handleClearData` repaint-failure tests still pass unmodified.
- [ ] `loadData()`'s function body (`products.tsx`) is byte-identical to before this change — only its call sites changed.
- [ ] `handleClearData` (`products.tsx`) is byte-identical to before this change.
- [ ] `rg "getMaxOrder" frontend-react/e2e` → no output (unchanged — no E2E file was touched by this plan).
- [ ] All ten of Task 3's new tests pass, and the pre-existing `handleBulkSave` domain-failure test (`'shows a blocking error when createProducts reports some products already existed, but still closes the modal'`) still passes unmodified.
- [ ] `runGuardedAgainstMissingDek` returns `Promise<boolean>`; no call site outside `handleBulkSave` hoists a mutable `let succeeded`/`mutationSucceeded` flag.
- [ ] `products.test.tsx` has ZERO diff from Task 4 — the refactor changes no test file under `sales/`.

## Out of scope

Do not touch these, even if they look adjacent:

- The other 17 authenticated routes with the same unguarded-`useEffect` shape (`available.tsx`, `sale.tsx`, `orders.tsx`, `credits.tsx`, five `today-*.tsx` files, `entries.tsx`, `egress.tsx`, `expenses-history.tsx`, `today-expenses.tsx`, `today-report.tsx`, `dashboard.tsx`, `landing-deep.tsx`). Each needs its own review of what its empty state means before adopting this guard.
- `authLoader`, the idle-lock timer (`app-layout.tsx`), or `needsUnlock()`. Unrelated navigation-time gates, working as designed.
- Redirecting to `/login?unlock=1` on this failure. Rejected in the design's brainstorm.
- `handleClearData`'s existing three-way error handling (`products.tsx:328-378`). Already correct for its own scenario, not touched by Task 3 either.
- The data-loss hazard in `product-category-repository.ts:237-247` (a `catch {}` that swallows a GCM tag failure with a *valid* DEK, then wipes the map). Different failure class from `MissingDataKeyError`, needs its own design decision, noted in the design doc.
- Any Playwright spec or backend E2E test.
