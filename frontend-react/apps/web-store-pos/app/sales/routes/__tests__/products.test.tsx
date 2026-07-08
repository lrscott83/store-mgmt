import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { BaseResponseModel, Product, ProductCategory } from '@store-mgmt/domain';

// --- Mutable in-memory fixtures, controlled per-test ---
let mockCategories: ProductCategory[] = [];
let mockProducts: Product[] = [];

vi.mock('~/shared/lib/stores/auth-store', () => {
  const state = { user: { selectedStoreId: 's1', login: 'jdoe' }, isAuthenticated: true };
  const useAuthStore = vi.fn((selector?: (s: typeof state) => unknown) => {
    if (typeof selector === 'function') return selector(state);
    return state;
  });
  return { useAuthStore };
});

// Hoisted so the mock factory below (which runs before module-scope const
// declarations) and the tests can both reference the same spy instances —
// lets tests inspect ProductOfflineService.create's call args directly.
const productServiceSpies = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('~/sales/lib/services/product-offline-service', () => ({
  ProductOfflineService: vi.fn().mockImplementation(() => ({
    getAll: vi.fn(() => mockProducts),
    create: productServiceSpies.create,
    update: productServiceSpies.update,
    updateMany: productServiceSpies.updateMany,
    delete: productServiceSpies.delete,
  })),
}));

// Async category-C surface (Phase 2 slice 5) — createProductCategory/updateProductCategory
// resolve BaseResponseModel envelopes, never reject. Tests set `.mockResolvedValueOnce(...)`
// per case; the default here is an always-succeeding envelope.
const categoryServiceSpies = vi.hoisted(() => ({
  createProductCategory: vi.fn<() => Promise<BaseResponseModel<boolean>>>(async () => ({
    data: true,
    succeeded: true,
    message: '',
    actionCode: 200,
    errors: [],
  })),
  updateProductCategory: vi.fn<() => Promise<BaseResponseModel<boolean>>>(async () => ({
    data: true,
    succeeded: true,
    message: '',
    actionCode: 200,
    errors: [],
  })),
}));

vi.mock('~/sales/lib/services/product-category-offline-service', () => ({
  ProductCategoryOfflineService: vi.fn().mockImplementation(() => ({
    getAll: vi.fn(() => mockCategories),
    createProductCategory: categoryServiceSpies.createProductCategory,
    updateProductCategory: categoryServiceSpies.updateProductCategory,
  })),
}));

// handleCsvImport's interim shape (spec.md) goes directly through ProductCategoryRepository,
// bypassing the service (categoryService.getByName/addByName no longer exist).
const categoryRepositorySpies = vi.hoisted(() => ({
  getProductCategoryByName: vi.fn((name: string) => mockCategories.find((c) => c.name === name)),
  addProductCategoryByName: vi.fn(() => 'new-cat-id'),
  getProductCategoryById: vi.fn((id: string) => mockCategories.find((c) => c.id === id)),
}));

vi.mock('~/sales/lib/repositories/product-category-repository', () => ({
  ProductCategoryRepository: vi.fn().mockImplementation(() => ({
    getProductCategoryByName: categoryRepositorySpies.getProductCategoryByName,
    addProductCategoryByName: categoryRepositorySpies.addProductCategoryByName,
    getProductCategoryById: categoryRepositorySpies.getProductCategoryById,
  })),
}));

const showBlockingErrorMock = vi.fn();
vi.mock('~/shared/lib/blocking-alert', () => ({
  showBlockingError: (...args: unknown[]) => showBlockingErrorMock(...args),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

function makeCategory(overrides: Partial<ProductCategory> = {}): ProductCategory {
  return { id: 'cat-1', name: 'Bebidas', order: 1, isActive: true, ...overrides };
}

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'prod-1',
    name: 'Coca Cola',
    categoryId: 'cat-1',
    categoryName: 'Bebidas',
    price: 1.5,
    order: 1,
    availableToSale: true,
    discountFromInvantory: false,
    businessId: 'biz-1',
    isActive: true,
    createdDate: new Date('2025-01-01'),
    createdByName: 'test',
    ...overrides,
  };
}

// --- ProductsPage ---
import { ProductsPage } from '../products';

describe('ProductsPage — strict Angular parity (products.component.html)', () => {
  beforeEach(() => {
    mockCategories = [];
    mockProducts = [];
    productServiceSpies.create.mockClear();
    productServiceSpies.update.mockClear();
    productServiceSpies.updateMany.mockClear();
    productServiceSpies.delete.mockClear();
    categoryServiceSpies.createProductCategory.mockClear();
    categoryServiceSpies.createProductCategory.mockResolvedValue({
      data: true,
      succeeded: true,
      message: '',
      actionCode: 200,
      errors: [],
    });
    categoryServiceSpies.updateProductCategory.mockClear();
    categoryServiceSpies.updateProductCategory.mockResolvedValue({
      data: true,
      succeeded: true,
      message: '',
      actionCode: 200,
      errors: [],
    });
    categoryRepositorySpies.getProductCategoryByName.mockClear();
    categoryRepositorySpies.addProductCategoryByName.mockClear();
    categoryRepositorySpies.addProductCategoryByName.mockReturnValue('new-cat-id');
    categoryRepositorySpies.getProductCategoryById.mockClear();
    showBlockingErrorMock.mockClear();
  });

  it('renders the card title "Productos" (PRODUCT.PRODUCTS)', () => {
    render(
      <Wrapper>
        <ProductsPage />
      </Wrapper>,
    );
    expect(screen.getByText('Productos')).toBeInTheDocument();
  });

  it('renders a single header "+ Categoría" FAB (PRODUCT_CATEGORY.NEW_PRODUCT_CATEGORY)', () => {
    render(
      <Wrapper>
        <ProductsPage />
      </Wrapper>,
    );
    const button = screen.getByTestId('add-category-button');
    expect(button).toHaveTextContent('Categoría');
  });

  it('shows the category-driven info-box when there are no categories', () => {
    render(
      <Wrapper>
        <ProductsPage />
      </Wrapper>,
    );
    // PRODUCT_CATEGORY.NEW_PRODUCT_CATEGORY_ALERT_MESSAGE
    expect(
      screen.getByText('Para adicionar un producto debe primero adicionar una categoría'),
    ).toBeInTheDocument();
  });

  it('hides the info-box once a category exists', () => {
    mockCategories = [makeCategory()];
    render(
      <Wrapper>
        <ProductsPage />
      </Wrapper>,
    );
    expect(
      screen.queryByText('Para adicionar un producto debe primero adicionar una categoría'),
    ).not.toBeInTheDocument();
  });

  it('renders the "Importar Productos" FAB (PRODUCT_CATEGORY.IMPORT_PRODUCTS)', () => {
    render(
      <Wrapper>
        <ProductsPage />
      </Wrapper>,
    );
    const button = screen.getByTestId('import-csv-button');
    expect(button).toHaveTextContent('Importar Productos');
  });

  it('renders one collapsed accordion panel per category with a product-count badge', () => {
    mockCategories = [makeCategory()];
    mockProducts = [makeProduct()];

    render(
      <Wrapper>
        <ProductsPage />
      </Wrapper>,
    );

    expect(screen.getByText('Bebidas')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    // collapsed by default -> product name not visible yet
    expect(screen.queryByText('Coca Cola')).not.toBeInTheDocument();
  });

  it('expands a category panel on click to reveal its products', () => {
    mockCategories = [makeCategory()];
    mockProducts = [makeProduct()];

    render(
      <Wrapper>
        <ProductsPage />
      </Wrapper>,
    );

    fireEvent.click(screen.getByTestId('category-panel-toggle-cat-1'));
    expect(screen.getByText('Coca Cola')).toBeInTheDocument();
  });

  it('shows the per-category empty state inside an expanded panel with no products', () => {
    mockCategories = [makeCategory()];
    mockProducts = [];

    render(
      <Wrapper>
        <ProductsPage />
      </Wrapper>,
    );

    fireEvent.click(screen.getByTestId('category-panel-toggle-cat-1'));
    // PRODUCT_CATEGORY.NO_PRODUCT_FOUND
    expect(screen.getByText('No hay productos en esta categoría.')).toBeInTheDocument();
  });

  it('does NOT render a page-level bulk-edit ("Edición masiva") button', () => {
    render(
      <Wrapper>
        <ProductsPage />
      </Wrapper>,
    );
    expect(screen.queryByTestId('bulk-edit-button')).not.toBeInTheDocument();
    expect(screen.queryByText('Edición masiva')).not.toBeInTheDocument();
  });

  it('does NOT render a page-level "Crear producto" button', () => {
    render(
      <Wrapper>
        <ProductsPage />
      </Wrapper>,
    );
    expect(screen.queryByTestId('create-product-button')).not.toBeInTheDocument();
  });

  it('does NOT render a page-level search input', () => {
    render(
      <Wrapper>
        <ProductsPage />
      </Wrapper>,
    );
    expect(screen.queryByTestId('products-search-input')).not.toBeInTheDocument();
  });

  // Angular parity (audit-user-threading-followup): the route MUST NOT supply
  // audit fields anymore — ProductOfflineService.create owns createdByName/
  // createdDate stamping internally.
  it('does not pass a hardcoded createdByName on create (service owns stamping)', () => {
    mockCategories = [makeCategory()];

    render(
      <Wrapper>
        <ProductsPage />
      </Wrapper>,
    );

    fireEvent.click(screen.getByTestId('category-panel-toggle-cat-1'));
    fireEvent.click(screen.getByTestId('add-product-button'));

    fireEvent.change(screen.getByTestId('product-name-input'), { target: { value: 'Sprite' } });
    fireEvent.change(screen.getByTestId('product-price-input'), { target: { value: '2.5' } });
    fireEvent.click(screen.getByTestId('create-product-submit'));

    expect(productServiceSpies.create).toHaveBeenCalledTimes(1);
    const payload = productServiceSpies.create.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('createdByName');
    expect(payload).not.toHaveProperty('createdDate');
  });

  // Angular parity (edit-product-category-modal.component.ts:50-63): creating a category
  // calls createProductCategory(name, order, isActive) directly — no fetch-then-save steps.
  describe('handleCategorySave — Angular async category-C parity', () => {
    it('calls createProductCategory(name, order, isActive) and reloads on create', async () => {
      render(
        <Wrapper>
          <ProductsPage />
        </Wrapper>,
      );

      fireEvent.click(screen.getByTestId('add-category-button'));
      fireEvent.change(screen.getByTestId('category-name-input'), { target: { value: 'Snacks' } });
      fireEvent.click(screen.getByTestId('category-save-button'));

      await waitFor(() =>
        expect(categoryServiceSpies.createProductCategory).toHaveBeenCalledWith('Snacks', 1, true),
      );
      expect(categoryServiceSpies.updateProductCategory).not.toHaveBeenCalled();
      // Modal closes on success.
      await waitFor(() => expect(screen.queryByTestId('category-name-input')).not.toBeInTheDocument());
    });

    it('calls updateProductCategory(id, name, order, isActive) directly (no getById+save two-step) on edit', async () => {
      mockCategories = [makeCategory()];
      render(
        <Wrapper>
          <ProductsPage />
        </Wrapper>,
      );

      fireEvent.click(screen.getByTestId('category-panel-toggle-cat-1'));
      fireEvent.click(screen.getByTestId('edit-category-button'));
      fireEvent.change(screen.getByTestId('category-name-input'), { target: { value: 'Bebidas Frías' } });
      fireEvent.click(screen.getByTestId('category-save-button'));

      await waitFor(() =>
        expect(categoryServiceSpies.updateProductCategory).toHaveBeenCalledWith('cat-1', 'Bebidas Frías', 1, true),
      );
      expect(categoryServiceSpies.createProductCategory).not.toHaveBeenCalled();
    });

    it('surfaces a failure via showBlockingError and keeps the modal open (does not silently swallow it)', async () => {
      categoryServiceSpies.createProductCategory.mockResolvedValueOnce({
        data: null,
        succeeded: false,
        message: '',
        actionCode: 400,
        errors: [{ code: 'ProductCategory.NameExists', description: 'El nombre de la categoría ya existe.' }],
      } as unknown as BaseResponseModel<boolean>);

      render(
        <Wrapper>
          <ProductsPage />
        </Wrapper>,
      );

      fireEvent.click(screen.getByTestId('add-category-button'));
      fireEvent.change(screen.getByTestId('category-name-input'), { target: { value: 'Bebidas' } });
      fireEvent.click(screen.getByTestId('category-save-button'));

      await waitFor(() =>
        expect(showBlockingErrorMock).toHaveBeenCalledWith('Error', 'El nombre de la categoría ya existe.'),
      );
      // Modal stays open on failure — not force-closed.
      expect(screen.getByTestId('category-name-input')).toBeInTheDocument();
    });
  });

  // Interim shape (spec.md): category lookup/create for CSV rows goes through
  // ProductCategoryRepository directly (categoryService.getByName/addByName removed).
  describe('handleCsvImport — interim ProductCategoryRepository call site', () => {
    function makeCsvFile(): File {
      return new File(['name,price,category\nChips,10,Snacks'], 'products.csv', { type: 'text/csv' });
    }

    it('creates a missing category via ProductCategoryRepository.addProductCategoryByName and uses it on the product', async () => {
      categoryRepositorySpies.getProductCategoryByName.mockReturnValueOnce(undefined);
      categoryRepositorySpies.getProductCategoryById.mockReturnValueOnce({
        id: 'new-cat-id',
        name: 'Snacks',
        order: 2,
        isActive: true,
      });

      render(
        <Wrapper>
          <ProductsPage />
        </Wrapper>,
      );

      fireEvent.click(screen.getByTestId('import-csv-button'));
      fireEvent.change(screen.getByTestId('csv-file-input'), { target: { files: [makeCsvFile()] } });
      await waitFor(() => expect(screen.getByTestId('csv-import-button')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('csv-import-button'));

      await waitFor(() => expect(productServiceSpies.create).toHaveBeenCalledTimes(1));
      expect(categoryRepositorySpies.getProductCategoryByName).toHaveBeenCalledWith('Snacks');
      expect(categoryRepositorySpies.addProductCategoryByName).toHaveBeenCalledWith('Snacks');
      const payload = productServiceSpies.create.mock.calls[0][0] as Record<string, unknown>;
      expect(payload.categoryId).toBe('new-cat-id');
      expect(payload.categoryName).toBe('Snacks');
    });

    it('reuses an existing category via ProductCategoryRepository.getProductCategoryByName without creating a new one', async () => {
      categoryRepositorySpies.getProductCategoryByName.mockReturnValueOnce({
        id: 'existing-cat-id',
        name: 'Snacks',
        order: 1,
        isActive: true,
      });
      categoryRepositorySpies.getProductCategoryById.mockReturnValueOnce({
        id: 'existing-cat-id',
        name: 'Snacks',
        order: 1,
        isActive: true,
      });

      render(
        <Wrapper>
          <ProductsPage />
        </Wrapper>,
      );

      fireEvent.click(screen.getByTestId('import-csv-button'));
      fireEvent.change(screen.getByTestId('csv-file-input'), { target: { files: [makeCsvFile()] } });
      await waitFor(() => expect(screen.getByTestId('csv-import-button')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('csv-import-button'));

      await waitFor(() => expect(productServiceSpies.create).toHaveBeenCalledTimes(1));
      expect(categoryRepositorySpies.addProductCategoryByName).not.toHaveBeenCalled();
      const payload = productServiceSpies.create.mock.calls[0][0] as Record<string, unknown>;
      expect(payload.categoryId).toBe('existing-cat-id');
    });
  });
});
