import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { Warehouse, WarehouseStockMovement } from '@store-mgmt/domain';
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
  products: [] as Array<[string, Record<string, unknown>]>,
}));

vi.mock('~/inventory/lib/services/warehouse-offline-service', () => ({
  WarehouseOfflineService: class FakeWarehouseOfflineService {
    getStorageWarehouses() {
      return fakeState.warehouses;
    }
    getStorageStockLevels() {
      return [];
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
});
