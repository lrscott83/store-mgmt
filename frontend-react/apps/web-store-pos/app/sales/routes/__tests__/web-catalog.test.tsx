import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { EModules } from '@store-mgmt/domain';
import type { UserModel } from '@store-mgmt/domain';
import esMessages from '~/shared/lib/i18n/es';
import type {
  CatalogBranding,
  CatalogProductView,
  CatalogShowcaseImage,
  CatalogShowcaseImages,
  CatalogStatus,
} from '~/sales/lib/services/catalog-http-service';

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
  getBranding: vi.fn(),
  updateBranding: vi.fn(),
  getShowcaseImages: vi.fn(),
  uploadShowcaseImage: vi.fn(),
  removeShowcaseImage: vi.fn(),
  reorderShowcaseImages: vi.fn(),
}));

// El módulo se sustituye ENTERO, pero no sus exports que no son el servicio: la vista consume el
// enum `CatalogShowcaseKind` por VALOR y lo necesita de aquí. Mismo patrón que el resto de pruebas
// del catálogo (`public-catalog.test.tsx`, `storefront-flow.test.tsx`).
vi.mock('~/sales/lib/services/catalog-http-service', async () => {
  const actual = await vi.importActual<
    typeof import('~/sales/lib/services/catalog-http-service')
  >('~/sales/lib/services/catalog-http-service');
  return { ...actual, catalogHttpService: { ...actual.catalogHttpService, ...catalogMock } };
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

const BRAND_WITHOUT_MEDIA: CatalogBranding = { logoKey: null, bannerKey: null, paletteId: 'default' };

const BRAND_WITH_MEDIA: CatalogBranding = {
  logoKey: 't/s/branding/logo.png',
  bannerKey: 't/s/branding/banner.png',
  paletteId: 'default',
};

/** Lo que el servidor devuelve tras un PUT PARCIAL que solo quitó el logo. */
const BRAND_WITH_BANNER_ONLY: CatalogBranding = {
  ...BRAND_WITH_MEDIA,
  logoKey: null,
};

/** Los DOS conjuntos con una imagen cada uno: sirven para comprobar que NO se mezclan. */
const SHOWCASE: CatalogShowcaseImages = {
  carousel: [
    {
      id: 'car-1',
      kind: 0,
      key: 't/s/showcase/carousel/uno.png',
      orderIndex: 0,
      caption: 'Portada',
      isActive: true,
    },
    {
      id: 'car-2',
      kind: 0,
      key: 't/s/showcase/carousel/dos.png',
      orderIndex: 1,
      caption: null,
      isActive: true,
    },
  ],
  daily: [
    {
      id: 'day-1',
      kind: 1,
      key: 't/s/showcase/daily/plato.jpg',
      orderIndex: 0,
      caption: 'Plato del día',
      isActive: true,
    },
  ],
};

/** Tienda recién sincronizada: los dos conjuntos vacíos, que NO es un 404. */
const SHOWCASE_EMPTY: CatalogShowcaseImages = { carousel: [], daily: [] };

/** Adjunta un archivo a un `<input type="file">` y dispara el cambio, como haría el diálogo. */
function selectFile(input: HTMLElement, file: File) {
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

/** Igual que `selectFile` pero para el input MULTI del showcase: una lista de archivos. */
function selectFiles(input: HTMLElement, files: File[]) {
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  fireEvent.change(input);
}

/**
 * Aplica a un conjunto el orden final que envió el cliente, como hace el backend al reordenar
 * (reescribe el índice de TODAS). Sirve para que el mock de la lista devuelva el estado real
 * después de un PUT y no el de antes.
 */
function reorderShowcase(
  images: CatalogShowcaseImage[],
  orderedIds: string[],
): CatalogShowcaseImage[] {
  const byId = new Map(images.map((image) => [image.id, image]));
  return orderedIds
    .map((id, index) => {
      const image = byId.get(id);
      return image ? { ...image, orderIndex: index } : null;
    })
    .filter((image): image is CatalogShowcaseImage => image !== null);
}

/** Los ids de las imágenes del carrusel EN EL ORDEN EN QUE SE PINTAN. */
function visibleCarouselIds(): (string | undefined)[] {
  return within(screen.getByTestId('showcase-carousel-images'))
    .getAllByTestId(/^showcase-image-/)
    .map((image) => image.getAttribute('data-testid')?.replace('showcase-image-', ''));
}

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
    catalogMock.getBranding.mockResolvedValue(envelope(BRAND_WITHOUT_MEDIA));
    catalogMock.updateBranding.mockResolvedValue(envelope(BRAND_WITHOUT_MEDIA));
    catalogMock.getShowcaseImages.mockResolvedValue(envelope(SHOWCASE_EMPTY));
    catalogMock.uploadShowcaseImage.mockResolvedValue(envelope(SHOWCASE.carousel[0]));
    catalogMock.removeShowcaseImage.mockResolvedValue(envelope(true));
    catalogMock.reorderShowcaseImages.mockResolvedValue(envelope(true));
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

    // TODO ocurre al pulsar el botón ÚNICO: sube la imagen y, al no haber principal, la deja como tal.
    fireEvent.click(screen.getByTestId('catalog-save-all-button'));
    await waitFor(() => expect(catalogMock.uploadImage).toHaveBeenCalledWith('p1', file));
    await waitFor(() =>
      expect(catalogMock.saveProductFields).toHaveBeenCalledWith('p1', { image: 't/s/p/foto.jpg' }),
    );
    await waitFor(() =>
      expect(showToastSuccessMock).toHaveBeenCalledWith('Se guardó 1 producto en el catálogo'),
    );
  });

  it('guardar con imagen retenida cuando YA hay principal la reemplaza y borra la anterior', async () => {
    catalogMock.getProducts.mockResolvedValue(envelope([PRODUCT_WITH_IMAGE]));
    // Clave DISTINTA a la principal existente: si el backend devolviera la misma ruta, no habría
    // nada que superseder y el borrado no corresponde.
    catalogMock.uploadImage.mockResolvedValue(envelope('t/s/p/nueva.jpg'));
    renderPage();

    fireEvent.click(await screen.findByTestId(`catalog-category-toggle-${PRODUCT_WITH_IMAGE.categoryId}`));
    const input = await screen.findByTestId(`catalog-upload-${PRODUCT_WITH_IMAGE.id}`);
    const file = new File(['x'], 'extra.jpg', { type: 'image/jpeg' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input);
    fireEvent.click(screen.getByTestId('catalog-save-all-button'));

    await waitFor(() =>
      expect(catalogMock.uploadImage).toHaveBeenCalledWith('p2', file),
    );
    // Una sola imagen por producto: la nueva es la principal, aunque ya hubiera una.
    await waitFor(() =>
      expect(catalogMock.saveProductFields).toHaveBeenCalledWith('p2', { image: 't/s/p/nueva.jpg' }),
    );
    // Y la principal anterior se borra DESPUÉS del guardado (si se borrara antes, el backend
    // anularía el puntero y el producto quedaría sin imagen).
    await waitFor(() =>
      expect(catalogMock.removeImage).toHaveBeenCalledWith('p2', 't/s/p/foto.jpg'),
    );
    await waitFor(() =>
      expect(showToastSuccessMock).toHaveBeenCalledWith('Se guardó 1 producto en el catálogo'),
    );
  });

  it('sin cambios pendientes el botón está deshabilitado y no toca la red', async () => {
    renderPage();

    fireEvent.click(await screen.findByTestId(`catalog-category-toggle-${PRODUCT.categoryId}`));
    const saveAll = await screen.findByTestId('catalog-save-all-button');

    // Sin diff no hay nada que guardar: el botón ni siquiera se puede pulsar, así que no cabe
    // ni un PUT vacío ni una subida sin motivo.
    expect(saveAll).toBeDisabled();
    expect(screen.getByTestId('catalog-pending-summary')).toHaveTextContent(
      'No hay cambios sin guardar',
    );
    fireEvent.click(saveAll);

    expect(catalogMock.uploadImage).not.toHaveBeenCalled();
    expect(catalogMock.saveProductFields).not.toHaveBeenCalled();
  });

  it('editar una descripción envía SOLO ese campo del producto tocado', async () => {
    const untouched: CatalogProductView = {
      ...PRODUCT,
      id: 'p9',
      categoryId: 'c2',
      categoryName: 'Calzado',
      name: 'Zapato',
    };
    catalogMock.getProducts.mockResolvedValue(envelope([PRODUCT, untouched]));
    renderPage();

    fireEvent.click(await screen.findByTestId(`catalog-category-toggle-${PRODUCT.categoryId}`));
    fireEvent.click(await screen.findByTestId(`catalog-category-toggle-${untouched.categoryId}`));
    fireEvent.change(await screen.findByTestId(`catalog-description-${PRODUCT.id}`), {
      target: { value: 'Camisa de algodón' },
    });

    fireEvent.click(screen.getByTestId('catalog-save-all-button'));

    // El diff manda: solo los campos que de verdad cambiaron, y solo del producto editado.
    // Ni `percentDiscountPrice`, ni `discountPrice`, ni `isNew` (siguen comentados en la vista).
    await waitFor(() => expect(catalogMock.saveProductFields).toHaveBeenCalledTimes(1));
    expect(catalogMock.saveProductFields).toHaveBeenCalledWith('p1', {
      description: 'Camisa de algodón',
    });
    // El producto intacto no genera entrada alguna.
    expect(catalogMock.saveProductFields).not.toHaveBeenCalledWith('p9', expect.anything());
    expect(catalogMock.uploadImage).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(showToastSuccessMock).toHaveBeenCalledWith('Se guardó 1 producto en el catálogo'),
    );
  });

  it('el guardado por lotes envía un PUT por producto modificado con solo SU payload', async () => {
    const second: CatalogProductView = {
      ...PRODUCT,
      id: 'p8',
      categoryId: 'c2',
      categoryName: 'Calzado',
      name: 'Zapato',
    };
    const untouched: CatalogProductView = { ...PRODUCT, id: 'p9', name: 'Gorra' };
    catalogMock.getProducts.mockResolvedValue(envelope([PRODUCT, second, untouched]));
    renderPage();

    fireEvent.click(await screen.findByTestId(`catalog-category-toggle-${PRODUCT.categoryId}`));
    fireEvent.click(await screen.findByTestId(`catalog-category-toggle-${second.categoryId}`));

    // Producto 1: descripción. Producto 2: imagen. Producto 3 (Gorra): nada.
    fireEvent.change(await screen.findByTestId(`catalog-description-${PRODUCT.id}`), {
      target: { value: 'Nueva descripción' },
    });
    const imageInput = await screen.findByTestId(`catalog-upload-${second.id}`);
    const file = new File(['x'], 'zapato.jpg', { type: 'image/jpeg' });
    Object.defineProperty(imageInput, 'files', { value: [file], configurable: true });
    fireEvent.change(imageInput);

    // Dos productos con cambios distintos: el resumen los cuenta a los dos.
    expect(screen.getByTestId('catalog-pending-summary')).toHaveTextContent(
      '2 productos con cambios sin guardar',
    );
    fireEvent.click(screen.getByTestId('catalog-save-all-button'));

    await waitFor(() => expect(catalogMock.saveProductFields).toHaveBeenCalledTimes(2));
    // Cada producto recibe SOLO lo suyo: el que cambió la descripción no sube nada y el que
    // subió la imagen no manda descripción.
    expect(catalogMock.saveProductFields).toHaveBeenCalledWith('p1', {
      description: 'Nueva descripción',
    });
    expect(catalogMock.saveProductFields).toHaveBeenCalledWith('p8', {
      image: 't/s/p/foto.jpg',
    });
    expect(catalogMock.saveProductFields).not.toHaveBeenCalledWith('p9', expect.anything());
    expect(catalogMock.uploadImage).toHaveBeenCalledWith('p8', file);
    expect(catalogMock.uploadImage).not.toHaveBeenCalledWith('p1', expect.anything());
    await waitFor(() =>
      expect(showToastSuccessMock).toHaveBeenCalledWith('Se guardaron 2 productos en el catálogo'),
    );
  });

  it('no existe ningún botón Guardar por producto: el guardado es uno al final', async () => {
    renderPage();

    fireEvent.click(await screen.findByTestId(`catalog-category-toggle-${PRODUCT.categoryId}`));

    // Con el panel expandido, el editor montado no trae botón propio.
    expect(screen.getByTestId(`catalog-product-${PRODUCT.id}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`catalog-save-${PRODUCT.id}`)).not.toBeInTheDocument();
    // Y el único que hay es el de la página.
    expect(screen.getAllByTestId('catalog-save-all-button')).toHaveLength(1);
  });

  it('el textarea arranca con la descripción que ya tiene el producto', async () => {
    const described: CatalogProductView = { ...PRODUCT, description: 'Camisa de algodón' };
    catalogMock.getProducts.mockResolvedValue(envelope([described]));
    renderPage();

    fireEvent.click(await screen.findByTestId(`catalog-category-toggle-${described.categoryId}`));

    expect(await screen.findByTestId(`catalog-description-${described.id}`)).toHaveValue(
      'Camisa de algodón',
    );
  });

  it('quitar la imagen principal la MARCA y la aplica el guardado por lotes', async () => {
    catalogMock.getProducts.mockResolvedValue(envelope([PRODUCT_WITH_IMAGE]));
    renderPage();

    fireEvent.click(
      await screen.findByTestId(`catalog-category-toggle-${PRODUCT_WITH_IMAGE.categoryId}`),
    );
    fireEvent.click(await screen.findByTestId(`catalog-clear-main-${PRODUCT_WITH_IMAGE.id}`));

    // Marcar NO borra nada todavía: solo deja el producto pendiente y lo dice en pantalla.
    expect(catalogMock.saveProductFields).not.toHaveBeenCalled();
    expect(catalogMock.removeImage).not.toHaveBeenCalled();
    expect(
      await screen.findByTestId(`catalog-pending-image-removal-${PRODUCT_WITH_IMAGE.id}`),
    ).toHaveTextContent('La imagen principal se quitará al guardar');
    expect(screen.getByTestId(`catalog-unsaved-${PRODUCT_WITH_IMAGE.id}`)).toHaveTextContent(
      'Sin guardar',
    );

    fireEvent.click(screen.getByTestId('catalog-save-all-button'));

    // `removeImage` viaja en el PUT como cualquier otro campo del diff; no hay subida de imagen.
    await waitFor(() =>
      expect(catalogMock.saveProductFields).toHaveBeenCalledWith('p2', { removeImage: true }),
    );
    expect(catalogMock.uploadImage).not.toHaveBeenCalled();
  });

  it('imagen retenida y borrado marcado son excluyentes: elegir una imagen cancela el borrado', async () => {
    catalogMock.getProducts.mockResolvedValue(envelope([PRODUCT_WITH_IMAGE]));
    renderPage();

    fireEvent.click(
      await screen.findByTestId(`catalog-category-toggle-${PRODUCT_WITH_IMAGE.categoryId}`),
    );
    fireEvent.click(await screen.findByTestId(`catalog-clear-main-${PRODUCT_WITH_IMAGE.id}`));
    const input = await screen.findByTestId(`catalog-upload-${PRODUCT_WITH_IMAGE.id}`);
    const file = new File(['x'], 'nueva.jpg', { type: 'image/jpeg' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input);

    // Sustituir la principal y quitarla son intenciones opuestas: gana la última.
    expect(
      screen.queryByTestId(`catalog-pending-image-removal-${PRODUCT_WITH_IMAGE.id}`),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId(`catalog-pending-image-${PRODUCT_WITH_IMAGE.id}`)).toHaveTextContent(
      /nueva\.jpg/,
    );

    fireEvent.click(screen.getByTestId('catalog-save-all-button'));

    await waitFor(() =>
      expect(catalogMock.saveProductFields).toHaveBeenCalledWith('p2', { image: 't/s/p/foto.jpg' }),
    );
    expect(
      catalogMock.saveProductFields,
    ).not.toHaveBeenCalledWith('p2', expect.objectContaining({ removeImage: true }));
  });

  it('una descripción demasiado larga bloquea el guardado y avisa en pantalla', async () => {
    catalogMock.getProducts.mockResolvedValue(envelope([PRODUCT]));
    renderPage();

    fireEvent.click(await screen.findByTestId(`catalog-category-toggle-${PRODUCT.categoryId}`));
    const description = await screen.findByTestId(`catalog-description-${PRODUCT.id}`);
    fireEvent.change(description, { target: { value: 'x'.repeat(4001) } });

    // El backend la rechazaría: el botón queda deshabilitado hasta corregirla y se nombra el motivo.
    // El aviso aparece DOS veces a propósito: junto al campo que hay que corregir y en la barra
    // del botón, para que se vea aunque la categoría esté plegada.
    const saveAll = await screen.findByTestId('catalog-save-all-button');
    expect(saveAll).toBeDisabled();
    expect(
      await screen.findAllByText('La descripción no puede pasar de 4000 caracteres.'),
    ).toHaveLength(2);

    fireEvent.change(description, { target: { value: 'Una descripción corta' } });

    await waitFor(() => expect(screen.getByTestId('catalog-save-all-button')).not.toBeDisabled());
    expect(
      screen.queryByText('La descripción no puede pasar de 4000 caracteres.'),
    ).not.toBeInTheDocument();
  });

  it('un archivo que no es imagen no se retiene ni se sube', async () => {
    renderPage();

    fireEvent.click(await screen.findByTestId(`catalog-category-toggle-${PRODUCT.categoryId}`));
    const input = await screen.findByTestId(`catalog-upload-${PRODUCT.id}`);
    const file = new File(['hola'], 'notas.txt', { type: 'text/plain' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input);

    // Con la galería oculta el aviso es el de la imagen única: formatos y tamaño, sin contar
    // cuántas imágenes caben. El texto "Hasta N imágenes…" solo vive ya en la galería.
    expect(
      await screen.findAllByText(/Solo imágenes jpg, png o webp de hasta 2 MB\./),
    ).not.toHaveLength(0);
    expect(catalogMock.uploadImage).not.toHaveBeenCalled();
    expect(screen.queryByTestId(`catalog-pending-image-${PRODUCT.id}`)).not.toBeInTheDocument();
  });

  // ── MARCA (F8) ────────────────────────────────────────────────────────────────────
  // El PUT de marca es un PARCHE y el de productos es un LOTE: los dos botones son
  // independientes y ninguna prueba de esta sección toca el guardado por lotes.
  describe('marca del catálogo (logo y banner)', () => {
    it('carga la marca al montar y no pinta previsualización si la tienda no tiene', async () => {
      renderPage();

      expect(await screen.findByTestId('brand-slot-logo')).toBeInTheDocument();
      expect(catalogMock.getBranding).toHaveBeenCalledTimes(1);
      // Sin clave guardada no hay <img>: no se reserva espacio ni se adivina una URL.
      expect(screen.queryByTestId('brand-logo')).not.toBeInTheDocument();
      expect(screen.queryByTestId('brand-banner')).not.toBeInTheDocument();
      // Y sin cambios pendientes su botón no se puede pulsar.
      expect(screen.getByTestId('brand-save')).toBeDisabled();
    });

    it('previsualiza el logo y el banner ya guardados por el endpoint público de media', async () => {
      catalogMock.getBranding.mockResolvedValue(envelope(BRAND_WITH_MEDIA));
      renderPage();

      const logo = await screen.findByTestId('brand-logo');
      expect(logo).toHaveAttribute(
        'src',
        `${window.location.origin}/api/v1/public/catalog/mi-tienda/media/t/s/branding/logo.png`,
      );
      expect(screen.getByTestId('brand-banner')).toHaveAttribute(
        'src',
        `${window.location.origin}/api/v1/public/catalog/mi-tienda/media/t/s/branding/banner.png`,
      );
    });

    it('elegir logo y banner los retiene sin tocar la red hasta pulsar Guardar marca', async () => {
      renderPage();

      const logo = new File(['x'], 'logo.png', { type: 'image/png' });
      const banner = new File(['x'], 'banner.jpg', { type: 'image/jpeg' });
      selectFile(await screen.findByTestId('brand-logo-upload'), logo);
      selectFile(await screen.findByTestId('brand-banner-upload'), banner);

      expect(screen.getByTestId('brand-pending-logo')).toHaveTextContent(/logo\.png/);
      expect(screen.getByTestId('brand-pending-banner')).toHaveTextContent(/banner\.jpg/);
      expect(catalogMock.updateBranding).not.toHaveBeenCalled();

      fireEvent.click(screen.getByTestId('brand-save'));

      // Un solo PUT con los dos lados: el backend los aplica en la misma petición.
      await waitFor(() => expect(catalogMock.updateBranding).toHaveBeenCalledTimes(1));
      expect(catalogMock.updateBranding).toHaveBeenCalledWith({ logo, banner });
      await waitFor(() =>
        expect(showToastSuccessMock).toHaveBeenCalledWith('Marca guardada'),
      );
    });

    it('el guardado de la marca NO toca el lote de productos ni al revés', async () => {
      renderPage();

      // Editar un producto y cambiar la marca a la vez: cada botón llama a SU endpoint.
      fireEvent.click(await screen.findByTestId(`catalog-category-toggle-${PRODUCT.categoryId}`));
      fireEvent.change(await screen.findByTestId(`catalog-description-${PRODUCT.id}`), {
        target: { value: 'Camisa de algodón' },
      });
      selectFile(await screen.findByTestId('brand-logo-upload'), new File(['x'], 'l.png', { type: 'image/png' }));

      fireEvent.click(screen.getByTestId('brand-save'));
      await waitFor(() => expect(catalogMock.updateBranding).toHaveBeenCalledTimes(1));
      // Guardar la marca no aplicó el diff de productos…
      expect(catalogMock.saveProductFields).not.toHaveBeenCalled();
      expect(catalogMock.uploadImage).not.toHaveBeenCalled();

      fireEvent.click(screen.getByTestId('catalog-save-all-button'));
      await waitFor(() => expect(catalogMock.saveProductFields).toHaveBeenCalledTimes(1));
      // …y guardar el producto no volvió a escribir la marca.
      expect(catalogMock.updateBranding).toHaveBeenCalledTimes(1);
    });

    it('marcar quitar NO borra nada todavía: lo aplica el botón de marca', async () => {
      // La carga del montage trae logo y banner; la recarga posterior al guardado ya no trae el
      // logo: es el servidor quien dice qué quedó guardado, no la vista.
      catalogMock.getBranding
        .mockResolvedValueOnce(envelope(BRAND_WITH_MEDIA))
        .mockResolvedValue(envelope(BRAND_WITH_BANNER_ONLY));
      catalogMock.updateBranding.mockResolvedValue(envelope(BRAND_WITH_BANNER_ONLY));
      renderPage();

      fireEvent.click(await screen.findByTestId('brand-logo-remove'));

      expect(catalogMock.updateBranding).not.toHaveBeenCalled();
      expect(screen.getByTestId('brand-pending-logo-remove')).toHaveTextContent(
        'El logo se quitará al guardar la marca',
      );

      fireEvent.click(screen.getByTestId('brand-save'));

      // El PUT parcial solo lleva `removeLogo`: el banner, no mencionado, no se toca.
      await waitFor(() =>
        expect(catalogMock.updateBranding).toHaveBeenCalledWith({ removeLogo: true }),
      );
      await waitFor(() => expect(screen.queryByTestId('brand-logo')).not.toBeInTheDocument());
      // El banner sobrevivió al PUT parcial: quitó el logo, no la marca entera.
      expect(screen.getByTestId('brand-banner')).toBeInTheDocument();
    });

    it('elegir una imagen cancela el borrado marcado del mismo lado: son excluyentes', async () => {
      catalogMock.getBranding.mockResolvedValue(envelope(BRAND_WITH_MEDIA));
      renderPage();

      fireEvent.click(await screen.findByTestId('brand-banner-remove'));
      expect(screen.getByTestId('brand-pending-banner-remove')).toBeInTheDocument();

      const file = new File(['x'], 'nuevo.png', { type: 'image/png' });
      selectFile(await screen.findByTestId('brand-banner-upload'), file);

      expect(screen.queryByTestId('brand-pending-banner-remove')).not.toBeInTheDocument();
      fireEvent.click(screen.getByTestId('brand-save'));

      await waitFor(() =>
        expect(catalogMock.updateBranding).toHaveBeenCalledWith({ banner: file }),
      );
    });

    it('un archivo que no es imagen no se retiene: avisa y no guarda', async () => {
      renderPage();

      selectFile(
        await screen.findByTestId('brand-logo-upload'),
        new File(['hola'], 'notas.txt', { type: 'text/plain' }),
      );

      // Misma validación local que la imagen de producto (formatos + tamaño).
      expect(await screen.findByTestId('brand-error')).toHaveTextContent(
        /Solo imágenes jpg, png o webp de hasta 2 MB\./,
      );
      expect(screen.queryByTestId('brand-pending-logo')).not.toBeInTheDocument();
      expect(screen.getByTestId('brand-save')).toBeDisabled();
    });

    it('si el PUT de marca falla se avisa y los cambios siguen pendientes', async () => {
      catalogMock.updateBranding.mockRejectedValue({ response: { status: 500 } });
      renderPage();

      selectFile(
        await screen.findByTestId('brand-logo-upload'),
        new File(['x'], 'logo.png', { type: 'image/png' }),
      );
      fireEvent.click(screen.getByTestId('brand-save'));

      await waitFor(() => expect(showBlockingErrorMock).toHaveBeenCalled());
      // No se limpia lo que no se guardó: el dueño puede reintentarlo sin volver a elegir.
      expect(screen.getByTestId('brand-pending-logo')).toHaveTextContent(/logo\.png/);
      expect(screen.getByTestId('brand-save')).not.toBeDisabled();
    });

    it('si la marca no carga, el catálogo y sus productos siguen utilizables', async () => {
      catalogMock.getBranding.mockRejectedValue({ response: { status: 403 } });
      renderPage();

      expect(await screen.findByTestId('brand-error')).toHaveTextContent(
        'No se pudo cargar la marca',
      );
      // La vista no se cae: productos, panels y guardado por lotes siguen ahí.
      fireEvent.click(await screen.findByTestId(`catalog-category-toggle-${PRODUCT.categoryId}`));
      expect(screen.getByTestId(`catalog-product-${PRODUCT.id}`)).toBeInTheDocument();
    });
  });

  // ── SHOWCASE: carrusel e imágenes del día ─────────────────────────────────────────
  // Los dos conjuntos son INDEPENDIENTES (decisión C1): cada uno sube, ordena y quita por su
  // cuenta, y ninguno pasa por el guardado por lotes de productos.
  describe('showcase del catálogo (carrusel e imágenes del día)', () => {
    it('carga los dos conjuntos al montar y previsualiza cada imagen por el endpoint de media', async () => {
      catalogMock.getShowcaseImages.mockResolvedValue(envelope(SHOWCASE));
      renderPage();

      expect(catalogMock.getShowcaseImages).toHaveBeenCalledTimes(1);

      // Cada conjunto muestra SOLO sus imágenes, por la ruta del endpoint público de media.
      expect(await screen.findByTestId('showcase-image-car-1')).toHaveAttribute(
        'src',
        `${window.location.origin}/api/v1/public/catalog/mi-tienda/media/t/s/showcase/carousel/uno.png`,
      );
      expect(screen.getByTestId('showcase-image-car-2')).toHaveAttribute(
        'src',
        `${window.location.origin}/api/v1/public/catalog/mi-tienda/media/t/s/showcase/carousel/dos.png`,
      );
      expect(screen.getByTestId('showcase-image-day-1')).toHaveAttribute(
        'src',
        `${window.location.origin}/api/v1/public/catalog/mi-tienda/media/t/s/showcase/daily/plato.jpg`,
      );
      // La imagen del día no aparece en el bloque del carrusel, ni al revés.
      expect(screen.getByTestId('showcase-carousel-upload')).toBeInTheDocument();
      expect(screen.getByTestId('showcase-daily-upload')).toBeInTheDocument();
      expect(screen.getAllByTestId(/^showcase-image-/)).toHaveLength(3);
    });

    it('una tienda sin imágenes muestra los dos bloques vacíos, no un error', async () => {
      renderPage();

      expect(await screen.findByTestId('showcase-carousel-upload')).toBeInTheDocument();
      expect(screen.getByTestId('showcase-daily-upload')).toBeInTheDocument();
      expect(screen.getAllByText('Sin imágenes en este conjunto')).toHaveLength(2);
      // Sin selección no hay nada que subir: el botón ni siquiera se puede pulsar.
      expect(screen.getByTestId('showcase-carousel-save')).toBeDisabled();
      expect(catalogMock.uploadShowcaseImage).not.toHaveBeenCalled();
    });

    it('elegir archivos solo los retiene: la subida ocurre al pulsar Subir imágenes', async () => {
      renderPage();

      const first = new File(['x'], 'uno.jpg', { type: 'image/jpeg' });
      const second = new File(['x'], 'dos.jpg', { type: 'image/jpeg' });
      selectFiles(await screen.findByTestId('showcase-carousel-upload'), [first, second]);

      // Elegir NO toca la red: el upload es un POST por imagen y va con su propio botón.
      expect(catalogMock.uploadShowcaseImage).not.toHaveBeenCalled();
      expect(screen.getByTestId('showcase-carousel-pending')).toHaveTextContent(
        '2 imágenes por subir',
      );
      expect(screen.getByTestId('showcase-carousel-save')).not.toBeDisabled();

      fireEvent.click(screen.getByTestId('showcase-carousel-save'));

      // Un POST por archivo, y el conjunto viaja en CADA payload (0 = carrusel).
      await waitFor(() => expect(catalogMock.uploadShowcaseImage).toHaveBeenCalledTimes(2));
      expect(catalogMock.uploadShowcaseImage).toHaveBeenNthCalledWith(1, {
        kind: 0,
        file: first,
      });
      expect(catalogMock.uploadShowcaseImage).toHaveBeenNthCalledWith(2, {
        kind: 0,
        file: second,
      });
      await waitFor(() =>
        expect(showToastSuccessMock).toHaveBeenCalledWith('Se subieron 2 imágenes al catálogo'),
      );
      // Subido todo, no queda nada retenido y la lista se recarga desde el servidor.
      await waitFor(() =>
        expect(screen.queryByTestId('showcase-carousel-pending')).not.toBeInTheDocument(),
      );
      expect(catalogMock.getShowcaseImages).toHaveBeenCalledTimes(2);
    });

    it('el pie de foto viaja con la imagen y solo si el dueño lo escribió', async () => {
      renderPage();

      const conPie = new File(['x'], 'con-pie.jpg', { type: 'image/jpeg' });
      selectFiles(await screen.findByTestId('showcase-daily-upload'), [conPie]);
      fireEvent.change(screen.getByTestId('showcase-daily-caption'), {
        target: { value: 'Pasta del día' },
      });
      fireEvent.click(screen.getByTestId('showcase-daily-save'));

      // El conjunto del día es OTRO (1) y el pie viaja en el mismo POST: no hay endpoint para
      // cambiarlo después, así que se manda con el alta.
      await waitFor(() =>
        expect(catalogMock.uploadShowcaseImage).toHaveBeenCalledWith({
          kind: 1,
          file: conPie,
          caption: 'Pasta del día',
        }),
      );

      // Sin pie no se manda la clave: vacío y ausente no son lo mismo para el comando.
      const sinPie = new File(['x'], 'sin-pie.jpg', { type: 'image/jpeg' });
      selectFiles(screen.getByTestId('showcase-daily-upload'), [sinPie]);
      fireEvent.click(screen.getByTestId('showcase-daily-save'));
      await waitFor(() => expect(catalogMock.uploadShowcaseImage).toHaveBeenCalledTimes(2));
      expect(catalogMock.uploadShowcaseImage).toHaveBeenLastCalledWith({
        kind: 1,
        file: sinPie,
      });
    });

    it('subir al carrusel no toca el conjunto del día', async () => {
      renderPage();

      const file = new File(['x'], 'portada.jpg', { type: 'image/jpeg' });
      selectFiles(await screen.findByTestId('showcase-carousel-upload'), [file]);
      fireEvent.click(screen.getByTestId('showcase-carousel-save'));

      await waitFor(() => expect(catalogMock.uploadShowcaseImage).toHaveBeenCalledTimes(1));
      expect(catalogMock.uploadShowcaseImage).toHaveBeenCalledWith(expect.objectContaining({ kind: 0 }));
      expect(catalogMock.uploadShowcaseImage).not.toHaveBeenCalledWith(
        expect.objectContaining({ kind: 1 }),
      );
      // El pie de foto del día es suyo: el carrusel no lo tocó.
      expect(screen.getByTestId('showcase-daily-caption')).toHaveValue('');
    });

    it('mover una imagen envía el orden final COMPLETO de su conjunto', async () => {
      // El servidor es el dueño del orden: tras el PUT devuelve la lista ya reordenada, así que
      // el segundo movimiento parte del resultado del primero y no del estado inicial.
      let state = SHOWCASE;
      catalogMock.getShowcaseImages.mockImplementation(async () => envelope(state));
      catalogMock.reorderShowcaseImages.mockImplementation(async (kind: number, ids: string[]) => {
        const set = kind === 0 ? state.carousel : state.daily;
        state = { ...state, [kind === 0 ? 'carousel' : 'daily']: reorderShowcase(set, ids) };
        return envelope(true);
      });
      renderPage();

      // La segunda del carrusel sube: el backend reescribe el índice de TODAS, no solo el suyo.
      fireEvent.click(await screen.findByTestId('showcase-move-up-car-2'));

      await waitFor(() => expect(catalogMock.reorderShowcaseImages).toHaveBeenCalledTimes(1));
      expect(catalogMock.reorderShowcaseImages).toHaveBeenCalledWith(0, ['car-2', 'car-1']);
      // La imagen del día no se menciona: el reordenado es POR conjunto.
      expect(catalogMock.reorderShowcaseImages).not.toHaveBeenCalledWith(1, expect.anything());
      await waitFor(() => expect(visibleCarouselIds()).toEqual(['car-2', 'car-1']));

      fireEvent.click(screen.getByTestId('showcase-move-down-car-2'));
      await waitFor(() => expect(catalogMock.reorderShowcaseImages).toHaveBeenCalledTimes(2));
      expect(catalogMock.reorderShowcaseImages).toHaveBeenLastCalledWith(0, ['car-1', 'car-2']);
      await waitFor(() => expect(visibleCarouselIds()).toEqual(['car-1', 'car-2']));
    });

    it('las flechas de los extremos no envían nada', async () => {
      catalogMock.getShowcaseImages.mockResolvedValue(envelope(SHOWCASE));
      renderPage();

      // La primera no puede subir y la única del día no puede bajar: no hay con qué cambiar.
      expect(await screen.findByTestId('showcase-move-up-car-1')).toBeDisabled();
      expect(screen.getByTestId('showcase-move-down-day-1')).toBeDisabled();

      fireEvent.click(screen.getByTestId('showcase-move-up-car-1'));
      fireEvent.click(screen.getByTestId('showcase-move-down-day-1'));
      expect(catalogMock.reorderShowcaseImages).not.toHaveBeenCalled();
    });

    it('quitar una imagen la borra del servidor y recarga la lista', async () => {
      catalogMock.getShowcaseImages.mockResolvedValue(envelope(SHOWCASE));
      renderPage();

      fireEvent.click(await screen.findByTestId('showcase-remove-car-2'));

      await waitFor(() => expect(catalogMock.removeShowcaseImage).toHaveBeenCalledWith('car-2'));
      await waitFor(() =>
        expect(showToastSuccessMock).toHaveBeenCalledWith('Imagen quitada del catálogo'),
      );
      expect(catalogMock.getShowcaseImages).toHaveBeenCalledTimes(2);
    });

    it('el showcase NO toca el guardado por lotes de productos ni al revés', async () => {
      catalogMock.getShowcaseImages.mockResolvedValue(envelope(SHOWCASE));
      renderPage();

      // Editar un producto y subir una imagen del carrusel a la vez: cada botón llama a SU
      // endpoint y ninguno arrastra al otro.
      fireEvent.click(await screen.findByTestId(`catalog-category-toggle-${PRODUCT.categoryId}`));
      fireEvent.change(await screen.findByTestId(`catalog-description-${PRODUCT.id}`), {
        target: { value: 'Camisa de algodón' },
      });
      selectFiles(await screen.findByTestId('showcase-carousel-upload'), [
        new File(['x'], 'nueva.jpg', { type: 'image/jpeg' }),
      ]);
      fireEvent.click(screen.getByTestId('showcase-carousel-save'));

      await waitFor(() => expect(catalogMock.uploadShowcaseImage).toHaveBeenCalledTimes(1));
      expect(catalogMock.saveProductFields).not.toHaveBeenCalled();
      expect(screen.getByTestId('catalog-pending-summary')).toHaveTextContent(
        '1 producto con cambios sin guardar',
      );

      fireEvent.click(screen.getByTestId('catalog-save-all-button'));
      await waitFor(() => expect(catalogMock.saveProductFields).toHaveBeenCalledTimes(1));
      // Guardar el producto no volvió a escribir el showcase.
      expect(catalogMock.uploadShowcaseImage).toHaveBeenCalledTimes(1);
    });

    it('un archivo que no es imagen no se retiene: avisa y no sube', async () => {
      renderPage();

      selectFiles(await screen.findByTestId('showcase-carousel-upload'), [
        new File(['hola'], 'notas.txt', { type: 'text/plain' }),
      ]);

      // Misma validación local que la imagen de producto (formatos + tamaño).
      expect(
        await screen.findByText(/Solo imágenes jpg, png o webp de hasta 2 MB\./),
      ).toBeInTheDocument();
      expect(catalogMock.uploadShowcaseImage).not.toHaveBeenCalled();
      expect(screen.queryByTestId('showcase-carousel-pending')).not.toBeInTheDocument();
      expect(screen.getByTestId('showcase-carousel-save')).toBeDisabled();
    });

    it('si el showcase no carga, el catálogo y sus productos siguen utilizables', async () => {
      catalogMock.getShowcaseImages.mockRejectedValue({ response: { status: 403 } });
      renderPage();

      // El error se nombra en los dos bloques y la vista no se cae.
      expect(await screen.findAllByTestId(/^showcase-(carousel|daily)-error$/)).toHaveLength(2);
      expect(screen.getByTestId('showcase-carousel-error')).toHaveTextContent(
        'No se pudieron cargar las imágenes del catálogo',
      );
      fireEvent.click(await screen.findByTestId(`catalog-category-toggle-${PRODUCT.categoryId}`));
      expect(screen.getByTestId(`catalog-product-${PRODUCT.id}`)).toBeInTheDocument();
    });
  });

  // ── TESTS COMENTADOS (no borrados) ─────────────────────────────────────────────
  // Pertenecen a los campos de actualización que SIGUEN comentados en la vista (%, monto y
  // "Nuevo") por decisión del owner (2026-09-29); la descripción ya es editable (2026-10-01).
  // Al restaurar esos campos, descomentar este bloque y cambiar `catalog-save-${id}` por
  // `catalog-save-all-button` (el guardado por lotes ya no tiene botón por producto).
  //
  // it('guardar envía los campos del catálogo escalados y con el precio final calculado', async () => {
  //   renderPage();
  //
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
  //   fireEvent.click(screen.getByTestId('catalog-save-all-button'));
  //
  //   await waitFor(() =>
  //     expect(catalogMock.saveProductFields).toHaveBeenCalledWith('p1', {
  //       description: 'Camisa de algodón\nSegunda línea',
  //       percentDiscountPrice: 1250,
  //       discountPrice: 500,
  //       isNew: false,
  //     }),
  //   );
  //   await waitFor(() =>
  //     expect(showToastSuccessMock).toHaveBeenCalledWith('Se guardó 1 producto en el catálogo'),
  //   );
  // });
  //
  // it('un % fuera de rango no se envía y se avisa en pantalla', async () => {
  //   renderPage();
  //
  //   fireEvent.change(await screen.findByTestId(`catalog-percent-${PRODUCT.id}`), {
  //     target: { value: '120' },
  //   });
  //   fireEvent.click(screen.getByTestId('catalog-save-all-button'));
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
