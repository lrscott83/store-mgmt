import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { EModules } from '@store-mgmt/domain';
import type { BaseResponseModel } from '@store-mgmt/domain';
import esMessages from '~/shared/lib/i18n/es';
import type { CatalogProductView } from '~/sales/lib/services/catalog-http-service';
import type { CatalogImportSummary } from '~/sales/lib/catalog/catalog-import';

const mockUser = vi.hoisted(() => ({
  selectedStoreId: 's1',
  isOwnerAdmin: true,
  // Literal, not EModules.WebCatalog: vi.hoisted runs before the imports initialize.
  storeModuleIds: [18] as number[],
}));

vi.mock('~/shared/lib/stores/auth-store', () => {
  const state = { user: mockUser, isAuthenticated: true };
  const useAuthStore = Object.assign(
    vi.fn((selector?: (s: typeof state) => unknown) => {
      if (typeof selector === 'function') return selector(state);
      return state;
    }),
    { getState: () => ({ logout: vi.fn() }) },
  );
  return { useAuthStore };
});

vi.mock('~/shared/lib/stores/cart-store', () => {
  const state = { clear: vi.fn() };
  const useCartStore = vi.fn((selector?: (s: typeof state) => unknown) => {
    if (typeof selector === 'function') return selector(state);
    return state;
  });
  return { useCartStore };
});

vi.mock('~/shared/lib/storage/store-data-reset', () => ({ clearStoreData: vi.fn(() => []) }));

const blockingAlertSpies = vi.hoisted(() => ({
  showBlockingError: vi.fn(),
  showBlockingInfo: vi.fn(() => Promise.resolve()),
  confirmDialog: vi.fn(() => Promise.resolve(true)),
}));

vi.mock('~/shared/lib/blocking-alert', () => ({
  showBlockingError: blockingAlertSpies.showBlockingError,
  showBlockingInfo: blockingAlertSpies.showBlockingInfo,
  confirmDialog: blockingAlertSpies.confirmDialog,
}));

const toastSpies = vi.hoisted(() => ({
  showToastSuccess: vi.fn(),
  showToastError: vi.fn(),
}));

vi.mock('~/shared/lib/toast', () => ({
  showToastSuccess: toastSpies.showToastSuccess,
  showToastError: toastSpies.showToastError,
}));

const catalogHttpSpies = vi.hoisted(() => ({
  getProducts: vi.fn(),
}));

vi.mock('~/sales/lib/services/catalog-http-service', () => ({
  catalogHttpService: { getProducts: catalogHttpSpies.getProducts },
}));

const catalogImportSpies = vi.hoisted(() => ({
  importCatalogProducts: vi.fn(),
}));

vi.mock('~/sales/lib/catalog/catalog-import', () => ({
  importCatalogProducts: catalogImportSpies.importCatalogProducts,
}));

vi.mock('~/sales/lib/services/product-offline-service', () => ({
  ProductOfflineService: vi.fn().mockImplementation(() => ({
    getAvailableProductsByCategoryId: vi.fn(async () => ({
      data: [],
      succeeded: true,
      message: '',
      actionCode: 200,
      errors: [],
    })),
  })),
}));

vi.mock('~/sales/lib/services/product-category-offline-service', () => ({
  ProductCategoryOfflineService: vi.fn().mockImplementation(() => ({
    getProductCategoriesView: vi.fn(async () => ({
      data: [],
      succeeded: true,
      message: '',
      actionCode: 200,
      errors: [],
    })),
  })),
}));

vi.mock('~/inventory/lib/services/inventory-offline-service', () => ({
  InventoryOfflineService: vi.fn().mockImplementation(() => ({ createInventoryEntry: vi.fn() })),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

const PRODUCT: CatalogProductView = {
  id: 'p1',
  categoryId: 'c1',
  categoryName: 'Bebidas',
  name: 'Coca Cola',
  price: 1.5,
  currency: 'CUP',
  order: 3,
  categoryOrder: 2,
  availableToSale: true,
  isActive: true,
  description: '',
  percentDiscountPrice: 0,
  discountPrice: 0,
  isNew: false,
  image: null,
  images: [],
  finalPrice: 1.5,
  hasDiscount: false,
};

const EMPTY_SUMMARY: CatalogImportSummary = {
  importedCount: 0,
  existingCount: 0,
  failedCategories: [],
  failedProducts: [],
};

function productsResponse(): BaseResponseModel<CatalogProductView[]> {
  return { data: [PRODUCT], succeeded: true, message: '', actionCode: 200, errors: [] };
}

import { ProductsPage } from '../products';

describe('ProductsPage — importar desde el Catálogo Web', () => {
  beforeEach(() => {
    mockUser.selectedStoreId = 's1';
    mockUser.isOwnerAdmin = true;
    mockUser.storeModuleIds = [EModules.WebCatalog];
    catalogHttpSpies.getProducts.mockReset();
    catalogHttpSpies.getProducts.mockResolvedValue(productsResponse());
    catalogImportSpies.importCatalogProducts.mockReset();
    catalogImportSpies.importCatalogProducts.mockReturnValue(EMPTY_SUMMARY);
    blockingAlertSpies.showBlockingError.mockReset();
    blockingAlertSpies.confirmDialog.mockReset();
    blockingAlertSpies.confirmDialog.mockResolvedValue(true);
    toastSpies.showToastSuccess.mockReset();
    toastSpies.showToastError.mockReset();
  });

  it('renderiza el botón junto al de importar CSV', async () => {
    render(
      <Wrapper>
        <ProductsPage />
      </Wrapper>,
    );

    const button = await screen.findByTestId('import-web-catalog-button');
    expect(button).toHaveTextContent('Importar desde Catálogo Web');
    expect(screen.getByTestId('import-csv-button')).toBeInTheDocument();
  });

  it('no muestra el botón si el usuario no es OwnerAdmin', async () => {
    mockUser.isOwnerAdmin = false;

    render(
      <Wrapper>
        <ProductsPage />
      </Wrapper>,
    );

    expect(await screen.findByTestId('import-csv-button')).toBeInTheDocument();
    expect(screen.queryByTestId('import-web-catalog-button')).toBeNull();
  });

  it('no muestra el botón si la tienda no tiene contratado el módulo Catálogo Web', async () => {
    mockUser.storeModuleIds = [];

    render(
      <Wrapper>
        <ProductsPage />
      </Wrapper>,
    );

    expect(await screen.findByTestId('import-csv-button')).toBeInTheDocument();
    expect(screen.queryByTestId('import-web-catalog-button')).toBeNull();
  });

  it('confirma antes de importar y no hace nada si el usuario cancela', async () => {
    blockingAlertSpies.confirmDialog.mockResolvedValueOnce(false);

    render(
      <Wrapper>
        <ProductsPage />
      </Wrapper>,
    );

    fireEvent.click(await screen.findByTestId('import-web-catalog-button'));

    await waitFor(() => expect(blockingAlertSpies.confirmDialog).toHaveBeenCalled());
    expect(catalogHttpSpies.getProducts).not.toHaveBeenCalled();
    expect(catalogImportSpies.importCatalogProducts).not.toHaveBeenCalled();
  });

  it('importa el catálogo del servidor y avisa con los conteos', async () => {
    catalogImportSpies.importCatalogProducts.mockReturnValue({
      importedCount: 2,
      existingCount: 3,
      failedCategories: [],
      failedProducts: [],
    });

    render(
      <Wrapper>
        <ProductsPage />
      </Wrapper>,
    );

    fireEvent.click(await screen.findByTestId('import-web-catalog-button'));

    await waitFor(() =>
      expect(toastSpies.showToastSuccess).toHaveBeenCalledWith(
        'Importación completada: 2 productos importados y 3 ya existentes.',
      ),
    );
    expect(catalogImportSpies.importCatalogProducts).toHaveBeenCalledWith(
      [PRODUCT],
      expect.objectContaining({
        categoryRepository: expect.anything(),
        productRepository: expect.anything(),
      }),
    );
    expect(blockingAlertSpies.showBlockingError).not.toHaveBeenCalled();
  });

  it('muestra las categorías que no se pudieron insertar y que sus productos no se importaron', async () => {
    catalogImportSpies.importCatalogProducts.mockReturnValue({
      importedCount: 1,
      existingCount: 0,
      failedCategories: [{ id: 'c2', name: 'Bebidas', skippedProductsCount: 2 }],
      failedProducts: [{ id: 'p9', name: 'Gorra' }],
    });

    render(
      <Wrapper>
        <ProductsPage />
      </Wrapper>,
    );

    fireEvent.click(await screen.findByTestId('import-web-catalog-button'));

    await waitFor(() =>
      expect(blockingAlertSpies.showBlockingError).toHaveBeenCalledWith(
        'Error',
        expect.stringContaining(
          'La categoría "Bebidas" no se pudo insertar; sus 2 productos no fueron importados.',
        ),
      ),
    );
    expect(blockingAlertSpies.showBlockingError).toHaveBeenCalledWith(
      'Error',
      expect.stringContaining('El producto "Gorra" no se pudo insertar.'),
    );
    expect(toastSpies.showToastSuccess).not.toHaveBeenCalled();
  });

  it('deshabilita el botón mientras la importación está en curso', async () => {
    let resolveProducts: (value: BaseResponseModel<CatalogProductView[]>) => void = () => {};
    catalogHttpSpies.getProducts.mockReturnValueOnce(
      new Promise<BaseResponseModel<CatalogProductView[]>>((resolve) => {
        resolveProducts = resolve;
      }),
    );

    render(
      <Wrapper>
        <ProductsPage />
      </Wrapper>,
    );

    const button = await screen.findByTestId('import-web-catalog-button');
    fireEvent.click(button);

    await waitFor(() => expect(button).toBeDisabled());
    expect(button).toHaveTextContent('Importando...');

    await act(async () => {
      resolveProducts(productsResponse());
    });
    await waitFor(() => expect(button).not.toBeDisabled());
  });

  it('reports the fetch failure, shows no success toast and releases the button', async () => {
    catalogHttpSpies.getProducts.mockResolvedValueOnce({
      data: [], succeeded: false, message: '', actionCode: 500, errors: [],
    });

    render(
      <Wrapper>
        <ProductsPage />
      </Wrapper>,
    );

    const button = await screen.findByTestId('import-web-catalog-button');
    fireEvent.click(button);

    await waitFor(() => expect(blockingAlertSpies.showBlockingError).toHaveBeenCalled());
    expect(toastSpies.showToastSuccess).not.toHaveBeenCalled();
    await waitFor(() => expect(button).not.toBeDisabled());
  });
});
