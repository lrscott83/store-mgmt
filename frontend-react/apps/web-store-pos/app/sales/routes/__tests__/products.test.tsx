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
const okEnvelope = { data: true, succeeded: true, message: '', actionCode: 200, errors: [] };
const productServiceSpies = vi.hoisted(() => ({
  createProduct: vi.fn((..._args: unknown[]) => Promise.resolve({ data: true, succeeded: true, message: '', actionCode: 200, errors: [] })),
  updateProduct: vi.fn((..._args: unknown[]) => Promise.resolve({ data: true, succeeded: true, message: '', actionCode: 200, errors: [] })),
  deleteProduct: vi.fn((..._args: unknown[]) => Promise.resolve({ data: true, succeeded: true, message: '', actionCode: 200, errors: [] })),
  createCsvProducts: vi.fn((..._args: unknown[]) => Promise.resolve({ data: true, succeeded: true, message: '', actionCode: 200, errors: [] })),
}));

vi.mock('~/sales/lib/services/product-offline-service', () => ({
  ProductOfflineService: vi.fn().mockImplementation(() => ({
    getAll: vi.fn(() => mockProducts),
    createProduct: productServiceSpies.createProduct,
    updateProduct: productServiceSpies.updateProduct,
    deleteProduct: productServiceSpies.deleteProduct,
    createCsvProducts: productServiceSpies.createCsvProducts,
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
    productServiceSpies.createProduct.mockClear();
    productServiceSpies.createProduct.mockResolvedValue(okEnvelope);
    productServiceSpies.updateProduct.mockClear();
    productServiceSpies.updateProduct.mockResolvedValue(okEnvelope);
    productServiceSpies.deleteProduct.mockClear();
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
    productServiceSpies.createCsvProducts.mockClear();
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

  // Angular parity (edit-product-modal.component.ts:88-100): create routes through the async
  // createProduct(categoryId, name, price, businessId, order, isActive, availableToSale,
  // discountFromInvantory, barcode?) positional surface — no audit fields (the service owns
  // createdByName/createdDate stamping).
  it('calls createProduct with positional args (service owns audit stamping)', async () => {
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

    await waitFor(() => expect(productServiceSpies.createProduct).toHaveBeenCalledTimes(1));
    const args = productServiceSpies.createProduct.mock.calls[0];
    expect(args[0]).toBe('cat-1'); // categoryId
    expect(args[1]).toBe('Sprite'); // name
    expect(args[2]).toBe(2.5); // price
    expect(args[3]).toBe(''); // businessId
    expect(args[4]).toBe(1); // order
    expect(args[5]).toBe(true); // isActive
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

  // Angular parity (product-offline.service.ts createCsvProducts + csv-product.service.ts
  // validateProducts): the whole file routes through ProductService.createCsvProducts, which
  // resolves/creates categories by NAME internally. Category-less rows are filtered out
  // (Angular's validateProducts). No barcode column (Flag #2 RATIFIED).
  describe('handleCsvImport — ProductService.createCsvProducts call site', () => {
    function makeCsvFile(): File {
      return new File(['name,price,category\nChips,10,Snacks'], 'products.csv', { type: 'text/csv' });
    }

    it('calls createCsvProducts with the parsed {category,name,price} rows', async () => {
      render(
        <Wrapper>
          <ProductsPage />
        </Wrapper>,
      );

      fireEvent.click(screen.getByTestId('import-csv-button'));
      fireEvent.change(screen.getByTestId('csv-file-input'), { target: { files: [makeCsvFile()] } });
      await waitFor(() => expect(screen.getByTestId('csv-import-button')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('csv-import-button'));

      await waitFor(() => expect(productServiceSpies.createCsvProducts).toHaveBeenCalledTimes(1));
      expect(productServiceSpies.createCsvProducts).toHaveBeenCalledWith([
        { category: 'Snacks', name: 'Chips', price: 10 },
      ]);
    });

    it('filters out rows without a category before calling createCsvProducts (Angular validateProducts parity)', async () => {
      render(
        <Wrapper>
          <ProductsPage />
        </Wrapper>,
      );

      fireEvent.click(screen.getByTestId('import-csv-button'));
      fireEvent.change(screen.getByTestId('csv-file-input'), {
        target: {
          files: [new File(['name,price,category\nChips,10,Snacks\nNoCat,5,'], 'products.csv', { type: 'text/csv' })],
        },
      });
      await waitFor(() => expect(screen.getByTestId('csv-import-button')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('csv-import-button'));

      await waitFor(() => expect(productServiceSpies.createCsvProducts).toHaveBeenCalledTimes(1));
      expect(productServiceSpies.createCsvProducts).toHaveBeenCalledWith([
        { category: 'Snacks', name: 'Chips', price: 10 },
      ]);
    });
  });
});
