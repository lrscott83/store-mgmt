// Inventario Disponible — tests de INTEGRACIÓN sin mocks de datos (bug 2026-09-18,
// gemelo del de inventory/entries: mismo lector, mismos paneles multi-tienda).
//
// El bug con MultiStores: el servicio persiste products/categories/entries como
// MAPAS serializados ([[id, valor], ...]); el lector multi-tienda los trataba como
// arrays planos con isActive → todo se descartaba y los paneles mostraban "sin
// datos" (el lector ya está arreglado; estos tests lo fijan y cubren los
// headers/totales pedidos).
//
// Estrategia: jsdom localStorage + DEK real + SERVICIOS REALES (ProductOffline/
// ProductCategoryOffline/InventoryOffline) + las VISTAS reales. Ningún dato
// inventado a mano: lo que se verifica es exactamente lo que la app escribe y lee.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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
// La hidratación real del auth-store deja una cola fire-and-forget (/me en
// background) — mismas razones que root.test.tsx / entries-multistore-integration.
import { allowUnmockedHttpReporting } from '~/shared/lib/testing/block-real-http';
allowUnmockedHttpReporting();
import { InventoryAvailablePage } from '~/inventory/routes/available';

// ─── Sesión real (AUTH_MODEL + CURRENT_USER), como hace la app al autenticar ──

function ownerUser(storeIds: string[], storeNames: string[], withMultiStores: boolean): UserModel {
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
    selectedStoreId: storeIds[0],
    storeList: storeIds.map((id, i) => ({ id, name: storeNames[i], isActive: true })),
    storeModuleIds: withMultiStores ? [EModules.MultiStores] : [],
    featureIds: [],
    roles: storeIds.map((id) => ({ storeId: id, featureIds: [] })),
  } as unknown as UserModel;
}

function seedSession(user: UserModel) {
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

// ─── Escenario real completo: categoría → producto → entrada HOY → vistas ──────

describe('Inventario Disponible — flujo real sin mocks de datos', () => {
  const STORE_ID = 's1';

  beforeEach(() => {
    localStorage.clear();
    clearDek();
    setDek(crypto.getRandomValues(new Uint8Array(32)), STORE_ID);
    // Tabla device-DEK v2 como la que la app escribe al provisionar el login.
    // s2 queda SIN wrap → "sin datos locales" (caso real de store sin login aquí).
    writeDeviceDekTable({
      formatVersion: 2,
      dekSource: 'roster',
      storeId: STORE_ID,
      device: null,
      users: {},
    });
  });

  afterEach(() => clearDek());

  async function seedCatalogAndTodayEntry(productName: string) {
    const categorySvc = new ProductCategoryOfflineService(STORE_ID);
    await categorySvc.createProductCategory('Bebidas', 1, true);
    const categoryId = categorySvc['categoryRepository'].getProductCategories()[0].id;
    const productSvc = new ProductOfflineService(STORE_ID);
    await productSvc.createProduct(
      categoryId,
      productName,
      100,
      'biz-1',
      1,
      true,
      true,
      false,
    );
    const productId = productSvc['productRepository'].getStorageProductsMap().values().next()
      .value!.id;
    const inventorySvc = new InventoryOfflineService(STORE_ID, productSvc['productRepository']);
    const result = inventorySvc.createInventoryEntry(productId, 10, 25);
    expect(result?.succeeded).toBe(true);
    return { productId, categoryId };
  }

  it('IV-1: SIN MultiStores — header «Inventario (10)» con la cantidad disponible y el costo total a la derecha', async () => {
    seedSession(ownerUser([STORE_ID], ['Tienda A'], false));
    await seedCatalogAndTodayEntry('Cerveza');

    render(
      <Wrapper>
        <InventoryAvailablePage />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('Inventario')).toBeInTheDocument();
    });
    // Cantidad disponible de PRODUCTOS (suma de available de las entradas activas).
    expect(screen.getByText('(10)')).toBeInTheDocument();
    // Costo total a la derecha: 10 × $25 = $250.
    expect(screen.getAllByText('$250').length).toBeGreaterThan(0);
  });

  it('IV-2: SIN MultiStores — la entrada creada HOY deja el producto disponible con nombre, cantidad, costo promedio y total', async () => {
    seedSession(ownerUser([STORE_ID], ['Tienda A'], false));
    const { categoryId } = await seedCatalogAndTodayEntry('Cerveza');

    render(
      <Wrapper>
        <InventoryAvailablePage />
      </Wrapper>,
    );

    // Categorías colapsadas por defecto (Angular parity) — expandir la nuestra.
    fireEvent.click(screen.getByTestId(`inventory-category-toggle-${categoryId}`));
    await waitFor(() => {
      expect(screen.getByText('Cerveza (10)')).toBeInTheDocument();
    });
    // Datos del producto en la fila: costo promedio y valor total ($25 / $250).
    expect(screen.getByText('$25')).toBeInTheDocument();
    expect(screen.getAllByText('$250').length).toBeGreaterThan(0);
  });

  it('IV-3: SIN MultiStores — el buscador actualiza el (n) y el costo total del header según el filtro', async () => {
    seedSession(ownerUser([STORE_ID], ['Tienda A'], false));
    await seedCatalogAndTodayEntry('Cerveza');

    render(
      <Wrapper>
        <InventoryAvailablePage />
      </Wrapper>,
    );

    const search = screen.getByRole('searchbox');
    fireEvent.change(search, { target: { value: 'Cerveza' } });
    await waitFor(() => {
      // El header sigue el filtro: sigue habiendo 10 disponibles de Cerveza.
      expect(screen.getByText('(10)')).toBeInTheDocument();
    });
    fireEvent.change(search, { target: { value: 'Ron' } });
    await waitFor(() => {
      // Sin coincidencias → (0) y total $0 en el header.
      expect(screen.getByText('(0)')).toBeInTheDocument();
    });
    expect(screen.getByText('No existe ningún producto disponible en la categoría')).toBeInTheDocument();
  });

  it('IV-4: CON MultiStores — el panel de la tienda muestra el producto real (formato mapa serializado) y su total por tienda', async () => {
    seedSession(ownerUser([STORE_ID, 's2'], ['Tienda A', 'Tienda B'], true));
    await seedCatalogAndTodayEntry('Cerveza');

    render(
      <Wrapper>
        <InventoryAvailablePage />
      </Wrapper>,
    );

    // El contenido del panel solo renderiza al abrirlo.
    fireEvent.click(await screen.findByTestId(`multistore-panel-toggle-${STORE_ID}`));
    await waitFor(() => {
      // La categoría del panel incluye el (10) de unidades disponibles.
      expect(screen.getByText(/Bebidas \(10\)/)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId(/multistore-inventory-category-toggle-/));
    await waitFor(() => {
      expect(screen.getByText('Cerveza (10)')).toBeInTheDocument();
    });
    // Total de la tienda en su cabecera: 10 × $25.
    const panel = screen
      .getByTestId(`multistore-panel-toggle-${STORE_ID}`)
      .closest('.rounded-lg');
    expect(within(panel as HTMLElement).getAllByText('$250').length).toBeGreaterThan(0);
  });

  it('IV-5: CON MultiStores — el header sigue el filtro de tienda: (n) y total solo de la tienda filtrada', async () => {
    seedSession(ownerUser([STORE_ID, 's2'], ['Tienda A', 'Tienda B'], true));
    await seedCatalogAndTodayEntry('Cerveza');

    render(
      <Wrapper>
        <InventoryAvailablePage />
      </Wrapper>,
    );

    // Filtrar a la tienda con datos: el header cuenta SOLO lo suyo (10 / $250).
    fireEvent.change(await screen.findByTestId('multistore-select'), {
      target: { value: STORE_ID },
    });
    await waitFor(() => {
      expect(screen.getAllByText('(10)').length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText('$250').length).toBeGreaterThan(0);
    // Filtrar a la tienda sin datos: el header baja a (0) / $0.
    fireEvent.change(screen.getByTestId('multistore-select'), {
      target: { value: 's2' },
    });
    await waitFor(() => {
      expect(screen.getAllByText('(0)').length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText('$0').length).toBeGreaterThan(0);
  });

  it('IV-6: CON MultiStores — tienda sin datos locales muestra "sin datos" y la que tiene muestra el producto', async () => {
    seedSession(ownerUser([STORE_ID, 's2'], ['Tienda A', 'Tienda B'], true));
    await seedCatalogAndTodayEntry('Cerveza');

    render(
      <Wrapper>
        <InventoryAvailablePage />
      </Wrapper>,
    );

    fireEvent.click(await screen.findByTestId('multistore-panel-toggle-s2'));
    await waitFor(() => {
      expect(
        screen.getByText('Sin datos de esta tienda en este dispositivo'),
      ).toBeInTheDocument();
    });
    // La tienda con datos: cerrar B y abrir A — su producto aparece.
    fireEvent.click(screen.getByTestId('multistore-panel-toggle-s2'));
    fireEvent.click(await screen.findByTestId(`multistore-panel-toggle-${STORE_ID}`));
    await waitFor(() => {
      expect(screen.getByText(/Bebidas \(10\)/)).toBeInTheDocument();
    });
  });

  it('IV-7: CON MultiStores — la búsqueda global (fuera de los paneles) filtra las categorías de los paneles', async () => {
    seedSession(ownerUser([STORE_ID, 's2'], ['Tienda A', 'Tienda B'], true));
    await seedCatalogAndTodayEntry('Cerveza');

    render(
      <Wrapper>
        <InventoryAvailablePage />
      </Wrapper>,
    );

    fireEvent.click(await screen.findByTestId(`multistore-panel-toggle-${STORE_ID}`));
    await waitFor(() => {
      expect(screen.getByText(/Bebidas \(10\)/)).toBeInTheDocument();
    });
    // Búsqueda por producto: la categoría auto-expande y muestra la fila.
    fireEvent.change(screen.getByTestId('multistore-inventory-search'), {
      target: { value: 'Cerveza' },
    });
    await waitFor(() => {
      expect(screen.getByText('Cerveza (10)')).toBeInTheDocument();
    });
    // Búsqueda sin coincidencias → mensaje de vacío.
    fireEvent.change(screen.getByTestId('multistore-inventory-search'), {
      target: { value: 'Ron' },
    });
    await waitFor(() => {
      expect(
        screen.getByText('No existe ningún producto disponible en la categoría'),
      ).toBeInTheDocument();
    });
  });

  it('IV-8: SIN MultiStores — crear una SEGUNDA entrada hoy para otro producto: el header agrega y el buscador filtra', async () => {
    seedSession(ownerUser([STORE_ID], ['Tienda A'], false));
    await seedCatalogAndTodayEntry('Cerveza');

    // Segundo producto con su propia entrada (5 × $40 = $200) vía servicios reales.
    const categorySvc = new ProductCategoryOfflineService(STORE_ID);
    await categorySvc.createProductCategory('Carnes', 2, true);
    const catRepo = categorySvc['categoryRepository'];
    const carnesId = catRepo.getProductCategories().find((c) => c.name === 'Carnes')!.id;
    const productSvc = new ProductOfflineService(STORE_ID);
    await productSvc.createProduct(carnesId, 'Chuleta', 80, 'biz-1', 2, true, true, false);
    const productsMap = productSvc['productRepository'].getStorageProductsMap();
    const chuletaId = [...productsMap.values()].find((p) => p.name === 'Chuleta')!.id;
    const inventorySvc = new InventoryOfflineService(STORE_ID, productSvc['productRepository']);
    expect(inventorySvc.createInventoryEntry(chuletaId, 5, 40)?.succeeded).toBe(true);

    render(
      <Wrapper>
        <InventoryAvailablePage />
      </Wrapper>,
    );

    // Header agregado: (10 + 5) = (15) disponibles, total $250 + $200 = $450.
    await waitFor(() => {
      expect(screen.getByText('(15)')).toBeInTheDocument();
    });
    expect(screen.getAllByText('$450').length).toBeGreaterThan(0);
    // El buscador filtra: solo Cerveza → (10) y $250.
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Cerveza' } });
    await waitFor(() => {
      expect(screen.getByText('(10)')).toBeInTheDocument();
    });
    expect(screen.getAllByText('$250').length).toBeGreaterThan(0);
  });
});