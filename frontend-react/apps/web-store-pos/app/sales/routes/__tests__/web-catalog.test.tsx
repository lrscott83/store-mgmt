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
