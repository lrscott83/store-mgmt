import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { Currency, EModules } from '@store-mgmt/domain';
import type { UserModel } from '@store-mgmt/domain';
import esMessages from '~/shared/lib/i18n/es';
import { makeStore } from '~/sales/components/__tests__/store-fixture';
import type {
  CatalogCategory,
  CatalogProductView,
  CatalogStatus,
} from '~/sales/lib/services/catalog-http-service';

/** Sesión mutable, igual que `web-catalog.test.tsx`: cada prueba fija su usuario. */
const session = vi.hoisted(() => ({
  user: null as UserModel | null,
  logout: vi.fn(),
}));

vi.mock('~/shared/lib/stores/auth-store', () => ({
  useAuthStore: Object.assign(
    vi.fn((selector?: (state: { user: UserModel | null }) => unknown) =>
      selector ? selector({ user: session.user }) : session.user,
    ),
    {
      getState: () => ({
        user: session.user,
        isAuthenticated: session.user !== null,
        logout: session.logout,
      }),
    },
  ),
}));

const snapshotMock = vi.hoisted(() => ({
  buildCatalogSnapshot: vi.fn(() => ({ categories: [], products: [] })),
}));

vi.mock('~/sales/lib/catalog/catalog-snapshot', () => ({
  buildCatalogSnapshot: snapshotMock.buildCatalogSnapshot,
}));

const catalogMock = vi.hoisted(() => ({
  getStatus: vi.fn(),
  getProducts: vi.fn(),
  getCategories: vi.fn(),
  createCategory: vi.fn(),
  createProduct: vi.fn(),
  sync: vi.fn(),
  saveProductFields: vi.fn(),
  uploadImage: vi.fn(),
  removeImage: vi.fn(),
  reorderImages: vi.fn(),
  mediaUrl: vi.fn((slug: string, key: string) => `/media/${slug}/${key}`),
  getBranding: vi.fn(),
  updateBranding: vi.fn(),
  getShowcaseImages: vi.fn(),
  uploadShowcaseImage: vi.fn(),
  removeShowcaseImage: vi.fn(),
  reorderShowcaseImages: vi.fn(),
}));

// El módulo se sustituye ENTERO, pero se conservan sus exports de valor (`CatalogShowcaseKind`),
// igual que en `web-catalog.test.tsx`.
const storeScopeMock = vi.hoisted(() => ({
  catalogClientForStore: vi.fn(),
}));

vi.mock('~/sales/lib/services/catalog-http-service', async () => {
  const actual = await vi.importActual<typeof import('~/sales/lib/services/catalog-http-service')>(
    '~/sales/lib/services/catalog-http-service',
  );
  return {
    ...actual,
    catalogHttpService: { ...actual.catalogHttpService, ...catalogMock },
    catalogClientForStore: storeScopeMock.catalogClientForStore,
  };
});

const showBlockingErrorMock = vi.hoisted(() => vi.fn());
vi.mock('~/shared/lib/blocking-alert', () => ({
  showBlockingError: (...args: unknown[]) => showBlockingErrorMock(...args),
  confirmDialog: vi.fn(async () => true),
}));

const showToastSuccessMock = vi.hoisted(() => vi.fn());
vi.mock('~/shared/lib/toast', () => ({
  showToastSuccess: (...args: unknown[]) => showToastSuccessMock(...args),
}));

// La tarjeta de ubicación lee y guarda la tienda por su cuenta: se mockea solo eso.
const storeMock = vi.hoisted(() => ({
  getStore: vi.fn(),
  updateStore: vi.fn(),
}));
vi.mock('~/management/stores/lib/services/store-http-service', async () => {
  const actual = await vi.importActual<
    typeof import('~/management/stores/lib/services/store-http-service')
  >('~/management/stores/lib/services/store-http-service');
  return { ...actual, storeHttpService: { ...actual.storeHttpService, ...storeMock } };
});

import { WebCatalogSettingsView } from '~/sales/components/web-catalog-settings-view';

const envelope = <T,>(data: T) => ({
  data,
  succeeded: true,
  message: '',
  actionCode: 200,
  errors: [],
});

const STATUS: CatalogStatus = {
  storeSlug: 'mi-tienda',
  catalogUrl: '/catalog/mi-tienda',
  catalogSyncedAt: null,
  sourceCategoriesCount: 1,
  sourceProductsCount: 1,
  publishedProductsCount: 1,
  productsWithoutMainImageCount: 0,
};

const CATEGORY_ROPA: CatalogCategory = { id: 'c1', name: 'Ropa', order: 1 };
const CATEGORY_BEBIDAS: CatalogCategory = { id: 'c2', name: 'Bebidas', order: 2 };

const PRODUCT: CatalogProductView = {
  id: 'p1',
  categoryId: 'c1',
  categoryName: 'Ropa',
  name: 'Camisa',
  price: 100,
  currency: 'CUP',
  order: 1,
  availableToSale: true,
  isActive: true,
  description: '',
  percentDiscountPrice: 0,
  discountPrice: 0,
  isNew: false,
  image: null,
  images: [],
  finalPrice: 100,
  hasDiscount: false,
};

const BRANDING = {
  logoKey: null,
  bannerKey: null,
  paletteId: 'default',
  mobileColumns: 2,
};

const STORE = makeStore();

function makeUser(overrides: Partial<UserModel> = {}): UserModel {
  return {
    id: 'u1',
    login: 'owner@test.com',
    fullName: 'Owner',
    cellPhone: '+1234567890',
    email: 'owner@test.com',
    isActive: true,
    password: '',
    authToken: 'tok',
    refreshToken: 'ref',
    expiresIn: Date.now() + 1000000,
    roles: [],
    featureIds: [122],
    storeModuleIds: [EModules.WebCatalog],
    isSuperAdmin: false,
    isOwnerAdmin: true,
    isReSeller: false,
    selectedStoreId: 's1',
    paymentDueDate: null,
    isInTrial: false,
    paymentStatus: 'NoAplica',
    ...overrides,
  };
}

/** Adjunta un archivo a un `<input type="file">` y dispara el cambio, como el diálogo. */
function selectFile(input: HTMLElement, file: File) {
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

function renderAdminView() {
  return render(
    <IntlProvider locale="es" messages={esMessages}>
      <WebCatalogSettingsView storeId="store-route" />
    </IntlProvider>,
  );
}

function renderOwnerView() {
  return render(
    <IntlProvider locale="es" messages={esMessages}>
      <WebCatalogSettingsView />
    </IntlProvider>,
  );
}

/**
 * Alta directa del SuperAdmin (T4/T5): la MISMA vista store-scoped gana "Nueva categoría" y
 * "Nuevo producto". Los paneles se construyen desde la lista de categorías, así que una
 * categoría sin productos se ve como panel vacío. La vista del dueño no cambia.
 */
describe('WebCatalogSettingsView — alta directa del SuperAdmin', () => {
  const scoped = {
    getStatus: vi.fn(),
    getProducts: vi.fn(),
    getCategories: vi.fn(),
    createCategory: vi.fn(),
    createProduct: vi.fn(),
    sync: vi.fn(),
    saveProductFields: vi.fn(),
    uploadImage: vi.fn(),
    removeImage: vi.fn(),
    reorderImages: vi.fn(),
    getBranding: vi.fn(),
    updateBranding: vi.fn(),
    getShowcaseImages: vi.fn(),
    uploadShowcaseImage: vi.fn(),
    removeShowcaseImage: vi.fn(),
    reorderShowcaseImages: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    session.user = makeUser({
      isSuperAdmin: true,
      isOwnerAdmin: false,
      selectedStoreId: 'session-store',
      // Sin MultiMonedas (15) a propósito: el SuperAdmin no tiene módulos de tienda y el alta
      // debe poder elegir moneda igualmente.
      storeModuleIds: [EModules.WebCatalog],
    });
    scoped.getStatus.mockResolvedValue(envelope(STATUS));
    scoped.getProducts.mockResolvedValue(envelope([PRODUCT]));
    scoped.getCategories.mockResolvedValue(envelope([CATEGORY_ROPA]));
    scoped.createCategory.mockResolvedValue(envelope(CATEGORY_BEBIDAS));
    scoped.createProduct.mockResolvedValue(envelope({ id: 'new-product' }));
    scoped.uploadImage.mockResolvedValue(envelope('t/s/p/nueva.jpg'));
    scoped.saveProductFields.mockResolvedValue(envelope(true));
    scoped.getBranding.mockResolvedValue(envelope(BRANDING));
    scoped.updateBranding.mockResolvedValue(envelope(BRANDING));
    scoped.getShowcaseImages.mockResolvedValue(envelope({ carousel: [], daily: [] }));
    scoped.uploadShowcaseImage.mockResolvedValue(envelope({}));
    scoped.removeShowcaseImage.mockResolvedValue(envelope(true));
    scoped.reorderShowcaseImages.mockResolvedValue(envelope(true));
    scoped.sync.mockResolvedValue(envelope({}));
    storeMock.getStore.mockResolvedValue(envelope(STORE));
    storeScopeMock.catalogClientForStore.mockReturnValue(scoped);
  });

  it('ADMIN-UI-1: el SuperAdmin ve "Nueva categoría" y "Nuevo producto" en el panel', async () => {
    renderAdminView();

    expect(await screen.findByTestId('catalog-new-category-button')).toHaveTextContent(
      'Nueva categoría',
    );

    fireEvent.click(await screen.findByTestId('catalog-category-toggle-c1'));

    expect(await screen.findByTestId('catalog-new-product-c1')).toHaveTextContent('Nuevo producto');
    // El panel se sigue construyendo por categoría: el conteo no cambia.
    expect(screen.getByTestId('catalog-category-toggle-c1')).toHaveTextContent('Ropa (1)');
  });

  it('ADMIN-UI-2: crear una categoría la deja como panel vacío sin tocar los productos', async () => {
    scoped.getCategories
      .mockResolvedValueOnce(envelope([CATEGORY_ROPA]))
      .mockResolvedValue(envelope([CATEGORY_ROPA, CATEGORY_BEBIDAS]));
    renderAdminView();

    fireEvent.click(await screen.findByTestId('catalog-new-category-button'));
    fireEvent.change(await screen.findByTestId('catalog-new-category-name'), {
      target: { value: 'Bebidas' },
    });
    fireEvent.change(screen.getByTestId('catalog-new-category-order'), {
      target: { value: '2' },
    });
    fireEvent.click(screen.getByTestId('catalog-new-category-submit'));

    await waitFor(() =>
      expect(scoped.createCategory).toHaveBeenCalledWith({ name: 'Bebidas', order: 2 }),
    );

    // La categoría nueva aparece como panel aunque no tenga productos, y el repo del servidor
    // es lo que se pinta (la lista de categorías se recargó).
    const emptyPanel = await screen.findByTestId('catalog-category-toggle-c2');
    expect(emptyPanel).toHaveTextContent('Bebidas (0)');
    expect(scoped.getCategories).toHaveBeenCalledTimes(2);
    expect(scoped.createProduct).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByTestId('catalog-new-category-modal')).not.toBeInTheDocument(),
    );
    expect(showToastSuccessMock).toHaveBeenCalledWith('Categoría creada');
  });

  it('ADMIN-UI-3: crear un producto lo postea, sube la imagen y recarga', async () => {
    renderAdminView();

    fireEvent.click(await screen.findByTestId('catalog-category-toggle-c1'));
    fireEvent.click(await screen.findByTestId('catalog-new-product-c1'));

    // La categoría del panel llega precargada al modal.
    expect(await screen.findByTestId('catalog-new-product-category')).toHaveValue('c1');

    fireEvent.change(screen.getByTestId('catalog-new-product-name'), {
      target: { value: 'Camisa nueva' },
    });
    fireEvent.change(screen.getByTestId('catalog-new-product-price'), {
      target: { value: '12.50' },
    });
    fireEvent.change(screen.getByTestId('catalog-new-product-currency'), {
      target: { value: String(Currency.USD) },
    });
    fireEvent.change(screen.getByTestId('catalog-new-product-description'), {
      target: { value: 'Azul' },
    });
    const image = new File(['x'], 'camisa.jpg', { type: 'image/jpeg' });
    selectFile(screen.getByTestId('catalog-new-product-image'), image);
    fireEvent.click(screen.getByTestId('catalog-new-product-submit'));

    await waitFor(() =>
      expect(scoped.createProduct).toHaveBeenCalledWith({
        categoryId: 'c1',
        name: 'Camisa nueva',
        price: 12.5,
        currency: Currency.USD,
        description: 'Azul',
      }),
    );
    // El alta primero, la imagen después: el id que devuelve el alta es la ruta de la subida.
    await waitFor(() => expect(scoped.uploadImage).toHaveBeenCalledWith('new-product', image));
    expect(scoped.createProduct.mock.invocationCallOrder[0]).toBeLessThan(
      scoped.uploadImage.mock.invocationCallOrder[0],
    );
    // Solo se recarga DESPUÉS de subir la imagen, para que el panel ya muestre la principal.
    await waitFor(() => expect(scoped.getProducts).toHaveBeenCalledTimes(2));
    expect(scoped.getCategories).toHaveBeenCalledTimes(2);
    expect(showToastSuccessMock).toHaveBeenCalledWith('Producto creado en el catálogo');
  });

  it('OWNER-UI-1: el dueño no ve las acciones de alta ni paneles de categorías vacías', async () => {
    session.user = makeUser();
    catalogMock.getStatus.mockResolvedValue(envelope(STATUS));
    catalogMock.getProducts.mockResolvedValue(envelope([PRODUCT]));
    // El backend del dueño no expone esta lista: la vista no la pide y, por tanto, una categoría
    // sin productos no puede aparecer como panel.
    catalogMock.getCategories.mockResolvedValue(envelope([CATEGORY_ROPA, CATEGORY_BEBIDAS]));
    catalogMock.getBranding.mockResolvedValue(envelope(BRANDING));
    catalogMock.updateBranding.mockResolvedValue(envelope(BRANDING));
    catalogMock.getShowcaseImages.mockResolvedValue(envelope({ carousel: [], daily: [] }));
    storeMock.getStore.mockResolvedValue(envelope(STORE));

    renderOwnerView();

    await screen.findByTestId('catalog-category-toggle-c1');
    expect(screen.queryByTestId('catalog-new-category-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('catalog-category-toggle-c2')).not.toBeInTheDocument();
    expect(catalogMock.getCategories).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('catalog-category-toggle-c1'));
    expect(screen.queryByTestId('catalog-new-product-c1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('catalog-new-product-c2')).not.toBeInTheDocument();
  });

  it('OWNER-UI-2: sin productos el dueño conserva el aviso de siempre', async () => {
    session.user = makeUser();
    catalogMock.getStatus.mockResolvedValue(envelope(STATUS));
    catalogMock.getProducts.mockResolvedValue(envelope([]));
    catalogMock.getBranding.mockResolvedValue(envelope(BRANDING));
    catalogMock.getShowcaseImages.mockResolvedValue(envelope({ carousel: [], daily: [] }));
    storeMock.getStore.mockResolvedValue(envelope(STORE));

    renderOwnerView();

    expect(
      await screen.findByText(
        'Esta tienda aún no tiene catálogo aquí. Pulsa Sincronizar Catálogo para subir los productos y categorías que ya tienes en el dispositivo; si la tienda está vacía, créalos antes en Catálogo Productos.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('catalog-new-category-button')).not.toBeInTheDocument();
    expect(within(document.body).queryAllByTestId(/^catalog-category-toggle-/)).toHaveLength(0);
  });
});
