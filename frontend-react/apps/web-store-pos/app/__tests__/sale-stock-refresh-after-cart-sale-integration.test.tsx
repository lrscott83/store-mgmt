// REPRODUCCIÓN — la vista de venta no refleja el inventario descontado por una venta
// registrada en el carrito global.
//
// Test de INTEGRACIÓN SIN mocks de datos — misma estrategia que
// `app/__tests__/available-multistore-integration.test.tsx` y
// `app/__tests__/entries-multistore-integration.test.tsx`: jsdom localStorage + DEK real +
// SERVICIOS REALES (ProductCategory / Product / Inventory / Order) + las VISTAS REALES
// (SalePage, WholesalePage y CartShell). La venta se registra pulsando el botón real del
// carrito, así que lo que se verifica es exactamente lo que la app escribe y lee.
//
// Lo que se fija: tras `OrderOfflineService.createOrder` el stock debe bajar TAMBIÉN en la
// vista montada, no solo en el almacenamiento. El canal de notificación
// (`useDataRevisionStore`) sí se dispara y las vistas sí se suscriben; lo que falla es la
// lectura, porque `InventoryOfflineService` cachea el mapa de entradas por instancia y solo
// lo recarga cuando el mapa está vacío o cambia la llave de tienda.
//
// RED hoy: el almacenamiento ya tiene el stock descontado y la vista sigue mostrando el
// anterior. Pasa cuando la vista vuelva a leer el dato.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import { EModules } from '@store-mgmt/domain';
import type { UserModel } from '@store-mgmt/domain';
import { ProductOfflineService } from '~/sales/lib/services/product-offline-service';
import { ProductCategoryOfflineService } from '~/sales/lib/services/product-category-offline-service';
import { InventoryOfflineService } from '~/inventory/lib/services/inventory-offline-service';
import { setDek, clearDek } from '~/shared/lib/storage/data-key-store';
import { StorageKeys } from '~/shared/lib/storage/storage-keys';
import { writeDeviceDekTable } from '~/shared/lib/storage/device-dek-table';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { useCartStore } from '~/shared/lib/stores/cart-store';
// La hidratación real del auth-store deja una cola fire-and-forget (/me en background) —
// mismas razones que available-multistore-integration.
import { allowUnmockedHttpReporting } from '~/shared/lib/testing/block-real-http';
allowUnmockedHttpReporting();
import { SalePage } from '~/sales/routes/sale';
import { WholesalePage } from '~/sales/routes/wholesale';
import { CartShell } from '~/shared/components/cart-shell';

const STORE_ID = 's1';

// ─── Sesión real (AUTH_MODEL + CURRENT_USER), como hace la app al autenticar ─────────

function ownerUser(): UserModel {
  return {
    id: 'user-1',
    login: 'owner',
    firstName: 'Owner',
    lastName: 'Test',
    email: '',
    activated: true,
    langKey: 'es',
    imageUrl: '',
    activatedBy: '',
    resetDate: null as unknown as string,
    resetKey: null as unknown as string,
    isSuperAdmin: false,
    isOwnerAdmin: true,
    isReSeller: false,
    isDemo: false,
    expiresIn: Date.now() + 60 * 60 * 1000,
    // El módulo de Inventario es lo que habilita el badge de disponibilidad y el
    // descuento de stock en createOrder (EModules.Inventory = 3).
    selectedStoreId: STORE_ID,
    storeList: [{ id: STORE_ID, name: 'Tienda A', isActive: true }],
    storeModuleIds: [EModules.Inventory],
    featureIds: [],
    roles: [{ storeId: STORE_ID, featureIds: [] }],
  } as unknown as UserModel;
}

function seedSession() {
  const user = ownerUser();
  localStorage.setItem(
    StorageKeys.AUTH_MODEL,
    JSON.stringify({ authToken: 'test-token', expiresIn: user.expiresIn }),
  );
  localStorage.setItem(StorageKeys.CURRENT_USER, JSON.stringify(user));
  void useAuthStore.getState().getUserByToken();
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

// ─── Catálogo + inventario por servicios REALES ─────────────────────────────────────

/**
 * Crea categoría → producto (descuenta inventario, con config mayorista) → entrada de
 * inventario de `quantity` unidades, exactamente como lo hace la app.
 */
async function seedCatalogAndInventory(quantity: number) {
  const categorySvc = new ProductCategoryOfflineService(STORE_ID);
  await categorySvc.createProductCategory('Bebidas', 1, true);
  const categoryId = categorySvc['categoryRepository'].getProductCategories()[0].id;

  const productSvc = new ProductOfflineService(STORE_ID);
  await productSvc.createProduct(
    categoryId,
    'Cerveza',
    100,
    'biz-1',
    1,
    /* isActive */ true,
    /* availableToSale */ true,
    /* discountFromInvantory */ true,
    /* barcode */ undefined,
    /* wholesale */ { packSize: 6, tiers: [{ minPacks: 1, pricePerUnit: 90 }] },
  );
  const productId = [...productSvc['productRepository'].getStorageProductsMap().values()][0].id;

  const inventorySvc = new InventoryOfflineService(STORE_ID, productSvc['productRepository']);
  const created = inventorySvc.createInventoryEntry(productId, quantity, 25);
  expect(created?.succeeded).toBe(true);

  return { productId, product: [...productSvc['productRepository'].getStorageProductsMap().values()][0] };
}

/** Lo que una instancia NUEVA del servicio lee del almacenamiento: la verdad persistida. */
function persistedAvailable(productId: string, units: number): number {
  const productSvc = new ProductOfflineService(STORE_ID);
  const reader = new InventoryOfflineService(STORE_ID, productSvc['productRepository']);
  return reader.getAvailableQuantity(productId).available;
}

/** Mete la unidad en el carrito REAL y pulsa "Registrar" en el carrito REAL. */
async function registerSaleFromCart() {
  await waitFor(() => expect(screen.getByTestId('cart-badge').textContent).not.toBe('0'));

  fireEvent.click(screen.getByTestId('cart-badge'));
  const registerButton = await screen.findByRole('button', { name: /registrar/i });
  expect(registerButton).not.toBeDisabled();
  fireEvent.click(registerButton);

  // El carrito se vacía al registrar: es la señal observable de que createOrder terminó.
  await waitFor(() => expect(screen.getByTestId('cart-badge').textContent).toBe('0'));
}

describe('La venta registrada en el carrito refresca el inventario de la vista actual', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDek();
    setDek(crypto.getRandomValues(new Uint8Array(32)), STORE_ID);
    writeDeviceDekTable({
      formatVersion: 2,
      dekSource: 'roster',
      storeId: STORE_ID,
      device: null,
      users: {},
    });
    useCartStore.getState().clear();
    seedSession();
  });

  afterEach(() => clearDek());

  it('SR-1: /sales/new — tras registrar la venta el stock persistido baja y la vista lo muestra', async () => {
    const { product, productId } = await seedCatalogAndInventory(10);

    render(
      <>
        <SalePage />
        <CartShell />
      </>,
      { wrapper: Wrapper },
    );

    // Punto de partida: la vista montada muestra las 10 unidades reales.
    const badge = await screen.findByTestId('available-stock');
    await waitFor(() => expect(badge.textContent).toBe('(10)'));

    // La venta se registra por el camino real: el carrito real llama a
    // OrderOfflineService.createOrder con 2 unidades.
    useCartStore.getState().addItem(product, 2);
    await registerSaleFromCart();

    // 1) La mutación persistió el descuento: una instancia nueva lee 8.
    expect(persistedAvailable(productId, 2)).toBe(8);

    // 2) Y la vista montada debe mostrarlo sin recargar. HOY ESTO FALLA: sigue en 10.
    await waitFor(() => expect(screen.getByTestId('available-stock').textContent).toBe('(8)'));
  });

  it('SR-2: /sales/wholesale — misma vista, mismo fallo tras registrar la venta', async () => {
    const { product, productId } = await seedCatalogAndInventory(10);

    render(
      <>
        <WholesalePage />
        <CartShell />
      </>,
      { wrapper: Wrapper },
    );

    const badge = await screen.findByTestId('available-stock');
    await waitFor(() => expect(badge.textContent).toBe('(10)'));

    useCartStore.getState().addItem(product, 2);
    await registerSaleFromCart();

    expect(persistedAvailable(productId, 2)).toBe(8);
    await waitFor(() => expect(screen.getByTestId('available-stock').textContent).toBe('(8)'));
  });

  it('SR-3: el dato guardado SÍ es correcto — remontar la vista lo muestra (control)', async () => {
    const { product, productId } = await seedCatalogAndInventory(10);

    const first = render(
      <>
        <SalePage />
        <CartShell />
      </>,
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(screen.getByTestId('available-stock').textContent).toBe('(10)'));

    useCartStore.getState().addItem(product, 2);
    await registerSaleFromCart();

    // Control del defecto: el almacenamiento tiene el stock nuevo...
    expect(persistedAvailable(productId, 2)).toBe(8);

    // ...y Montar de nuevo, con otra instancia del servicio y su caché vacía, lo muestra.
    // Este caso NO afirma nada sobre la vista que quedó montada (eso es SR-1): solo
    // separa "el dato está mal" de "la vista no lo vuelve a pedir".
    first.unmount();
    render(
      <>
        <SalePage />
        <CartShell />
      </>,
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(screen.getByTestId('available-stock').textContent).toBe('(8)'));
  });
});