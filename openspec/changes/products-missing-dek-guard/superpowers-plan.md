# Guard products.tsx Against a Swallowed MissingDataKeyError Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When `loadData()`, `handleAddProduct`, or `handleAddCategory` in `products.tsx` hit a `MissingDataKeyError` (no encryption key in memory), the user sees an accurate blocking error message and stays on the page — instead of today's silent no-op with an unhandled promise rejection in the console.

**Architecture:** A new, narrowly-scoped async helper (`runGuardedAgainstMissingDek`) catches specifically `MissingDataKeyError` and calls the app's existing `showBlockingError` primitive; any other error re-throws unchanged. The three call sites in `products.tsx` are wrapped with it. `loadData()`'s own body and `handleClearData`'s existing, unrelated `try/catch` around it are untouched.

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
| `apps/web-store-pos/app/sales/routes/products.tsx` | Wires the guard onto the three call sites | 2 |
| `apps/web-store-pos/app/sales/routes/__tests__/products.test.tsx` | Route-level tests proving each call site is guarded | 2 |

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

## Verification checklist

- [ ] `npx turbo run typecheck --force` passes.
- [ ] `npx turbo run test --force` passes; totals reported in the completion message.
- [ ] `run-guarded-against-missing-dek.test.ts`: 3/3 passing (success passthrough, MissingDataKeyError caught, other errors re-thrown).
- [ ] `products.test.tsx`'s new `describe('MissingDataKeyError guard ...')`: 3/3 passing.
- [ ] `products.test.tsx`'s two pre-existing `handleClearData` repaint-failure tests still pass unmodified.
- [ ] `loadData()`'s function body (`products.tsx`) is byte-identical to before this change — only its mount-time call site changed.
- [ ] `rg "getMaxOrder" frontend-react/e2e` → no output (unchanged — no E2E file was touched by this plan).

## Out of scope

Do not touch these, even if they look adjacent:

- The other 17 authenticated routes with the same unguarded-`useEffect` shape (`available.tsx`, `sale.tsx`, `orders.tsx`, `credits.tsx`, five `today-*.tsx` files, `entries.tsx`, `egress.tsx`, `expenses-history.tsx`, `today-expenses.tsx`, `today-report.tsx`, `dashboard.tsx`, `landing-deep.tsx`). Each needs its own review of what its empty state means before adopting this guard.
- `authLoader`, the idle-lock timer (`app-layout.tsx`), or `needsUnlock()`. Unrelated navigation-time gates, working as designed.
- Redirecting to `/login?unlock=1` on this failure. Rejected in the design's brainstorm.
- `handleClearData`'s existing three-way error handling (`products.tsx:328-378`). Already correct for its own scenario.
- Any Playwright spec or backend E2E test.
