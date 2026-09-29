import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { EModules } from '@store-mgmt/domain';
import type { UserModel } from '@store-mgmt/domain';
import esMessages from '~/shared/lib/i18n/es';
import type { CatalogProductView, CatalogStatus } from '~/sales/lib/services/catalog-http-service';

/** Sesión mutable: el loader y los tests de gate la reescriben por prueba. */
const session = vi.hoisted(() => ({
  user: null as UserModel | null,
  logout: vi.fn(),
}));

vi.mock('~/shared/lib/stores/auth-store', () => ({
  useAuthStore: Object.assign(
    // La vista pide la tienda seleccionada con un selector; el resto del código usa `getState()`.
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
  buildCatalogSnapshot: vi.fn(() => ({
    categories: [{ id: 'c1', name: 'Ropa', order: 1, isActive: true }],
    products: [],
  })),
}));

vi.mock('~/sales/lib/catalog/catalog-snapshot', () => ({
  buildCatalogSnapshot: snapshotMock.buildCatalogSnapshot,
}));

const catalogMock = vi.hoisted(() => ({
  getStatus: vi.fn(),
  getProducts: vi.fn(),
  sync: vi.fn(),
  saveProductFields: vi.fn(),
  uploadImage: vi.fn(),
  removeImage: vi.fn(),
  reorderImages: vi.fn(),
  mediaUrl: vi.fn((slug: string, key: string) => `/media/${slug}/${key}`),
}));

vi.mock('~/sales/lib/services/catalog-http-service', () => ({
  catalogHttpService: catalogMock,
}));

const showBlockingErrorMock = vi.hoisted(() => vi.fn());
vi.mock('~/shared/lib/blocking-alert', () => ({
  showBlockingError: (...args: unknown[]) => showBlockingErrorMock(...args),
  confirmDialog: vi.fn(async () => true),
}));

const showToastSuccessMock = vi.hoisted(() => vi.fn());
vi.mock('~/shared/lib/toast', () => ({
  showToastSuccess: (...args: unknown[]) => showToastSuccessMock(...args),
}));

import { buildCatalogSnapshot } from '~/sales/lib/catalog/catalog-snapshot';
import { WebCatalogPage, clientLoader } from '../web-catalog';

const buildCatalogSnapshotMock = vi.mocked(buildCatalogSnapshot);

const envelope = <T,>(data: T) => ({ data, succeeded: true, message: '', actionCode: 200, errors: [] });

const STATUS: CatalogStatus = {
  storeSlug: 'mi-tienda',
  catalogUrl: '/catalog/mi-tienda',
  catalogSyncedAt: null,
  sourceCategoriesCount: 1,
  sourceProductsCount: 2,
  publishedProductsCount: 1,
  productsWithoutMainImageCount: 1,
};

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

/** Variante con imagen principal publicada (la galería la repite). */
const PRODUCT_WITH_IMAGE: CatalogProductView = {
  ...PRODUCT,
  id: 'p2',
  image: 't/s/p/foto.jpg',
  images: ['t/s/p/foto.jpg'],
};

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

function renderPage() {
  return render(
    <IntlProvider locale="es" messages={esMessages}>
      <WebCatalogPage />
    </IntlProvider>,
  );
}

describe('WebCatalogPage (vista Catálogo Web)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.user = makeUser();
    catalogMock.getStatus.mockResolvedValue(envelope(STATUS));
    catalogMock.getProducts.mockResolvedValue(envelope([PRODUCT]));
    catalogMock.uploadImage.mockResolvedValue(envelope('t/s/p/foto.jpg'));
    catalogMock.saveProductFields.mockResolvedValue(envelope(true));
    catalogMock.sync.mockResolvedValue(
      envelope({
        storeSlug: 'mi-tienda',
        catalogUrl: '/catalog/mi-tienda',
        syncedAt: '2026-09-27T10:00:00Z',
        categoriesCreated: 1,
        categoriesUpdated: 0,
        productsCreated: 2,
        productsUpdated: 0,
        productsDeactivated: 0,
      }),
    );
  });

  it('muestra la URL pública, el estado de sincronización y los contadores', async () => {
    renderPage();

    const link = await screen.findByTestId('catalog-public-url');
    expect(link).toHaveAttribute('href', `${window.location.origin}/catalog/mi-tienda`);
    expect(link).toHaveTextContent('/catalog/mi-tienda');

    expect(screen.getByTestId('catalog-last-sync')).toHaveTextContent('Nunca');
    expect(screen.getByText('Productos en venta').parentElement).toHaveTextContent('2');
    expect(screen.getByText('Publicados').parentElement).toHaveTextContent('1');
    expect(screen.getByText('Sin imagen').parentElement).toHaveTextContent('1');
  });

  it('sin catálogo publicado muestra el aviso en lugar de la URL', async () => {
    catalogMock.getStatus.mockResolvedValue(
      envelope({ ...STATUS, storeSlug: '', catalogUrl: '' }),
    );
    renderPage();

    expect(
      await screen.findByText('El catálogo aún no está publicado. Pulsa Sincronizar Catálogo.'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('catalog-public-url')).not.toBeInTheDocument();
  });

  it('sin productos en venta avisa en lugar de listar editores', async () => {
    catalogMock.getProducts.mockResolvedValue(envelope([]));
    renderPage();

    expect(
      await screen.findByText(
        'Esta tienda aún no tiene catálogo aquí. Pulsa Sincronizar Catálogo para subir los productos y categorías que ya tienes en el dispositivo; si la tienda está vacía, créalos antes en Catálogo Productos.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId(`catalog-product-${PRODUCT.id}`)).not.toBeInTheDocument();
  });

  it('sincronizar envía el catálogo local de la tienda y resume el resultado', async () => {
    renderPage();
    const button = await screen.findByTestId('catalog-sync-button');

    fireEvent.click(button);

    await waitFor(() => expect(catalogMock.sync).toHaveBeenCalledTimes(1));
    // El POS es offline-first: el snapshot sale de la tienda seleccionada, no del servidor.
    expect(buildCatalogSnapshotMock).toHaveBeenCalledWith('s1');
    expect(catalogMock.sync).toHaveBeenCalledWith(snapshotMock.buildCatalogSnapshot.mock.results[0].value);
    await waitFor(() =>
      expect(showToastSuccessMock).toHaveBeenCalledWith(
        expect.stringContaining('2 productos nuevos'),
      ),
    );
    expect(catalogMock.getStatus).toHaveBeenCalledTimes(2);
    expect(catalogMock.getProducts).toHaveBeenCalledTimes(2);
  });

  it('sin tienda seleccionada no sincroniza: avisa y no llama al endpoint', async () => {
    session.user = makeUser({ selectedStoreId: '' });
    renderPage();

    fireEvent.click(await screen.findByTestId('catalog-sync-button'));

    await waitFor(() => expect(showBlockingErrorMock).toHaveBeenCalled());
    expect(catalogMock.sync).not.toHaveBeenCalled();
    expect(buildCatalogSnapshotMock).not.toHaveBeenCalled();
  });

  it('agrupa los productos en paneles colapsables por categoría, cerrados por defecto', async () => {
    catalogMock.getProducts.mockResolvedValue(envelope([PRODUCT]));
    renderPage();

    // El panel existe y nace colapsado: el editor NO está montado aún.
    const toggle = await screen.findByTestId(`catalog-category-toggle-${PRODUCT.categoryId}`);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveTextContent(`Ropa (1)`);
    expect(screen.queryByTestId(`catalog-product-${PRODUCT.id}`)).not.toBeInTheDocument();

    fireEvent.click(toggle);

    // Al expandir se montan los productos de ESA categoría, con precio con moneda y SIN la
    // categoría repetida junto al precio.
    expect(screen.getByTestId(`catalog-product-${PRODUCT.id}`)).toBeInTheDocument();
    // Precio con moneda (el NBSP de los separadores se matchea con \s) y SIN la categoría
    // repetida junto al precio.
    expect(screen.getByTestId(`catalog-product-${PRODUCT.id}`)).toHaveTextContent(/100\s*CUP/);
    expect(screen.getByTestId(`catalog-product-${PRODUCT.id}`)).not.toHaveTextContent(/Ropa\s*CUP/);

    fireEvent.click(toggle);
    expect(screen.queryByTestId(`catalog-product-${PRODUCT.id}`)).not.toBeInTheDocument();
  });

  it('guardar sube SOLO la imagen seleccionada: al elegirla no se hace ninguna llamada', async () => {
    renderPage();

    fireEvent.click(await screen.findByTestId(`catalog-category-toggle-${PRODUCT.categoryId}`));
    const input = await screen.findByTestId(`catalog-upload-${PRODUCT.id}`);
    const file = new File(['x'], 'foto.jpg', { type: 'image/jpeg' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input);

    // Al SELECCIONAR no se toca la red (ni subida ni guardado): solo se retiene el archivo.
    expect(catalogMock.uploadImage).not.toHaveBeenCalled();
    expect(catalogMock.saveProductFields).not.toHaveBeenCalled();
    expect(screen.getByTestId(`catalog-pending-image-${PRODUCT.id}`)).toHaveTextContent(/foto\.jpg/);

    // TODO ocurre al pulsar Guardar: sube la imagen y, al no haber principal, la deja como tal.
    fireEvent.click(screen.getByTestId(`catalog-save-${PRODUCT.id}`));
    await waitFor(() => expect(catalogMock.uploadImage).toHaveBeenCalledWith('p1', file));
    await waitFor(() =>
      expect(catalogMock.saveProductFields).toHaveBeenCalledWith('p1', { image: 't/s/p/foto.jpg' }),
    );
    expect(showToastSuccessMock).toHaveBeenCalledWith('Producto guardado en el catálogo');
  });

  it('guardar con imagen retenida cuando YA hay principal solo la sube a la galería', async () => {
    catalogMock.getProducts.mockResolvedValue(envelope([PRODUCT_WITH_IMAGE]));
    renderPage();

    fireEvent.click(await screen.findByTestId(`catalog-category-toggle-${PRODUCT_WITH_IMAGE.categoryId}`));
    const input = await screen.findByTestId(`catalog-upload-${PRODUCT_WITH_IMAGE.id}`);
    const file = new File(['x'], 'extra.jpg', { type: 'image/jpeg' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input);
    fireEvent.click(screen.getByTestId(`catalog-save-${PRODUCT_WITH_IMAGE.id}`));

    await waitFor(() =>
      expect(catalogMock.uploadImage).toHaveBeenCalledWith('p2', file),
    );
    // Con principal existente NO se pisa: la nueva imagen solo engrosa la galería.
    await waitFor(() => expect(catalogMock.saveProductFields).not.toHaveBeenCalled());
    expect(showToastSuccessMock).toHaveBeenCalledWith('Producto guardado en el catálogo');
  });

  it('guardar sin cambios solo avisa, sin PUT vacío ni subida', async () => {
    renderPage();

    fireEvent.click(await screen.findByTestId(`catalog-category-toggle-${PRODUCT.categoryId}`));
    fireEvent.click(await screen.findByTestId(`catalog-save-${PRODUCT.id}`));

    await waitFor(() =>
      expect(showToastSuccessMock).toHaveBeenCalledWith('Producto guardado en el catálogo'),
    );
    expect(catalogMock.uploadImage).not.toHaveBeenCalled();
    expect(catalogMock.saveProductFields).not.toHaveBeenCalled();
  });

  it('un archivo que no es imagen no se retiene ni se sube', async () => {
    renderPage();

    fireEvent.click(await screen.findByTestId(`catalog-category-toggle-${PRODUCT.categoryId}`));
    const input = await screen.findByTestId(`catalog-upload-${PRODUCT.id}`);
    const file = new File(['hola'], 'notas.txt', { type: 'text/plain' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input);

    // El límite se anuncia en la cabecera del bloque y en el error del archivo inválido.
    expect(
      await screen.findAllByText('Hasta 6 imágenes de 2 MB (jpg, png o webp).'),
    ).not.toHaveLength(0);
    expect(catalogMock.uploadImage).not.toHaveBeenCalled();
    expect(screen.queryByTestId(`catalog-pending-image-${PRODUCT.id}`)).not.toBeInTheDocument();
  });

  // ── TESTS COMENTADOS (no borrados) ─────────────────────────────────────────────
  // Pertenecen a los campos de actualización (descripción, %, monto, Nuevo), comentados en la
  // vista por decisión del owner (2026-09-29). Al restaurar los campos, descomentar este bloque.
  //
  // it('guardar envía los campos del catálogo escalados y con el precio final calculado', async () => {
  //   renderPage();
  //
  //   const description = await screen.findByTestId(`catalog-description-${PRODUCT.id}`);
  //   fireEvent.change(description, { target: { value: 'Camisa de algodón\nSegunda línea' } });
  //   fireEvent.change(screen.getByTestId(`catalog-percent-${PRODUCT.id}`), {
  //     target: { value: '12.5' },
  //   });
  //   fireEvent.change(screen.getByTestId(`catalog-discount-${PRODUCT.id}`), {
  //     target: { value: '5' },
  //   });
  //
  //   // Precio final (D7) en vivo: 100 - 12.5 % = 87.50; 87.50 - 5.00 = 82.50.
  //   expect(screen.getByTestId(`catalog-final-price-${PRODUCT.id}`)).toHaveTextContent('82.50\u00A0CUP');
  //
  //   fireEvent.click(screen.getByTestId(`catalog-save-${PRODUCT.id}`));
  //
  //   await waitFor(() =>
  //     expect(catalogMock.saveProductFields).toHaveBeenCalledWith('p1', {
  //       description: 'Camisa de algodón\nSegunda línea',
  //       percentDiscountPrice: 1250,
  //       discountPrice: 500,
  //       isNew: false,
  //     }),
  //   );
  //   expect(showToastSuccessMock).toHaveBeenCalledWith('Producto guardado en el catálogo');
  // });
  //
  // it('un % fuera de rango no se envía y se avisa en pantalla', async () => {
  //   renderPage();
  //
  //   fireEvent.change(await screen.findByTestId(`catalog-percent-${PRODUCT.id}`), {
  //     target: { value: '120' },
  //   });
  //   fireEvent.click(screen.getByTestId(`catalog-save-${PRODUCT.id}`));
  //
  //   expect(
  //     await screen.findByText('El % de descuento debe estar entre 0 y 100.'),
  //   ).toBeInTheDocument();
  //   expect(catalogMock.saveProductFields).not.toHaveBeenCalled();
  // });
  // ────────────────────────────────────────────────────────────────────────────────
});

describe('clientLoader del catálogo (módulo 18 + Owner)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deja pasar al Owner con el módulo activo', async () => {
    session.user = makeUser();
    await expect(clientLoader()).resolves.toBeNull();
  });

  it('desloguea al Owner sin el módulo contratado', async () => {
    session.user = makeUser({ storeModuleIds: [] });

    const result = await clientLoader();

    expect(session.logout).toHaveBeenCalled();
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(302);
  });

  it('desloguea a un usuario de tienda aunque tenga la feature 122', async () => {
    session.user = makeUser({ isOwnerAdmin: false, featureIds: [122] });

    const result = await clientLoader();

    expect(session.logout).toHaveBeenCalled();
    expect(result).toBeInstanceOf(Response);
  });

  it('desloguea a una sesión sin autenticar', async () => {
    session.user = null;

    const result = await clientLoader();

    expect(session.logout).toHaveBeenCalled();
    expect(result).toBeInstanceOf(Response);
  });
});
