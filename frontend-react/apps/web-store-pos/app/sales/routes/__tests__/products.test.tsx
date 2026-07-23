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
  createProducts: vi.fn((..._args: unknown[]) => Promise.resolve({ data: true, succeeded: true, message: '', actionCode: 200, errors: [] })),
  getMaxOrder: vi.fn((..._args: unknown[]) => Promise.resolve({ data: 0, succeeded: true, message: '', actionCode: 200, errors: [] })),
}));

const { bm } = vi.hoisted(() => ({
  bm: <T,>(data: T) => ({ data, succeeded: true, message: '', actionCode: 200, errors: [] }),
}));

vi.mock('~/sales/lib/services/product-offline-service', () => ({
  ProductOfflineService: vi.fn().mockImplementation(() => ({
    getAvailableProductsByCategoryId: vi.fn(async (categoryId: string) =>
      bm(mockProducts.filter((p) => p.categoryId === categoryId && p.isActive)),
    ),
    createProduct: productServiceSpies.createProduct,
    updateProduct: productServiceSpies.updateProduct,
    deleteProduct: productServiceSpies.deleteProduct,
    createCsvProducts: productServiceSpies.createCsvProducts,
    createProducts: productServiceSpies.createProducts,
    getMaxOrder: productServiceSpies.getMaxOrder,
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
    getProductCategoriesView: vi.fn(async () =>
      bm(
        mockCategories.map((c) => ({
          ...c,
          productsCount: mockProducts.filter(
            (p) => p.categoryId === c.id && p.isActive && p.availableToSale,
          ).length,
        })),
      ),
    ),
    createProductCategory: categoryServiceSpies.createProductCategory,
    updateProductCategory: categoryServiceSpies.updateProductCategory,
  })),
}));

const showBlockingErrorMock = vi.fn();
const showBlockingInfoMock = vi.fn((..._args: unknown[]) => Promise.resolve());
// Angular parity (category-product-list.component.ts:86-103, onDeleteProduct): a confirmDialog
// Swal gates deleteProduct. Defaults to resolving true so pre-existing delete-flow tests that
// don't care about the confirm step keep passing; tests exercising cancel override this.
const confirmDialogMock = vi.fn((..._args: unknown[]) => Promise.resolve(true));
vi.mock('~/shared/lib/blocking-alert', () => ({
  showBlockingError: (...args: unknown[]) => showBlockingErrorMock(...args),
  showBlockingInfo: (...args: unknown[]) => showBlockingInfoMock(...args),
  confirmDialog: (...args: unknown[]) => confirmDialogMock(...args),
}));

// TOAST-CALLSITES #1 (toast-notifications-parity): CSV import success now fires a toast
// instead of a blocking Swal.
const showToastSuccessMock = vi.hoisted(() => vi.fn());
const showToastErrorMock = vi.hoisted(() => vi.fn());
vi.mock('~/shared/lib/toast', () => ({
  showToastSuccess: (...args: unknown[]) => showToastSuccessMock(...args),
  showToastError: (...args: unknown[]) => showToastErrorMock(...args),
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
    productServiceSpies.createProducts.mockClear();
    productServiceSpies.createProducts.mockResolvedValue(okEnvelope);
    confirmDialogMock.mockClear();
    confirmDialogMock.mockResolvedValue(true);
    productServiceSpies.getMaxOrder.mockClear();
    productServiceSpies.getMaxOrder.mockResolvedValue({ data: 0, succeeded: true, message: '', actionCode: 200, errors: [] });
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
    showBlockingInfoMock.mockClear();
    showBlockingErrorMock.mockClear();
    showToastSuccessMock.mockClear();
    showToastErrorMock.mockClear();
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

  it('hides the info-box once a category exists', async () => {
    mockCategories = [makeCategory()];
    render(
      <Wrapper>
        <ProductsPage />
      </Wrapper>,
    );
    await waitFor(() =>
      expect(
        screen.queryByText('Para adicionar un producto debe primero adicionar una categoría'),
      ).not.toBeInTheDocument(),
    );
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

  it('renders one collapsed accordion panel per category with a product-count badge', async () => {
    mockCategories = [makeCategory()];
    mockProducts = [makeProduct()];

    render(
      <Wrapper>
        <ProductsPage />
      </Wrapper>,
    );

    expect(await screen.findByText('Bebidas')).toBeInTheDocument();
    // badge count comes from getProductCategoriesView's productsCount (isActive &&
    // availableToSale), not a derived length.
    expect(screen.getByText('1')).toBeInTheDocument();
    // collapsed by default -> product name not visible yet
    expect(screen.queryByText('Coca Cola')).not.toBeInTheDocument();
  });

  it('expands a category panel on click to reveal its products', async () => {
    mockCategories = [makeCategory()];
    mockProducts = [makeProduct()];

    render(
      <Wrapper>
        <ProductsPage />
      </Wrapper>,
    );

    fireEvent.click(await screen.findByTestId('category-panel-toggle-cat-1'));
    expect(await screen.findByText('Coca Cola')).toBeInTheDocument();
  });

  it('shows the per-category empty state inside an expanded panel with no products', async () => {
    mockCategories = [makeCategory()];
    mockProducts = [];

    render(
      <Wrapper>
        <ProductsPage />
      </Wrapper>,
    );

    fireEvent.click(await screen.findByTestId('category-panel-toggle-cat-1'));
    // PRODUCT_CATEGORY.NO_PRODUCT_FOUND
    expect(await screen.findByText('No hay productos en esta categoría.')).toBeInTheDocument();
  });

  it('does NOT render a page-level bulk-edit ("Edición masiva") button', async () => {
    render(
      <Wrapper>
        <ProductsPage />
      </Wrapper>,
    );
    await waitFor(() => expect(screen.getByTestId('import-csv-button')).toBeInTheDocument());
    expect(screen.queryByTestId('bulk-edit-button')).not.toBeInTheDocument();
    expect(screen.queryByText('Edición masiva')).not.toBeInTheDocument();
  });

  it('does NOT render a page-level "Crear producto" button', async () => {
    render(
      <Wrapper>
        <ProductsPage />
      </Wrapper>,
    );
    await waitFor(() => expect(screen.getByTestId('import-csv-button')).toBeInTheDocument());
    expect(screen.queryByTestId('create-product-button')).not.toBeInTheDocument();
  });

  it('does NOT render a page-level search input', async () => {
    render(
      <Wrapper>
        <ProductsPage />
      </Wrapper>,
    );
    await waitFor(() => expect(screen.getByTestId('import-csv-button')).toBeInTheDocument());
    expect(screen.queryByTestId('products-search-input')).not.toBeInTheDocument();
  });

  // Angular parity (edit-product-modal.component.ts:42-49,88-100): opening the create modal
  // awaits productService.getMaxOrder(category.id) and prefills Orden with data+1; submit routes
  // through the async createProduct(categoryId, name, price, businessId, order, isActive,
  // availableToSale, discountFromInvantory, barcode?) positional surface — no audit fields (the
  // service owns createdByName/createdDate stamping).
  it('awaits getMaxOrder(category.id) and prefills Orden with max+1 before opening the create modal', async () => {
    mockCategories = [makeCategory()];
    productServiceSpies.getMaxOrder.mockResolvedValueOnce({
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

    fireEvent.click(await screen.findByTestId('category-actions-toggle-cat-1'));
    fireEvent.click(screen.getByTestId('add-product-button'));

    await waitFor(() => expect(productServiceSpies.getMaxOrder).toHaveBeenCalledWith('cat-1'));
    expect(await screen.findByTestId('product-order-input')).toHaveValue(5);
  });

  it('calls createProduct with positional args carrying the modal order/isActive (service owns audit stamping)', async () => {
    mockCategories = [makeCategory()];
    productServiceSpies.getMaxOrder.mockResolvedValueOnce({
      data: 0,
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

    fireEvent.click(await screen.findByTestId('category-actions-toggle-cat-1'));
    fireEvent.click(screen.getByTestId('add-product-button'));

    fireEvent.change(await screen.findByTestId('product-name-input'), { target: { value: 'Sprite' } });
    fireEvent.change(screen.getByTestId('product-price-input'), { target: { value: '2.5' } });
    fireEvent.click(screen.getByTestId('create-product-submit'));

    await waitFor(() => expect(productServiceSpies.createProduct).toHaveBeenCalledTimes(1));
    const args = productServiceSpies.createProduct.mock.calls[0];
    expect(args[0]).toBe('cat-1'); // categoryId
    expect(args[1]).toBe('Sprite'); // name
    expect(args[2]).toBe(2.5); // price
    expect(args[3]).toBe(''); // businessId
    expect(args[4]).toBe(1); // order (getMaxOrder data=0 -> 0+1)
    expect(args[5]).toBe(true); // isActive
  });

  // Angular parity (edit-product-modal.component.ts:113-138): handleEditProduct routes through
  // the async updateProduct(id, categoryId, name, price, businessId, order, isActive,
  // availableToSale, discountFromInvantory, barcode?) positional surface.
  it('calls updateProduct with the edited product positional args (WU4.2)', async () => {
    mockCategories = [makeCategory()];
    mockProducts = [makeProduct()]; // id prod-1, name Coca Cola, cat-1

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

    await waitFor(() => expect(productServiceSpies.updateProduct).toHaveBeenCalledTimes(1));
    const args = productServiceSpies.updateProduct.mock.calls[0];
    expect(args[0]).toBe('prod-1'); // id
    expect(args[1]).toBe('cat-1'); // categoryId
    expect(args[2]).toBe('Coca Cola Zero'); // name
  });

  // Angular parity (edit-product-modal.component.ts:86,125): the barcode FormControl is
  // commented out, so `barcodeValue` is ALWAYS undefined on update — even for a product that
  // already has a stored barcode. React mirrors this by forwarding undefined regardless of
  // product.barcode.
  it('threads barcode=undefined into updateProduct even for a product with a stored barcode (parity fix)', async () => {
    mockCategories = [makeCategory()];
    mockProducts = [makeProduct({ barcode: '7501234567890' })];

    render(
      <Wrapper>
        <ProductsPage />
      </Wrapper>,
    );

    fireEvent.click(await screen.findByTestId('category-panel-toggle-cat-1'));
    fireEvent.click(await screen.findByLabelText('Acciones'));
    fireEvent.click(screen.getByText('Editar Producto'));
    fireEvent.click(screen.getByTestId('edit-product-submit'));

    await waitFor(() => expect(productServiceSpies.updateProduct).toHaveBeenCalledTimes(1));
    const args = productServiceSpies.updateProduct.mock.calls[0];
    expect(args[9]).toBeUndefined(); // barcode positional arg — always undefined, mirrors Angular
  });

  // Angular parity (product-modal-parity): EditProductModal no longer accepts onDelete/categories
  // — deletion stays at list-row level, category stays pinned to product.categoryId.
  it('renders EditProductModal without an in-modal delete affordance (WU4.2)', async () => {
    mockCategories = [makeCategory()];
    mockProducts = [makeProduct()];

    render(
      <Wrapper>
        <ProductsPage />
      </Wrapper>,
    );

    fireEvent.click(await screen.findByTestId('category-panel-toggle-cat-1'));
    fireEvent.click(await screen.findByLabelText('Acciones'));
    fireEvent.click(screen.getByText('Editar Producto'));

    expect(await screen.findByTestId('edit-product-name-input')).toBeInTheDocument();
    expect(screen.queryByTestId('delete-product-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('confirm-delete-button')).not.toBeInTheDocument();
  });

  // Angular parity (category-product-list.component.ts:86-103, onDeleteProduct): a
  // confirmDialog Swal (question icon, GENERAL.DELETE_CONFIRM_TITLE/MESSAGE_A with
  // {name: PRODUCT.TEXT}, GENERAL.YES/NO) gates the delete — deleteProduct(id) only fires
  // on isConfirmed.
  it('T1: confirms via confirmDialog with the exact Angular keys, then calls deleteProduct(id) (WU4.3)', async () => {
    mockCategories = [makeCategory()];
    mockProducts = [makeProduct()];

    render(
      <Wrapper>
        <ProductsPage />
      </Wrapper>,
    );

    fireEvent.click(await screen.findByTestId('category-panel-toggle-cat-1'));
    fireEvent.click(await screen.findByLabelText('Acciones'));
    fireEvent.click(screen.getByText('Eliminar Producto'));

    await waitFor(() =>
      expect(confirmDialogMock).toHaveBeenCalledWith({
        title: 'Confirmación para eliminar',
        message: '¿Está seguro que desea eliminar esta Product?',
        confirmButtonText: 'Si',
        cancelButtonText: 'No',
      }),
    );
    await waitFor(() => expect(productServiceSpies.deleteProduct).toHaveBeenCalledWith('prod-1'));
  });

  it('T1: does NOT call deleteProduct when the confirmDialog is cancelled', async () => {
    mockCategories = [makeCategory()];
    mockProducts = [makeProduct()];
    confirmDialogMock.mockResolvedValueOnce(false);

    render(
      <Wrapper>
        <ProductsPage />
      </Wrapper>,
    );

    fireEvent.click(await screen.findByTestId('category-panel-toggle-cat-1'));
    fireEvent.click(await screen.findByLabelText('Acciones'));
    fireEvent.click(screen.getByText('Eliminar Producto'));

    await waitFor(() => expect(confirmDialogMock).toHaveBeenCalled());
    expect(productServiceSpies.deleteProduct).not.toHaveBeenCalled();
  });

  // Angular parity (edit-products-modal.component.ts:74-107): "Nuevo Productos" bulk-CREATES
  // new products via createProducts(categoryId, items), it does NOT edit existing ones (WU3
  // rework — supersedes the former per-item updateProduct-loop test, WU4.4).
  it('calls createProducts(categoryId, items) for the filled rows and reloads the list', async () => {
    mockCategories = [makeCategory()];
    mockProducts = [makeProduct()];

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

    await waitFor(() => expect(productServiceSpies.createProducts).toHaveBeenCalledTimes(1));
    expect(productServiceSpies.createProducts).toHaveBeenCalledWith('cat-1', [
      { name: 'Fanta', price: 9.99 },
    ]);
    expect(productServiceSpies.updateProduct).not.toHaveBeenCalled();
  });

  // Angular parity (edit-products-modal.component.ts:97-107): closeModal() + emit() run
  // unconditionally, THEN a Swal error is shown if !response.succeeded (some names already
  // existed) — mirrored via showBlockingError.
  it('shows a blocking error when createProducts reports some products already existed, but still closes the modal', async () => {
    mockCategories = [makeCategory()];
    mockProducts = [makeProduct()];
    productServiceSpies.createProducts.mockResolvedValueOnce({
      data: false,
      succeeded: false,
      message: '',
      actionCode: 200,
      errors: [],
    });

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
        'Algunos productos no fueron adicionados porque ya existen.',
      ),
    );
    expect(screen.queryByTestId('bulk-save-button')).not.toBeInTheDocument();
  });

  // Angular parity (edit-product-modal.component.ts:106-110): a failed createProduct surfaces
  // errors[0].description via showBlockingError and keeps the modal open (no silent swallow).
  it('surfaces a createProduct failure via showBlockingError and keeps the modal open (WU4.1)', async () => {
    mockCategories = [makeCategory()];
    productServiceSpies.createProduct.mockResolvedValueOnce({
      data: null,
      succeeded: false,
      message: '',
      actionCode: 400,
      errors: [{ code: 'Product.NameExists', description: 'El nombre del producto ya existe.' }],
    } as unknown as Awaited<ReturnType<typeof productServiceSpies.createProduct>>);

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

    await waitFor(() => expect(showBlockingErrorMock).toHaveBeenCalledWith('Error', 'El nombre del producto ya existe.'));
    // Modal stays open on failure — not force-closed.
    expect(screen.getByTestId('create-product-submit')).toBeInTheDocument();
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

      fireEvent.click(await screen.findByTestId('category-actions-toggle-cat-1'));
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

    // Angular handleSuccess parity (csv-product-importer-modal.component.ts:52-65): ALWAYS a
    // success message with the imported count; a conditional "some already exist" info dialog
    // ONLY when the response did not fully succeed.
    it('always shows the success message with the imported count', async () => {
      render(
        <Wrapper>
          <ProductsPage />
        </Wrapper>,
      );

      fireEvent.click(screen.getByTestId('import-csv-button'));
      fireEvent.change(screen.getByTestId('csv-file-input'), { target: { files: [makeCsvFile()] } });
      await waitFor(() => expect(screen.getByTestId('csv-import-button')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('csv-import-button'));

      await waitFor(() =>
        expect(showToastSuccessMock).toHaveBeenCalledWith('Importados 1 productos correctamente.'),
      );
      expect(showBlockingInfoMock).not.toHaveBeenCalled();
    });

    it('shows the "already exist" info dialog only when the response did not fully succeed', async () => {
      productServiceSpies.createCsvProducts.mockResolvedValueOnce({
        data: false,
        succeeded: false,
        message: '',
        actionCode: 200,
        errors: [],
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

      await waitFor(() =>
        expect(showBlockingInfoMock).toHaveBeenCalledWith(
          'Información',
          'Algunos productos no fueron importados porque ya existen.',
        ),
      );
      expect(showToastSuccessMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('category header gear menu (React-only enhancement)', () => {
    it('exposes category actions via the gear WITHOUT expanding the panel', async () => {
      mockCategories = [makeCategory()];
      mockProducts = [makeProduct()]; // "Coca Cola" only shows when the panel is expanded

      render(
        <Wrapper>
          <ProductsPage />
        </Wrapper>,
      );

      // Opening the gear reveals the actions but must NOT expand the panel
      fireEvent.click(await screen.findByTestId('category-actions-toggle-cat-1'));
      expect(screen.getByTestId('edit-category-button')).toBeInTheDocument();
      expect(screen.getByTestId('category-panel-toggle-cat-1')).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByText('Coca Cola')).not.toBeInTheDocument();
    });

    it('expands the panel when the header (not the gear) is clicked', async () => {
      mockCategories = [makeCategory()];
      mockProducts = [makeProduct()];

      render(
        <Wrapper>
          <ProductsPage />
        </Wrapper>,
      );

      fireEvent.click(await screen.findByTestId('category-panel-toggle-cat-1'));
      expect(screen.getByText('Coca Cola')).toBeInTheDocument();
    });

    // REGRESSION GUARD (presentation-parity-bucket-b, KEEP — spec "Category actions menu
    // stays the single action path"): the gear (CategoryActionsMenu) is the ONLY UI path for
    // category actions — Angular's 3 separate inline fabs (Editar Categoría / Nuevo Producto /
    // Nuevo Productos) must NOT be duplicated as standalone buttons on the row.
    it('REGRESSION: only the gear menu is the category-actions path — no inline per-action fab buttons on the row', async () => {
      mockCategories = [makeCategory()];
      mockProducts = [makeProduct()];

      render(
        <Wrapper>
          <ProductsPage />
        </Wrapper>,
      );

      await screen.findByTestId('category-actions-toggle-cat-1');

      // Exactly one gear toggle for the category, and the menu's action buttons are not
      // rendered until it's opened.
      expect(screen.getAllByTestId('category-actions-toggle-cat-1')).toHaveLength(1);
      expect(screen.queryByTestId('edit-category-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('add-product-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('add-products-button')).not.toBeInTheDocument();

      // The category header row itself only has 3 buttons: panel toggle, gear toggle,
      // chevron toggle — no extra inline action buttons.
      const row = screen.getByTestId('category-panel-toggle-cat-1').closest('div');
      const rowButtons = row ? Array.from(row.querySelectorAll('button')) : [];
      expect(rowButtons).toHaveLength(3);
    });
  });
});
