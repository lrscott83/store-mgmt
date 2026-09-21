// Entradas (Historial) — tests de INTEGRACIÓN sin mocks de datos (bug 2026-09-18).
//
// El bug con MultiStores: el servicio de inventario PERSISTE las entradas como un
// MAPA serializado por producto ([[productId, [entradas...]], ...]) pero el lector
// multi-tienda (read-store-entities) trataba cada elemento del parse como una
// ENTRADA directa con isActive — cada elemento es un PAR [id, valor] sin isActive,
// así que .filter(e => e.isActive) descartaba TODO y los paneles multi-tienda
// siempre mostraban "sin datos". Los tests previos del lector sembraban arrays
// planos (un formato que la app nunca produce), por eso nadie lo vio.
//
// Estrategia: jsdom localStorage + DEK real en memoria + SERVICIOS REALES
// (ProductOfflineService / ProductCategoryOfflineService / InventoryOfflineService)
// + las VISTAS reales renderizadas. Ningún dato inventado a mano: lo que se
// verifica es exactamente lo que la app escribe y lee.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import { EModules } from '@store-mgmt/domain';
import type { UserModel } from '@store-mgmt/domain';
import { ProductOfflineService } from '~/sales/lib/services/product-offline-service';
import { ProductCategoryOfflineService } from '~/sales/lib/services/product-category-offline-service';
import { InventoryOfflineService } from '~/inventory/lib/services/inventory-offline-service';
import { setDek, clearDek, getDek } from '~/shared/lib/storage/data-key-store';
import { decryptEntityWithDek, encryptEntity } from '~/shared/lib/storage/entity-crypto';
import { readStoreEntities } from '~/shared/lib/storage/read-store-entities';
import { StorageKeys } from '~/shared/lib/storage/storage-keys';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { writeDeviceDekTable } from '~/shared/lib/storage/device-dek-table';
// La hidratación real del auth-store deja una cola fire-and-forget (/me en
// background, nunca await) — misma forma que root.test.tsx. Las peticiones
// siguen BLOQUEADAS (sin red real); solo se silencia el reporte del tail.
import { allowUnmockedHttpReporting } from '~/shared/lib/testing/block-real-http';
allowUnmockedHttpReporting();
import { toLocalDayKey } from '~/shared/lib/date-utils';
import { EntriesPage } from '~/inventory/routes/entries';
import { InventoryAvailablePage } from '~/inventory/routes/available';

// ─── Sesión real (AUTH_MODEL en localStorage), como hace la app al autenticar ──

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
  // Misma hidratación que la app real: AUTH_MODEL (token/expiración) +
  // CURRENT_USER (perfil) y getUserByToken(), que con cache válida NO llama
  // al backend (offline-first) y setea el usuario síncronamente.
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

function renderEntries() {
  return render(
    <Wrapper>
      <EntriesPage />
    </Wrapper>,
  );
}

const todayKey = toLocalDayKey(new Date());

// ─── read-store-entities: el lector multi-tienda entiende el formato real ─────

describe('readStoreEntities — formato mapa serializado (formato REAL de la app)', () => {
  const dek = crypto.getRandomValues(new Uint8Array(32));

  beforeEach(() => {
    localStorage.clear();
    setDek(dek, 's1');
  });
  afterEach(() => clearDek());

  it('IT-1: extrae los VALORES cuando el payload es un mapa [[id, valor], ...] (formato real del servicio de inventario)', () => {
    const realShape = [
      ['p1', [{ id: 'e1', productId: 'p1', isActive: true, quantity: 10 }]],
      ['p2', [{ id: 'e2', productId: 'p2', isActive: false, quantity: 5 }]],
    ];
    localStorage.setItem(StorageKeys.entityKey('inventory-entries', 's1'), JSON.stringify(realShape));

    const rows = readStoreEntities<{ id: string; isActive: boolean }>(
      'inventory-entries',
      's1',
      dek,
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.id)).toEqual(['e1', 'e2']);
  });

  it('IT-2: mantiene la compatibilidad con arrays planos (p. ej. orders/saleCredits)', () => {
    const flat = [
      { id: 'o1', isActive: true },
      { id: 'o2', isActive: false },
    ];
    localStorage.setItem(StorageKeys.entityKey('orders', 's1'), JSON.stringify(flat));

    const rows = readStoreEntities<{ id: string }>('orders', 's1', dek);
    expect(rows.map((r) => r.id)).toEqual(['o1', 'o2']);
  });

  it('IT-3: payload vacío del auto-init ([] y {}) → sin filas, sin errores', () => {
    localStorage.setItem(StorageKeys.entityKey('orders', 's1'), '[]');
    localStorage.setItem(StorageKeys.entityKey('products', 's1'), '[]');
    expect(readStoreEntities('orders', 's1', dek)).toEqual([]);
    expect(readStoreEntities('products', 's1', dek)).toEqual([]);
  });

  it('IT-4: JSON corrupto → sin filas (silent failure, nunca lanza)', () => {
    localStorage.setItem(StorageKeys.entityKey('orders', 's1'), '{not json');
    expect(readStoreEntities('orders', 's1', dek)).toEqual([]);
  });
});

// ─── Escenario real completo: categoría → producto → entrada HOY → vistas ──────

describe('Entradas (Historial) — flujo real sin mocks de datos', () => {
  const STORE_ID = 's1';

  beforeEach(() => {
    localStorage.clear();
    clearDek();
    setDek(crypto.getRandomValues(new Uint8Array(32)), STORE_ID);
    // Tabla device-DEK v2 como la que la app escribe al provisionar el login:
    // sin ella, unwrapStoreDekForStore no reconoce ni la tienda seleccionada.
    // s2 queda SIN wrap → "sin datos locales" (caso real de store sin login).
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
    const categoryId = categorySvc[
      'categoryRepository'
    ].getProductCategories()[0].id;
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
    const productId = productSvc[
      'productRepository'
    ].getStorageProductsMap()
      .values()
      .next().value!.id;
    const inventorySvc = new InventoryOfflineService(
      STORE_ID,
      productSvc['productRepository'],
    );
    const result = inventorySvc.createInventoryEntry(productId, 10, 25);
    expect(result?.succeeded).toBe(true);
    return { productId, categoryId };
  }

  it('IT-5: SIN MultiStores — header «Entradas (10)» con la cantidad de productos y el costo total a la derecha', async () => {
    seedSession(ownerUser([STORE_ID], ['Tienda A'], false));
    await seedCatalogAndTodayEntry('Cerveza');

    renderEntries();

    await waitFor(() => {
      expect(screen.getByText('Entradas')).toBeInTheDocument();
    });
    // Cantidad de PRODUCTOS (suma de quantities de las entradas activas).
    expect(screen.getByText('(10)')).toBeInTheDocument();
    // Costo total a la derecha: 10 × 25 CUP = 250 CUP.
    expect(screen.getAllByText('250 CUP').length).toBeGreaterThan(0);
    // La línea duplicada "Historial de Entradas" (label + total bajo el filtro) ya NO existe.
    expect(screen.queryByText(/Historial de Entradas/)).not.toBeInTheDocument();
  });

  it('IT-6: SIN MultiStores — la entrada creada HOY aparece agrupada en el día de hoy con producto, cantidad, costo y fecha', async () => {
    seedSession(ownerUser([STORE_ID], ['Tienda A'], false));
    await seedCatalogAndTodayEntry('Cerveza');

    renderEntries();

    const dayToggle = await screen.findByTestId(`entry-day-panel-toggle-${todayKey}`);
    expect(within(dayToggle).getByText('250 CUP')).toBeInTheDocument();
    fireEvent.click(dayToggle);
    await waitFor(() => {
      expect(screen.getByText('Cerveza')).toBeInTheDocument();
    });
    // Datos de la entrada en la fila: cantidad y costo unitario (10 × 25 CUP).
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('25 CUP')).toBeInTheDocument();
    expect(screen.getAllByText('250 CUP').length).toBeGreaterThan(0);
  });

  it('IT-7: CON MultiStores — el panel de la tienda muestra las entradas del formato real de la app (mapa serializado)', async () => {
    seedSession(ownerUser([STORE_ID, 's2'], ['Tienda A', 'Tienda B'], true));
    await seedCatalogAndTodayEntry('Cerveza');

    renderEntries();

    // El panel de la tienda ya no está vacío: abre el panel y espera el toggle del día de HOY.
    const panelToggle = await screen.findByTestId(`multistore-panel-toggle-${STORE_ID}`);
    fireEvent.click(panelToggle);
    await waitFor(() => {
      expect(screen.getByTestId(`multistore-entry-day-toggle-${STORE_ID}-${todayKey}`)).toBeInTheDocument();
    });
    // El total del panel de la tienda refleja la entrada real (10 × $25).
    const panel = screen
      .getByTestId(`multistore-panel-toggle-${STORE_ID}`)
      .closest('.rounded-lg');
    expect(panel).not.toBeNull();
    expect(within(panel as HTMLElement).getAllByText('250 CUP').length).toBeGreaterThan(0);
    // El select global muestra ambas tiendas.
    expect(screen.getByTestId('multistore-select')).toBeInTheDocument();
  });

  it('IT-8: CON MultiStores — los totales agregados fuera de los paneles cuentan la entrada real (cantidad y costo)', async () => {
    seedSession(ownerUser([STORE_ID, 's2'], ['Tienda A', 'Tienda B'], true));
    await seedCatalogAndTodayEntry('Cerveza');

    renderEntries();

    // Los totales viven en el HEADER del Card (la línea de totales bajo el
    // filtro fue eliminada por decisión del owner). La carga multi-tienda es
    // asíncrona (DEK + lectura por tienda) — esperar el conteo. El label (10)
    // también existe en el header del panel — usar getAllByText.
    await waitFor(() => {
      expect(screen.getAllByText('(10)').length).toBeGreaterThan(0);
    });
    expect(screen.getByText('Entradas')).toBeInTheDocument();
    expect(screen.getAllByText('250 CUP').length).toBeGreaterThan(0);
  });

  it('IT-9: CON MultiStores — tienda sin datos locales muestra "sin datos" y la que tiene, muestra los suyos', async () => {
    seedSession(ownerUser([STORE_ID, 's2'], ['Tienda A', 'Tienda B'], true));
    await seedCatalogAndTodayEntry('Cerveza');

    renderEntries();

    const panelB = await screen.findByTestId('multistore-panel-toggle-s2');
    fireEvent.click(panelB);
    await waitFor(() => {
      expect(screen.getByText('Sin datos de esta tienda en este dispositivo')).toBeInTheDocument();
    });
    // La tienda con datos: cerrar B y abrir A — su contenido muestra su día.
    fireEvent.click(panelB);
    fireEvent.click(await screen.findByTestId(`multistore-panel-toggle-${STORE_ID}`));
    await waitFor(() => {
      expect(screen.getByTestId(`multistore-entry-day-toggle-${STORE_ID}-${todayKey}`)).toBeInTheDocument();
    });
  });

  it('IT-10: CON MultiStores — crear una entrada HOY la hace aparecer en el inventario Disponible de esa tienda (integración con la vista Disponible)', async () => {
    seedSession(ownerUser([STORE_ID, 's2'], ['Tienda A', 'Tienda B'], true));
    await seedCatalogAndTodayEntry('Cerveza');

    render(
      <Wrapper>
        <InventoryAvailablePage />
      </Wrapper>,
    );

    // El contenido del panel solo renderiza al abrirlo — abrir el panel de la
    // tienda con datos y expandir la categoría del producto.
    fireEvent.click(await screen.findByTestId(`multistore-panel-toggle-${STORE_ID}`));
    const categoryToggle = await screen.findByTestId(/multistore-inventory-category-toggle-/);
    fireEvent.click(categoryToggle);
    await waitFor(() => {
      expect(screen.getByText('Cerveza (10)')).toBeInTheDocument();
    });
  });

  it('IT-11: SIN MultiStores — tras crear la entrada HOY el producto está disponible con su cantidad y costo promedio', async () => {
    seedSession(ownerUser([STORE_ID], ['Tienda A'], false));
    const { categoryId } = await seedCatalogAndTodayEntry('Cerveza');

    render(
      <Wrapper>
        <InventoryAvailablePage />
      </Wrapper>,
    );

    // Las categorías nacen colapsadas (Angular parity) — expandir la nuestra.
    fireEvent.click(screen.getByTestId(`inventory-category-toggle-${categoryId}`));
    await waitFor(() => {
      expect(screen.getByText('Cerveza (10)')).toBeInTheDocument();
    });
    expect(screen.getByText('25 CUP')).toBeInTheDocument();
  });

  it('IT-12: CON MultiStores — desactivar el filtro a una sola tienda muestra solo su panel y sus totales', async () => {
    seedSession(ownerUser([STORE_ID, 's2'], ['Tienda A', 'Tienda B'], true));
    await seedCatalogAndTodayEntry('Cerveza');

    renderEntries();

    const select = await screen.findByTestId('multistore-select');
    fireEvent.change(select, { target: { value: STORE_ID } });
    await waitFor(() => {
      expect(screen.getByTestId(`multistore-panel-toggle-${STORE_ID}`)).toBeInTheDocument();
    });
    expect(screen.queryByTestId('multistore-panel-toggle-s2')).not.toBeInTheDocument();
    // El header refleja SOLO la tienda filtrada (10 × 25 CUP = 250 CUP). El label
    // (10) también existe en el header del panel — usar getAllByText.
    expect(screen.getAllByText('(10)').length).toBeGreaterThan(0);
    expect(screen.getAllByText('250 CUP').length).toBeGreaterThan(0);
  });

  it('IT-13: CON MultiStores — entrada de AYER no se mezcla: cada día se agrupa con su propio total', async () => {
    seedSession(ownerUser([STORE_ID, 's2'], ['Tienda A', 'Tienda B'], true));
    await seedCatalogAndTodayEntry('Cerveza');
    // Entrada de ayer: se muta el payload REAL de la tienda (descifrar → editar
    // → cifrar) con el MISMO formato (mapa), como lo haría la app.
    const storedRaw = localStorage.getItem(
      StorageKeys.entityKey('inventory-entries', STORE_ID),
    )!;
    const raw = JSON.parse(
      decryptEntityWithDek(storedRaw, getDek())!,
    ) as Array<[string, Array<Record<string, unknown>>]>;
    const [, entries] = raw[0];
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    entries.push({
      ...entries[0],
      id: 'e-yesterday',
      quantity: 2,
      costPrice: 10,
      date: yesterday.toISOString(),
      createdDate: yesterday.toISOString(),
    });
    localStorage.setItem(
      StorageKeys.entityKey('inventory-entries', STORE_ID),
      encryptEntity(JSON.stringify(raw)),
    );

    renderEntries();

    const panelToggle = await screen.findByTestId(`multistore-panel-toggle-${STORE_ID}`);
    fireEvent.click(panelToggle);
    // Dos días con sus propios toggles: hoy y ayer.
    await waitFor(() => {
      expect(screen.getByTestId(`multistore-entry-day-toggle-${STORE_ID}-${todayKey}`)).toBeInTheDocument();
    });
    const yesterdayKey = toLocalDayKey(yesterday);
    expect(screen.getByTestId(`multistore-entry-day-toggle-${STORE_ID}-${yesterdayKey}`)).toBeInTheDocument();
    // Total del panel: hoy 250 CUP + ayer 20 CUP = 270 CUP.
    const panel = screen
      .getByTestId(`multistore-panel-toggle-${STORE_ID}`)
      .closest('.rounded-lg');
    expect(within(panel as HTMLElement).getAllByText('270 CUP').length).toBeGreaterThan(0);
  });
});
