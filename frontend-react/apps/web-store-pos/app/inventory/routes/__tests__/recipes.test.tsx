import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import { ProductCategoryRepository } from '~/sales/lib/repositories/product-category-repository';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';
import { RecipeOfflineService } from '../../lib/services/recipe-offline-service';
import { RecipesPage } from '../recipes';

const storeId = 's1';

// ─── auth store mock (selector + getState for audit stamping) ────────────────
const mockUser = vi.hoisted(() => ({
  selectedStoreId: 's1',
  login: 'jdoe',
  isOwnerAdmin: true,
  featureIds: [120],
}));

vi.mock('~/shared/lib/stores/auth-store', () => {
  const state = { user: mockUser, isAuthenticated: true };
  const useAuthStore = Object.assign(
    vi.fn((selector?: (s: typeof state) => unknown) => {
      if (typeof selector === 'function') return selector(state);
      return state;
    }),
    { getState: () => ({ user: mockUser }) },
  );
  return { useAuthStore };
});

vi.mock('~/auth/routes/loaders', () => ({
  featureLoader: () => vi.fn().mockResolvedValue(null),
}));

const showBlockingErrorMock = vi.hoisted(() => vi.fn());
const confirmDialogMock = vi.hoisted(() => vi.fn().mockResolvedValue(true));
vi.mock('~/shared/lib/blocking-alert', () => ({
  showBlockingError: (...args: unknown[]) => showBlockingErrorMock(...args),
  confirmDialog: (...args: unknown[]) => confirmDialogMock(...args),
}));

const showToastSuccessMock = vi.hoisted(() => vi.fn());
vi.mock('~/shared/lib/toast', () => ({
  showToastSuccess: (...args: unknown[]) => showToastSuccessMock(...args),
}));

// ─── seed helpers (real services, localStorage) ──────────────────────────────

function seedProduct(productRepo: ProductRepository, id: string, name: string, categoryId: string) {
  productRepo.addImportedProduct({
    id,
    name,
    categoryId,
    categoryName: categoryId,
    price: 700,
    order: 1,
    availableToSale: true,
    discountFromInvantory: true,
    businessId: storeId,
    isActive: true,
    createdDate: new Date(),
    createdByName: 'test',
  });
}

function seedProducts(): ProductRepository {
  const categoryRepo = new ProductCategoryRepository(storeId);
  categoryRepo.addImportedProductCategory({
    id: 'cat-elaborados',
    name: 'Elaborados',
    order: 1,
    isActive: true,
  });
  const productRepo = new ProductRepository(storeId, categoryRepo);
  seedProduct(productRepo, 'pan', 'Pan de 500g', 'cat-elaborados');
  seedProduct(productRepo, 'harina', 'Harina', 'cat-elaborados');
  seedProduct(productRepo, 'sal', 'Sal', 'cat-elaborados');
  return productRepo;
}

function seedRecipe(): { recipeId: string; productRepo: ProductRepository } {
  const productRepo = seedProducts();

  const recipeService = new RecipeOfflineService(storeId, productRepo);
  const result = recipeService.addRecipe({
    productId: 'pan',
    outputQty: 20,
    components: [{ productId: 'harina', qty: 3, scrapPct: 2 }],
    laborCost: 50,
    overheadPct: 10,
  });
  expect(result.succeeded).toBe(true);
  return { recipeId: result.data!.id, productRepo };
}

function renderPage() {
  return render(
    <IntlProvider locale="es" messages={esMessages}>
      <RecipesPage />
    </IntlProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  showBlockingErrorMock.mockClear();
  showToastSuccessMock.mockClear();
  confirmDialogMock.mockReset();
  confirmDialogMock.mockResolvedValue(true);
});

describe('RecipesPage — Recetas (feature 120)', () => {
  it('renders the recipes list grouped by the finished product category', () => {
    const { recipeId } = seedRecipe();
    renderPage();

    // Collapsed panels per category: reveal the category panel first.
    fireEvent.click(screen.getByTestId('recipe-category-toggle-cat-elaborados'));

    expect(screen.getByTestId(`recipe-row-${recipeId}`).textContent).toContain('Pan de 500g');
    expect(screen.getByTestId(`recipe-row-${recipeId}`).textContent).toContain('1 componente');
  });

  it('validates the recipe form and saves a complete recipe', async () => {
    seedProducts();
    renderPage();

    fireEvent.click(screen.getByTestId('recipe-new'));
    const save = screen.getByTestId('recipe-save') as HTMLButtonElement;
    expect(save.disabled).toBe(true);

    fireEvent.change(screen.getByTestId('recipe-product'), { target: { value: 'pan' } });
    fireEvent.change(screen.getByTestId('recipe-output-qty'), { target: { value: '20' } });
    // No ingredient yet → still invalid.
    expect(save.disabled).toBe(true);

    fireEvent.change(screen.getByTestId('recipe-component-product-0'), {
      target: { value: 'harina' },
    });
    fireEvent.change(screen.getByTestId('recipe-component-qty-0'), { target: { value: '3' } });
    expect(save.disabled).toBe(false);

    fireEvent.click(save);

    await waitFor(() => {
      const service = new RecipeOfflineService(
        storeId,
        new ProductRepository(storeId, new ProductCategoryRepository(storeId)),
      );
      expect(service.getStorageRecipes()).toHaveLength(1);
    });
    expect(showToastSuccessMock).toHaveBeenCalled();
  });

  it('deactivates a recipe after the confirm dialog', async () => {
    const { recipeId } = seedRecipe();
    renderPage();

    fireEvent.click(screen.getByTestId('recipe-category-toggle-cat-elaborados'));
    fireEvent.click(screen.getByTestId(`recipe-deactivate-${recipeId}`));

    await waitFor(() => {
      expect(confirmDialogMock).toHaveBeenCalled();
    });

    const productRepo = new ProductRepository(
      storeId,
      new ProductCategoryRepository(storeId),
    );
    const service = new RecipeOfflineService(storeId, productRepo);
    await waitFor(() => {
      expect(service.getRecipeById(recipeId)!.isActive).toBe(false);
    });
    expect(showToastSuccessMock).toHaveBeenCalled();
  });

  it('keeps the recipe active when the confirm dialog is cancelled', async () => {
    confirmDialogMock.mockResolvedValue(false);
    const { recipeId } = seedRecipe();
    renderPage();

    fireEvent.click(screen.getByTestId('recipe-category-toggle-cat-elaborados'));
    fireEvent.click(screen.getByTestId(`recipe-deactivate-${recipeId}`));

    await waitFor(() => {
      expect(confirmDialogMock).toHaveBeenCalled();
    });

    const service = new RecipeOfflineService(
      storeId,
      new ProductRepository(storeId, new ProductCategoryRepository(storeId)),
    );
    expect(service.getRecipeById(recipeId)!.isActive).toBe(true);
    expect(showToastSuccessMock).not.toHaveBeenCalled();
  });

  it('shows the empty state when there are no recipes', () => {
    renderPage();
    expect(screen.getByText('No hay recetas creadas. Crea una para comenzar.')).toBeTruthy();
  });

  it('edits an existing recipe: the modal prefills, save uses the update path and shows the UPDATED toast', async () => {
    const { recipeId } = seedRecipe();
    renderPage();

    fireEvent.click(screen.getByTestId('recipe-category-toggle-cat-elaborados'));
    fireEvent.click(screen.getByTestId(`recipe-edit-${recipeId}`));

    // The modal opens prefilled from the stored recipe.
    expect(screen.getByTestId('recipe-modal')).toBeTruthy();
    expect((screen.getByTestId('recipe-product') as HTMLSelectElement).value).toBe('pan');
    expect((screen.getByTestId('recipe-output-qty') as HTMLInputElement).value).toBe('20');
    expect((screen.getByTestId('recipe-component-product-0') as HTMLSelectElement).value).toBe(
      'harina',
    );
    expect((screen.getByTestId('recipe-component-qty-0') as HTMLInputElement).value).toBe('3');
    expect((screen.getByTestId('recipe-labor-cost') as HTMLInputElement).value).toBe('50');
    expect((screen.getByTestId('recipe-overhead-pct') as HTMLInputElement).value).toBe('10');

    fireEvent.change(screen.getByTestId('recipe-output-qty'), { target: { value: '30' } });
    fireEvent.click(screen.getByTestId('recipe-save'));

    const service = new RecipeOfflineService(
      storeId,
      new ProductRepository(storeId, new ProductCategoryRepository(storeId)),
    );
    await waitFor(() => {
      expect(service.getRecipeById(recipeId)?.outputQty).toBe(30);
    });

    // Update path: the same recipe id, no second row, still active.
    expect(service.getStorageRecipes()).toHaveLength(1);
    expect(service.getRecipeById(recipeId)!.isActive).toBe(true);
    expect(showToastSuccessMock).toHaveBeenCalledWith('Receta actualizada.');
  });
});
