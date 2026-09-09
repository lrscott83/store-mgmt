import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { Warehouse, WarehouseStockLevel, WarehouseStockMovement } from '@store-mgmt/domain';
import { toLocalDayKey } from '~/shared/lib/date-utils';

// ─── mock auth-store (mismo patrón que warehouses.test.tsx) ─────────────────
const mockUser = vi.hoisted(() => ({
  selectedStoreId: 's1',
  login: 'jdoe',
  isOwnerAdmin: true,
  featureIds: [],
}));

vi.mock('~/shared/lib/stores/auth-store', () => {
  const state = { user: mockUser, isAuthenticated: true };
  const useAuthStore = Object.assign(
    vi.fn((selector?: (s: typeof state) => unknown) => {
      if (typeof selector === 'function') return selector(state);
      return state;
    }),
    { getState: () => ({ user: mockUser }) },
  );
  return { useAuthStore };
});

// ─── fake WarehouseOfflineService (estado controlado) ───────────────────────
const fakeState = vi.hoisted(() => ({
  warehouses: [] as Warehouse[],
  movements: [] as WarehouseStockMovement[],
  stockLevels: [] as WarehouseStockLevel[],
  products: [] as Array<[string, Record<string, unknown>]>,
}));

vi.mock('~/inventory/lib/services/warehouse-offline-service', () => ({
  WarehouseOfflineService: class FakeWarehouseOfflineService {
    getStorageWarehouses() {
      return fakeState.warehouses;
    }
    getStorageStockLevels() {
      return fakeState.stockLevels;
    }
    getStorageMovements() {
      return fakeState.movements;
    }
  },
}));

vi.mock('~/inventory/lib/services/inventory-offline-service', () => ({
  InventoryOfflineService: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('~/sales/lib/repositories/product-repository', () => ({
  ProductRepository: vi.fn().mockImplementation(() => ({
    getStorageProductsMap: () => new Map(fakeState.products),
    getCategoryRepository: () => ({ getStorageCategoriesMap: () => new Map() }),
  })),
}));

vi.mock('~/sales/lib/repositories/product-category-repository', () => ({
  ProductCategoryRepository: vi.fn().mockImplementation(() => ({})),
}));

import { WarehouseMovementsPage } from '../warehouse-movements';

function renderPage() {
  return render(
    <IntlProvider locale="es" messages={esMessages}>
      <WarehouseMovementsPage />
    </IntlProvider>,
  );
}

describe('Vista Movimientos de almacén', () => {
  beforeEach(() => {
    fakeState.warehouses = [];
    fakeState.movements = [];
    fakeState.stockLevels = [];
    fakeState.products = [];
  });

  it('muestra el historial de todos los almacenes agrupado por días (acordeón)', () => {
    const today = new Date();
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    fakeState.warehouses = [
      { id: 'wh-1', name: 'Central', isActive: true, createdDate: new Date(), createdByName: 'x' },
      { id: 'wh-2', name: 'Anexo', isActive: true, createdDate: new Date(), createdByName: 'x' },
    ];
    fakeState.products = [
      ['prod-1', { id: 'prod-1', name: 'Cerveza' }],
      ['prod-2', { id: 'prod-2', name: 'Refresco' }],
    ];
    fakeState.movements = [
      {
        id: 'mv-1',
        warehouseId: 'wh-1',
        productId: 'prod-1',
        type: 'purchase_in',
        quantity: 24,
        reason: null,
        createdDate: today,
        createdByName: 'x',
      },
      {
        id: 'mv-2',
        warehouseId: 'wh-2',
        productId: 'prod-2',
        type: 'transfer_in',
        quantity: 6,
        reason: null,
        toWarehouseId: 'wh-2',
        fromWarehouseId: 'wh-1',
        createdDate: today,
        createdByName: 'x',
      },
      {
        id: 'mv-3',
        warehouseId: 'wh-1',
        productId: 'prod-1',
        type: 'sale_out',
        quantity: 12,
        reason: null,
        createdDate: yesterday,
        createdByName: 'x',
      },
    ];
    renderPage();

    // Sin tabla: paneles por día, más reciente primero.
    expect(screen.queryByRole('table')).toBeNull();
    const todayKey = toLocalDayKey(today);
    const yesterdayKey = toLocalDayKey(yesterday);
    expect(screen.getByTestId(`mv-day-panel-toggle-${todayKey}`)).toBeTruthy();
    expect(screen.getByTestId(`mv-day-panel-toggle-${yesterdayKey}`)).toBeTruthy();

    // Colapsado por defecto; al expandir hoy se ven sus 2 movimientos (ambos almacenes).
    expect(screen.queryByTestId('mv-qty-mv-1')).toBeNull();
    fireEvent.click(screen.getByTestId(`mv-day-panel-toggle-${todayKey}`));
    expect(screen.getByTestId('mv-qty-mv-1')).toBeTruthy();
    expect(screen.getByTestId('mv-qty-mv-2')).toBeTruthy();
    expect(screen.queryByTestId('mv-qty-mv-3')).toBeNull();

    // Filas: producto + cantidad + almacén origen → destino.
    expect(screen.getByText('Cerveza')).toBeTruthy();
    expect(screen.getByText('Refresco')).toBeTruthy();
    expect(screen.getByText(/Anexo/)).toBeTruthy();

    // Ayer, con su movimiento.
    fireEvent.click(screen.getByTestId(`mv-day-panel-toggle-${yesterdayKey}`));
    expect(screen.getByTestId('mv-qty-mv-3')).toBeTruthy();
  });

  it('cada movimiento muestra su icono por tipo', () => {
    const today = new Date();
    fakeState.warehouses = [
      { id: 'wh-1', name: 'Central', isActive: true, createdDate: new Date(), createdByName: 'x' },
    ];
    fakeState.products = [['prod-1', { id: 'prod-1', name: 'Cerveza' }]];
    fakeState.movements = [
      { id: 'mv-in', warehouseId: 'wh-1', productId: 'prod-1', type: 'purchase_in', quantity: 24, reason: null, createdDate: today, createdByName: 'x' },
      { id: 'mv-out', warehouseId: 'wh-1', productId: 'prod-1', type: 'sale_out', quantity: 6, reason: null, createdDate: today, createdByName: 'x' },
      { id: 'mv-tr-out', warehouseId: 'wh-1', productId: 'prod-1', type: 'transfer_out', quantity: 6, reason: null, toWarehouseId: 'wh-2', createdDate: today, createdByName: 'x' },
      { id: 'mv-tr-in', warehouseId: 'wh-2', productId: 'prod-1', type: 'transfer_in', quantity: 6, reason: null, fromWarehouseId: 'wh-1', createdDate: today, createdByName: 'x' },
    ];
    renderPage();
    fireEvent.click(screen.getByTestId(`mv-day-panel-toggle-${toLocalDayKey(today)}`));
    for (const id of ['mv-in', 'mv-out', 'mv-tr-out', 'mv-tr-in']) {
      expect(screen.getByTestId(`mv-type-icon-${id}`)).toBeTruthy();
    }
  });

  it('muestra el vacío cuando no hay movimientos', () => {
    fakeState.warehouses = [
      { id: 'wh-1', name: 'Central', isActive: true, createdDate: new Date(), createdByName: 'x' },
    ];
    renderPage();
    expect(screen.getByText('No hay movimientos registrados.')).toBeTruthy();
  });

  it('cada movimiento se representa como card compacto: producto, cantidad entre paréntesis y fila de almacén', () => {
    const today = new Date();
    fakeState.warehouses = [
      { id: 'wh-1', name: 'Central', isActive: true, createdDate: new Date(), createdByName: 'x' },
    ];
    fakeState.products = [['prod-1', { id: 'prod-1', name: 'Cerveza' }]];
    fakeState.movements = [
      {
        id: 'mv-1',
        warehouseId: 'wh-1',
        productId: 'prod-1',
        type: 'purchase_in',
        quantity: 24,
        reason: null,
        createdDate: today,
        createdByName: 'x',
      },
    ];
    renderPage();
    fireEvent.click(screen.getByTestId(`mv-day-panel-toggle-${toLocalDayKey(today)}`));

    expect(screen.getByTestId('mv-card-mv-1')).toBeTruthy();
    // Cantidad entre paréntesis, con el testid histórico preservado.
    expect(screen.getByTestId('mv-qty-mv-1').textContent).toBe('(24)');
    expect(screen.getByText('Cerveza')).toBeTruthy();
    // Fila 3: almacén implicado.
    expect(screen.getByText('Central')).toBeTruthy();
  });

  it('una compra (purchase_in) muestra el texto "Compra" y el precio a la derecha (costPrice × cantidad)', () => {
    const today = new Date();
    fakeState.warehouses = [
      { id: 'wh-1', name: 'Central', isActive: true, createdDate: new Date(), createdByName: 'x' },
    ];
    fakeState.products = [['prod-1', { id: 'prod-1', name: 'Cerveza' }]];
    fakeState.stockLevels = [
      {
        id: 'lvl-1',
        warehouseId: 'wh-1',
        productId: 'prod-1',
        onHand: 100,
        costPrice: 2.5,
        createdDate: new Date(),
      },
    ];
    fakeState.movements = [
      {
        id: 'mv-1',
        warehouseId: 'wh-1',
        productId: 'prod-1',
        type: 'purchase_in',
        quantity: 24,
        reason: null,
        createdDate: today,
        createdByName: 'x',
      },
      {
        id: 'mv-2',
        warehouseId: 'wh-1',
        productId: 'prod-1',
        type: 'sale_out',
        quantity: 6,
        reason: null,
        createdDate: today,
        createdByName: 'x',
      },
    ];
    renderPage();
    fireEvent.click(screen.getByTestId(`mv-day-panel-toggle-${toLocalDayKey(today)}`));

    // Compra: texto "Compra" + precio (2.5 × 24 = $60).
    expect(screen.getByText('Compra')).toBeTruthy();
    expect(screen.getByTestId('mv-price-mv-1').textContent).toBe(`$60`);
    // Salida: sin precio, con el texto del tipo.
    expect(screen.queryByTestId('mv-price-mv-2')).toBeNull();
    expect(screen.getByText('Salida a tienda')).toBeTruthy();
  });

  it('el gear del card expone Editar y Eliminar; Editar abre popup visual de edición', () => {
    const today = new Date();
    fakeState.warehouses = [
      { id: 'wh-1', name: 'Central', isActive: true, createdDate: new Date(), createdByName: 'x' },
    ];
    fakeState.products = [['prod-1', { id: 'prod-1', name: 'Cerveza' }]];
    fakeState.movements = [
      {
        id: 'mv-1',
        warehouseId: 'wh-1',
        productId: 'prod-1',
        type: 'purchase_in',
        quantity: 24,
        reason: 'Reposición',
        createdDate: today,
        createdByName: 'x',
      },
    ];
    renderPage();
    fireEvent.click(screen.getByTestId(`mv-day-panel-toggle-${toLocalDayKey(today)}`));

    // Gear con las dos acciones.
    fireEvent.click(screen.getByTestId(`mv-actions-mv-1`));
    expect(screen.getByTestId('mv-edit-mv-1')).toBeTruthy();
    expect(screen.getByTestId('mv-delete-mv-1')).toBeTruthy();

    // Editar abre el popup visual con los datos según el tipo.
    fireEvent.click(screen.getByTestId('mv-edit-mv-1'));
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByText('Editar movimiento')).toBeTruthy();
    expect(dialog.getByText('Cerveza')).toBeTruthy();
    expect(dialog.getByText('(24)')).toBeTruthy();
    expect(dialog.getByText('Entrada (compra)')).toBeTruthy();
    expect(dialog.getByText('Central')).toBeTruthy();
    expect(dialog.getByText('Reposición')).toBeTruthy();

    // Guardar cierra el popup sin lógica.
    fireEvent.click(screen.getByTestId('mv-edit-dialog-save'));
    expect(screen.queryByText('Editar movimiento')).toBeNull();
  });

  it('Eliminar abre el popup de confirmación con los datos del movimiento; Confirmar solo cierra', () => {
    const today = new Date();
    fakeState.warehouses = [
      { id: 'wh-1', name: 'Central', isActive: true, createdDate: new Date(), createdByName: 'x' },
    ];
    fakeState.products = [['prod-1', { id: 'prod-1', name: 'Cerveza' }]];
    fakeState.movements = [
      {
        id: 'mv-1',
        warehouseId: 'wh-1',
        productId: 'prod-1',
        type: 'sale_out',
        quantity: 12,
        reason: null,
        createdDate: today,
        createdByName: 'x',
      },
    ];
    renderPage();
    fireEvent.click(screen.getByTestId(`mv-day-panel-toggle-${toLocalDayKey(today)}`));

    fireEvent.click(screen.getByTestId(`mv-actions-mv-1`));
    fireEvent.click(screen.getByTestId('mv-delete-mv-1'));

    expect(screen.getByText('Eliminar movimiento')).toBeTruthy();
    expect(
      screen.getByText(
        '¿Está seguro de que desea eliminar el movimiento de Cerveza (12) del almacén Central?',
      ),
    ).toBeTruthy();

    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));
    expect(screen.queryByText('Eliminar movimiento')).toBeNull();
    // El movimiento sigue listado (nada se borró).
    expect(screen.getByTestId('mv-card-mv-1')).toBeTruthy();
  });
});
