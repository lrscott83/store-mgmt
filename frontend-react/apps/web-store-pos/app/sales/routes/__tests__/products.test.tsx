import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { BaseResponseModel, CsvImportResult, Product, ProductCategory } from '@store-mgmt/domain';

// --- Mutable in-memory fixtures, controlled per-test ---
let mockCategories: ProductCategory[] = [];
let mockProducts: Product[] = [];

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

// Hoisted so the mock factory below (which runs before module-scope const
// declarations) and the tests can both reference the same spy instances —
// lets tests inspect ProductOfflineService.create's call args directly.
const okEnvelope = { data: true, succeeded: true, message: '', actionCode: 200, errors: [] };
const productServiceSpies = vi.hoisted(() => ({
  createProduct: vi.fn((..._args: unknown[]) => Promise.resolve({ data: true, succeeded: true, message: '', actionCode: 200, errors: [] })),
  updateProduct: vi.fn((..._args: unknown[]) => Promise.resolve({ data: true, succeeded: true, message: '', actionCode: 200, errors: [] })),
  deleteProduct: vi.fn((..._args: unknown[]) => Promise.resolve({ data: true, succeeded: true, message: '', actionCode: 200, errors: [] })),
  // ADR-1/ADR-2 (csv-import-cost-quantity-entries): createCsvProducts ALWAYS resolves
  // success(...) — a per-row {created,failed} payload replaces the old boolean, so callers
  // branch on `data.failed.length > 0`, never on `succeeded`.
  createCsvProducts: vi.fn(
    (..._args: unknown[]): Promise<BaseResponseModel<CsvImportResult>> =>
      Promise.resolve({ data: { created: [], failed: [] }, succeeded: true, message: '', actionCode: 200, errors: [] }),
  ),
  createProducts: vi.fn((..._args: unknown[]) => Promise.resolve({ data: true, succeeded: true, message: '', actionCode: 200, errors: [] })),
  getMaxOrder: vi.fn((..._args: unknown[]) => Promise.resolve({ data: 0, succeeded: true, message: '', actionCode: 200, errors: [] })),
}));

const { bm } = vi.hoisted(() => ({
  bm: <T,>(data: T) => ({ data, succeeded: true, message: '', actionCode: 200, errors: [] }),
}));

vi.mock('~/sales/lib/services/product-offline-service', () => ({
  ProductOfflineService: vi.fn().mockImplementation(() => ({
    getAvailableProductsByCategoryId: vi.fn(async (categoryId: string) =>
      bm(mockProducts.filter((p) => p.categoryId === categoryId)),
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
  // Exposed as a spy (not inlined in the vi.mock factory below) so tests can queue a
  // `.mockRejectedValueOnce(...)` to exercise loadData's genuinely-catchable failure path
  // (Finding 1) — decryptEntity can throw MissingDataKeyError when no DEK is in memory.
  getProductCategoriesView: vi.fn(async () =>
    bm(
      mockCategories.map((c) => ({
        ...c,
        productsCount: mockProducts.filter((p) => p.categoryId === c.id).length,
      })),
    ),
  ),
}));

// WU3 (csv-import-cost-quantity-entries): handleCsvImport constructs InventoryOfflineService
// inline (ADR-5, mirrors today-entries.tsx:138-141) to create one entry per created row with a
// qualifying quantity. ProductRepository/ProductCategoryRepository stay REAL — they are only
// constructor args to the mocked service, never read, so no mock is needed for them.
const inventoryServiceSpies = vi.hoisted(() => ({
  createInventoryEntry: vi.fn(
    (..._args: unknown[]): { succeeded: boolean; errors: unknown[]; data: undefined } | null => ({
      succeeded: true,
      errors: [],
      data: undefined,
    }),
  ),
}));

vi.mock('~/inventory/lib/services/inventory-offline-service', () => ({
  InventoryOfflineService: vi.fn().mockImplementation(() => ({
    createInventoryEntry: inventoryServiceSpies.createInventoryEntry,
  })),
}));

vi.mock('~/sales/lib/services/product-category-offline-service', () => ({
  ProductCategoryOfflineService: vi.fn().mockImplementation(() => ({
    getProductCategoriesView: categoryServiceSpies.getProductCategoriesView,
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
    productServiceSpies.createCsvProducts.mockResolvedValue({
      data: { created: [], failed: [] },
      succeeded: true,
      message: '',
      actionCode: 200,
      errors: [],
    });
    inventoryServiceSpies.createInventoryEntry.mockClear();
    inventoryServiceSpies.createInventoryEntry.mockReturnValue({ succeeded: true, errors: [], data: undefined });
    showBlockingInfoMock.mockClear();
    showBlockingErrorMock.mockClear();
    showToastSuccessMock.mockClear();
    showToastErrorMock.mockClear();
    mockUser.isOwnerAdmin = true;
    clearCartMock.mockClear();
    // mockReset (not mockClear) so a queued mockReturnValueOnce from the wipe-failure test
    // below can never leak into an unrelated test; clearStoreData's real contract (Finding 1)
    // is "returns the entities it failed to remove", so the default here is the successful
    // case, an empty array, not undefined.
    clearStoreDataMock.mockReset();
    clearStoreDataMock.mockReturnValue([]);
    // mockClear only (not mockReset): this spy's default implementation, set once at
    // vi.fn(impl) creation, must survive across tests — only the per-test
    // mockRejectedValueOnce queue (loadData-failure test below) needs to not leak, and Once
    // entries self-consume.
    categoryServiceSpies.getProductCategoriesView.mockClear();
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
    // badge count comes from getProductCategoriesView's productsCount, which is
    // now the category's TOTAL product count — the same set the panel lists.
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

  // catalog-show-all-and-clear-data §Finding 2: deleteProduct is a soft delete (isActive:
  // false, row stays in storage), so the row menu item and this confirmation are labelled
  // "Desactivar", not "Eliminar" — the underlying service call is unchanged, only the label
  // and the confirmation copy were aligned to the real behaviour. The confirmation no longer
  // uses the SHARED GENERAL.DELETE_CONFIRM_TITLE/MESSAGE_A keys (four other screens depend on
  // their "eliminar" wording); it uses hardcoded Spanish instead.
  it('confirms via confirmDialog with the hardcoded "desactivar" copy, then calls deleteProduct(id)', async () => {
    mockCategories = [makeCategory()];
    mockProducts = [makeProduct()];

    render(
      <Wrapper>
        <ProductsPage />
      </Wrapper>,
    );

    fireEvent.click(await screen.findByTestId('category-panel-toggle-cat-1'));
    fireEvent.click(await screen.findByLabelText('Acciones'));
    fireEvent.click(screen.getByText('Desactivar Producto'));

    await waitFor(() =>
      expect(confirmDialogMock).toHaveBeenCalledWith({
        title: 'Confirmación para desactivar',
        message: '¿Está seguro que desea desactivar este producto?',
        confirmButtonText: 'Si',
        cancelButtonText: 'No',
      }),
    );
    await waitFor(() => expect(productServiceSpies.deleteProduct).toHaveBeenCalledWith('prod-1'));
  });

  it('does NOT call deleteProduct when the confirmDialog is cancelled', async () => {
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
    fireEvent.click(screen.getByText('Desactivar Producto'));

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
  //
  // csv-import-cost-quantity-entries (WU3): handleCsvImport also orchestrates one
  // InventoryOfflineService.createInventoryEntry(id, quantity, costPrice) call per row
  // `createCsvProducts` reports as `created` AND that carries a qualifying `quantity > 0`
  // (decisions #7/#8/#12, ADR-5). `product.quantity` is preserved by the parser even when it is
  // `0` or negative (REQ-1 sc.6/7) — the gate here MUST be `!product.quantity ||
  // product.quantity <= 0`, a bare `!product.quantity` check would let a negative quantity
  // (`!(-3)` is `false`) slip through.
  describe('handleCsvImport — ProductService.createCsvProducts call site', () => {
    function makeCsvFile(): File {
      return new File(['name,price,category\nChips,10,Snacks'], 'products.csv', { type: 'text/csv' });
    }

    function makeCsvFileWithCostQuantity(): File {
      return new File(['name,price,category,cost,quantity\nChips,10,Snacks,6,12'], 'products.csv', { type: 'text/csv' });
    }

    function mockCreateCsvProductsOnce(
      created: { id: string; category: string; name: string; price: number; cost?: number; quantity?: number }[],
      failed: { category: string; name: string; price: number; cost?: number; quantity?: number }[] = [],
    ) {
      productServiceSpies.createCsvProducts.mockResolvedValueOnce({
        data: { created, failed },
        succeeded: true,
        message: '',
        actionCode: 200,
        errors: [],
      });
    }

    it('calls createCsvProducts with the parsed {category,name,price,cost,quantity} rows', async () => {
      render(
        <Wrapper>
          <ProductsPage />
        </Wrapper>,
      );

      fireEvent.click(screen.getByTestId('import-csv-button'));
      fireEvent.change(screen.getByTestId('csv-file-input'), { target: { files: [makeCsvFileWithCostQuantity()] } });
      await waitFor(() => expect(screen.getByTestId('csv-import-button')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('csv-import-button'));

      await waitFor(() => expect(productServiceSpies.createCsvProducts).toHaveBeenCalledTimes(1));
      // Concrete cost/quantity values (design R3): with real values the equality is no longer
      // undefined-blind — it FAILS if cost/quantity aren't threaded from parser to service.
      expect(productServiceSpies.createCsvProducts).toHaveBeenCalledWith([
        { category: 'Snacks', name: 'Chips', price: 10, cost: 6, quantity: 12 },
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
      // NOTE (design R3): this legacy 3-column fixture yields cost/quantity: undefined on the
      // parsed row, written out explicitly for documentation. Vitest's recursive equality
      // IGNORES explicitly-undefined properties, so this assertion CANNOT discriminate a
      // regression that stops threading cost/quantity at all — it would pass either way. The
      // real "legacy row creates no entry" guarantee is pinned by the dedicated
      // 'does not create an entry when quantity is absent' case below, which asserts
      // createInventoryEntry was never called.
      expect(productServiceSpies.createCsvProducts).toHaveBeenCalledWith([
        { category: 'Snacks', name: 'Chips', price: 10, cost: undefined, quantity: undefined },
      ]);
    });

    // Angular handleSuccess parity (csv-product-importer-modal.component.ts:52-65): ALWAYS a
    // success message; DIVERGES DELIBERATELY (decisions #14/#17) — the toast now reports REAL
    // successes (products created + entries created), unconditionally, with no branching, even
    // for a legacy CSV whose entries count is 0.
    it('always shows both counts, including zero entries for a legacy CSV', async () => {
      mockCreateCsvProductsOnce([
        { id: 'p1', category: 'Snacks', name: 'Chips', price: 10, cost: undefined, quantity: undefined },
      ]);
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
        expect(showToastSuccessMock).toHaveBeenCalledWith('Importados 1 productos y 0 entradas correctamente.'),
      );
      expect(inventoryServiceSpies.createInventoryEntry).not.toHaveBeenCalled();
      expect(showBlockingInfoMock).not.toHaveBeenCalled();
    });

    it('reports both real counts when some rows also create entries', async () => {
      mockCreateCsvProductsOnce([
        { id: 'p1', category: 'Snacks', name: 'Chips', price: 10, cost: 6, quantity: 12 },
        { id: 'p2', category: 'Snacks', name: 'Soda', price: 5, cost: undefined, quantity: undefined },
      ]);
      render(
        <Wrapper>
          <ProductsPage />
        </Wrapper>,
      );

      fireEvent.click(screen.getByTestId('import-csv-button'));
      fireEvent.change(screen.getByTestId('csv-file-input'), { target: { files: [makeCsvFileWithCostQuantity()] } });
      await waitFor(() => expect(screen.getByTestId('csv-import-button')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('csv-import-button'));

      await waitFor(() =>
        expect(showToastSuccessMock).toHaveBeenCalledWith('Importados 2 productos y 1 entradas correctamente.'),
      );
      expect(inventoryServiceSpies.createInventoryEntry).toHaveBeenCalledTimes(1);
    });

    it('creates one inventory entry per created row with a qualifying quantity, called as (id, quantity, cost)', async () => {
      mockCreateCsvProductsOnce([{ id: 'p1', category: 'Snacks', name: 'Chips', price: 10, cost: 6, quantity: 12 }]);
      render(
        <Wrapper>
          <ProductsPage />
        </Wrapper>,
      );

      fireEvent.click(screen.getByTestId('import-csv-button'));
      fireEvent.change(screen.getByTestId('csv-file-input'), { target: { files: [makeCsvFileWithCostQuantity()] } });
      await waitFor(() => expect(screen.getByTestId('csv-import-button')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('csv-import-button'));

      await waitFor(() => expect(inventoryServiceSpies.createInventoryEntry).toHaveBeenCalledTimes(1));
      expect(inventoryServiceSpies.createInventoryEntry).toHaveBeenCalledWith('p1', 12, 6);
    });

    it('falls back to price when cost is absent (decision #7)', async () => {
      mockCreateCsvProductsOnce([
        { id: 'p2', category: 'Snacks', name: 'Chips', price: 10, cost: undefined, quantity: 5 },
      ]);
      render(
        <Wrapper>
          <ProductsPage />
        </Wrapper>,
      );

      fireEvent.click(screen.getByTestId('import-csv-button'));
      fireEvent.change(screen.getByTestId('csv-file-input'), { target: { files: [makeCsvFileWithCostQuantity()] } });
      await waitFor(() => expect(screen.getByTestId('csv-import-button')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('csv-import-button'));

      await waitFor(() => expect(inventoryServiceSpies.createInventoryEntry).toHaveBeenCalledTimes(1));
      expect(inventoryServiceSpies.createInventoryEntry).toHaveBeenCalledWith('p2', 5, 10);
    });

    // Decision #16: cost="0" is a VALID explicit zero, never a fallback trigger. `?? ` handles
    // this correctly; `||` would NOT (0 is falsy), which is exactly the bug this pins.
    it('uses an explicit cost of 0 for the entry, never falling back to price', async () => {
      mockCreateCsvProductsOnce([{ id: 'p8', category: 'Snacks', name: 'Chips', price: 10, cost: 0, quantity: 5 }]);
      render(
        <Wrapper>
          <ProductsPage />
        </Wrapper>,
      );

      fireEvent.click(screen.getByTestId('import-csv-button'));
      fireEvent.change(screen.getByTestId('csv-file-input'), { target: { files: [makeCsvFileWithCostQuantity()] } });
      await waitFor(() => expect(screen.getByTestId('csv-import-button')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('csv-import-button'));

      await waitFor(() => expect(inventoryServiceSpies.createInventoryEntry).toHaveBeenCalledTimes(1));
      expect(inventoryServiceSpies.createInventoryEntry).toHaveBeenCalledWith('p8', 5, 0);
    });

    it('does not create an entry when quantity is absent, zero, or negative', async () => {
      mockCreateCsvProductsOnce([
        { id: 'p3', category: 'Snacks', name: 'A', price: 10, cost: 1, quantity: undefined },
        { id: 'p4', category: 'Snacks', name: 'B', price: 10, cost: 1, quantity: 0 },
        // The carry-forward risk this pins: the parser preserves negative quantity as -3 (REQ-1
        // sc.7), so a bare `!product.quantity` check ("!(-3)" is `false` in JS) would let this
        // row slip through to createInventoryEntry. It must not.
        { id: 'p5', category: 'Snacks', name: 'C', price: 10, cost: 1, quantity: -3 },
      ]);
      render(
        <Wrapper>
          <ProductsPage />
        </Wrapper>,
      );

      fireEvent.click(screen.getByTestId('import-csv-button'));
      fireEvent.change(screen.getByTestId('csv-file-input'), { target: { files: [makeCsvFileWithCostQuantity()] } });
      await waitFor(() => expect(screen.getByTestId('csv-import-button')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('csv-import-button'));

      await waitFor(() =>
        expect(showToastSuccessMock).toHaveBeenCalledWith('Importados 3 productos y 0 entradas correctamente.'),
      );
      expect(inventoryServiceSpies.createInventoryEntry).not.toHaveBeenCalled();
    });

    it('does not count a bare-null return from createInventoryEntry toward the entries count (R2)', async () => {
      inventoryServiceSpies.createInventoryEntry.mockReturnValueOnce(null);
      mockCreateCsvProductsOnce([{ id: 'p6', category: 'Snacks', name: 'Chips', price: 10, cost: 6, quantity: 12 }]);
      render(
        <Wrapper>
          <ProductsPage />
        </Wrapper>,
      );

      fireEvent.click(screen.getByTestId('import-csv-button'));
      fireEvent.change(screen.getByTestId('csv-file-input'), { target: { files: [makeCsvFileWithCostQuantity()] } });
      await waitFor(() => expect(screen.getByTestId('csv-import-button')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('csv-import-button'));

      await waitFor(() =>
        expect(showToastSuccessMock).toHaveBeenCalledWith('Importados 1 productos y 0 entradas correctamente.'),
      );
    });

    it('shows one blocking dialog enumerating each duplicate as "Categoría - Nombre", comma-joined', async () => {
      mockCreateCsvProductsOnce(
        [],
        [
          { category: 'Pizzas', name: 'Pizza de Queso', price: 150 },
          { category: 'Confituras', name: 'Caramelo', price: 20 },
        ],
      );
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
          'Algunos productos no fueron importados porque ya existen: Pizzas - Pizza de Queso, Confituras - Caramelo.',
        ),
      );
      expect(showBlockingInfoMock).toHaveBeenCalledTimes(1);
      expect(inventoryServiceSpies.createInventoryEntry).not.toHaveBeenCalled();
    });

    it('does not show the duplicate dialog when there are no failed rows', async () => {
      mockCreateCsvProductsOnce([{ id: 'p1', category: 'Snacks', name: 'Chips', price: 10, cost: 6, quantity: 12 }]);
      render(
        <Wrapper>
          <ProductsPage />
        </Wrapper>,
      );

      fireEvent.click(screen.getByTestId('import-csv-button'));
      fireEvent.change(screen.getByTestId('csv-file-input'), { target: { files: [makeCsvFileWithCostQuantity()] } });
      await waitFor(() => expect(screen.getByTestId('csv-import-button')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('csv-import-button'));

      await waitFor(() => expect(showToastSuccessMock).toHaveBeenCalledTimes(1));
      expect(showBlockingInfoMock).not.toHaveBeenCalled();
    });

    // sdd-verify WARNING #1 (csv-import-cost-quantity-entries): each half of REQ-6 scenario 1
    // (real non-zero counts, aggregated duplicate dialog) was independently pinned above, but the
    // INTERACTION — does the toast still report correct non-zero counts when a duplicate dialog
    // ALSO fires in the same import — was untested. The old pre-change test explicitly asserted
    // showToastSuccessMock was called once alongside the dialog; that check was dropped during the
    // succeeded->failed.length contract rewrite and not replaced. This restores it in the new
    // counts-based shape, from ONE createCsvProducts response carrying both created and failed rows.
    it('reports real non-zero counts AND shows the duplicate dialog together, from a single import (REQ-6 sc.1)', async () => {
      mockCreateCsvProductsOnce(
        [
          { id: 'p10', category: 'Pizzas', name: 'Pizza de Queso', price: 150, cost: 120, quantity: 10 },
          { id: 'p11', category: 'Pizzas', name: 'Pizza Especial', price: 200, cost: 150, quantity: 5 },
          { id: 'p12', category: 'Confituras', name: 'Caramelo', price: 20, cost: undefined, quantity: undefined },
        ],
        [
          { category: 'Pizzas', name: 'Pizza Vieja', price: 100 },
          { category: 'Confituras', name: 'Chocolate', price: 30 },
        ],
      );
      render(
        <Wrapper>
          <ProductsPage />
        </Wrapper>,
      );

      fireEvent.click(screen.getByTestId('import-csv-button'));
      fireEvent.change(screen.getByTestId('csv-file-input'), { target: { files: [makeCsvFileWithCostQuantity()] } });
      await waitFor(() => expect(screen.getByTestId('csv-import-button')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('csv-import-button'));

      // Real counts: 3 products created (not 5 rows attempted), 2 entries (only the 2 rows
      // carrying a qualifying quantity — the 3rd created row has no quantity).
      await waitFor(() =>
        expect(showToastSuccessMock).toHaveBeenCalledWith('Importados 3 productos y 2 entradas correctamente.'),
      );
      expect(showToastSuccessMock).toHaveBeenCalledTimes(1);
      expect(inventoryServiceSpies.createInventoryEntry).toHaveBeenCalledTimes(2);
      expect(inventoryServiceSpies.createInventoryEntry).toHaveBeenNthCalledWith(1, 'p10', 10, 120);
      expect(inventoryServiceSpies.createInventoryEntry).toHaveBeenNthCalledWith(2, 'p11', 5, 150);

      // The SAME import also aggregates the 2 duplicate rows into ONE dialog.
      expect(showBlockingInfoMock).toHaveBeenCalledWith(
        'Información',
        'Algunos productos no fueron importados porque ya existen: Pizzas - Pizza Vieja, Confituras - Chocolate.',
      );
      expect(showBlockingInfoMock).toHaveBeenCalledTimes(1);
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
    mockCategories = [makeCategory()];
    mockProducts = [makeProduct()];

    render(
      <Wrapper>
        <ProductsPage />
      </Wrapper>,
    );
    expect(await screen.findByText('Bebidas')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('clear-data-button'));

    await waitFor(() => expect(confirmDialogMock).toHaveBeenCalledTimes(1));
    expect(clearStoreDataMock).not.toHaveBeenCalled();
    expect(clearCartMock).not.toHaveBeenCalled();
    expect(showToastSuccessMock).not.toHaveBeenCalled();
    // The screen itself is unaffected — not just the mocks.
    expect(screen.getByText('Bebidas')).toBeInTheDocument();
  });

  // Finding 1: clearStoreData cannot throw (it swallows per key) — it instead RETURNS the
  // names of the entities it could not remove. A try/catch around a function built not to
  // fail is dead code that reports a failure which never happens, so the caller now branches
  // on the return value instead.
  it('surfaces a partial wipe via showBlockingError naming the failed entities, and does not show the success toast', async () => {
    confirmDialogMock.mockResolvedValue(true);
    clearStoreDataMock.mockReturnValueOnce(['orders']);

    render(
      <Wrapper>
        <ProductsPage />
      </Wrapper>,
    );

    fireEvent.click(screen.getByTestId('clear-data-button'));

    await waitFor(() =>
      expect(showBlockingErrorMock).toHaveBeenCalledWith(
        'Error',
        'No se pudieron eliminar todos los datos. Quedaron sin borrar: orders.',
      ),
    );
    expect(showToastSuccessMock).not.toHaveBeenCalled();
  });

  // The wipe itself and the repaint are two independent failure modes: loadData() can
  // genuinely throw (decryptEntity raises MissingDataKeyError with no DEK in memory) AFTER
  // the wipe already completed. Claiming "your data is gone" when it might not be is the
  // worst outcome on an irreversible action, so this gets its own message, and the wipe is
  // NOT reported as failed when only the repaint failed.
  it('surfaces a repaint failure separately when the wipe itself fully succeeded', async () => {
    confirmDialogMock.mockResolvedValue(true);
    mockCategories = [makeCategory()];

    render(
      <Wrapper>
        <ProductsPage />
      </Wrapper>,
    );
    // Let the initial mount's loadData() resolve normally BEFORE queuing the rejection —
    // otherwise the Once rejection would be consumed by the mount call instead of the
    // click-triggered reload this test targets.
    expect(await screen.findByText('Bebidas')).toBeInTheDocument();

    clearStoreDataMock.mockReturnValueOnce([]);
    categoryServiceSpies.getProductCategoriesView.mockRejectedValueOnce(new Error('no DEK in memory'));

    fireEvent.click(screen.getByTestId('clear-data-button'));

    await waitFor(() =>
      expect(showBlockingErrorMock).toHaveBeenCalledWith(
        'Error',
        'Los datos fueron eliminados, pero no se pudo actualizar la vista. Recargue la página.',
      ),
    );
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
});
