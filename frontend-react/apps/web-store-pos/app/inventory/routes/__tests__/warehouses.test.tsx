import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { Warehouse, WarehouseStockLevel, WarehouseStockMovement } from '@store-mgmt/domain';
import { Result, WarehouseErrors } from '@store-mgmt/domain';

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

const showBlockingErrorMock = vi.hoisted(() => vi.fn());
vi.mock('~/shared/lib/blocking-alert', () => ({
  showBlockingError: (...args: unknown[]) => showBlockingErrorMock(...args),
}));

const showToastSuccessMock = vi.hoisted(() => vi.fn());
vi.mock('~/shared/lib/toast', () => ({
  showToastSuccess: (...args: unknown[]) => showToastSuccessMock(...args),
}));

// ─── fake WarehouseOfflineService (estado interno controlado) ──────────────
const fakeState = vi.hoisted(() => ({
  warehouses: [] as Warehouse[],
  levels: [] as WarehouseStockLevel[],
  movements: [] as WarehouseStockMovement[],
  recordMovementImpl: vi.fn(),
  createWarehouseImpl: vi.fn(),
  deactivateImpl: vi.fn(),
}));

vi.mock('~/inventory/lib/services/warehouse-offline-service', () => {
  class FakeWarehouseOfflineService {
    getStorageWarehouses() {
      return fakeState.warehouses;
    }
    getStorageStockLevels() {
      return fakeState.levels;
    }
    getStorageMovements() {
      return fakeState.movements;
    }
    createWarehouse(name: string) {
      fakeState.createWarehouseImpl(name);
      const w: Warehouse = {
        id: `wh-${fakeState.warehouses.length + 1}`,
        name,
        isActive: true,
        createdDate: new Date(),
        createdByName: 'jdoe',
      };
      fakeState.warehouses.push(w);
      return { data: w, succeeded: true, message: null, actionCode: 200, errors: [] };
    }
    updateWarehouse(id: string, name: string) {
      const w = fakeState.warehouses.find((x) => x.id === id);
      if (!w) return { data: undefined, succeeded: false, message: null, actionCode: 400, errors: [WarehouseErrors.NotExists] };
      w.name = name;
      return { data: w, succeeded: true, message: null, actionCode: 200, errors: [] };
    }
    deactivateWarehouse(id: string) {
      fakeState.deactivateImpl(id);
      const w = fakeState.warehouses.find((x) => x.id === id);
      if (!w) return Result.Failure([WarehouseErrors.NotExists]);
      if (fakeState.levels.some((l) => l.warehouseId === id)) {
        return Result.Failure([WarehouseErrors.CannotDeactivate]);
      }
      w.isActive = false;
      return Result.Success();
    }
    recordMovement(params: unknown) {
      fakeState.recordMovementImpl(params);
      return { data: undefined, succeeded: true, message: null, actionCode: 200, errors: [] };
    }
  }
  return { WarehouseOfflineService: FakeWarehouseOfflineService };
});

vi.mock('~/inventory/lib/services/inventory-offline-service', () => ({
  InventoryOfflineService: vi.fn().mockImplementation(() => ({})),
}));

import { WarehousesPage } from '../warehouses';

function renderPage() {
  return render(
    <IntlProvider locale="es" messages={esMessages}>
      <WarehousesPage />
    </IntlProvider>,
  );
}

describe('WarehousesPage', () => {
  beforeEach(() => {
    localStorage.clear();
    fakeState.warehouses = [];
    fakeState.levels = [];
    fakeState.movements = [];
    fakeState.recordMovementImpl.mockClear();
    fakeState.createWarehouseImpl.mockClear();
    fakeState.deactivateImpl.mockClear();
    showBlockingErrorMock.mockClear();
    showToastSuccessMock.mockClear();
  });

  it('shows the empty state when there are no warehouses', async () => {
    renderPage();
    expect(screen.getByText('No hay almacenes creados. Crea uno para comenzar.')).toBeTruthy();
  });

  it('creates a warehouse from the inline form', async () => {
    renderPage();
    fireEvent.click(screen.getByText('Nuevo almacén'));
    const input = screen.getByTestId('warehouse-name-input');
    fireEvent.change(input, { target: { value: 'Almacén Central' } });
    fireEvent.click(screen.getByText('Guardar'));

    await waitFor(() => {
      expect(fakeState.createWarehouseImpl).toHaveBeenCalledWith('Almacén Central');
    });
    expect(screen.getByText('Almacén Central')).toBeTruthy();
    expect(showToastSuccessMock).toHaveBeenCalled();
  });

  it('lists warehouses with their total on-hand', async () => {
    fakeState.warehouses = [
      { id: 'wh-1', name: 'Central', isActive: true, createdDate: new Date(), createdByName: 'x' },
    ];
    fakeState.levels = [
      { id: 'sl-1', warehouseId: 'wh-1', productId: 'prod-1', onHand: 24, costPrice: 660, createdDate: new Date() },
    ];
    renderPage();
    expect(screen.getByText('Central')).toBeTruthy();
    expect(screen.getByText(/Cantidad: 24/)).toBeTruthy();
  });

  it('shows the movement form and records a sale_out', async () => {
    fakeState.warehouses = [
      { id: 'wh-1', name: 'Central', isActive: true, createdDate: new Date(), createdByName: 'x' },
    ];
    fakeState.levels = [
      { id: 'sl-1', warehouseId: 'wh-1', productId: 'prod-1', onHand: 24, costPrice: 660, createdDate: new Date() },
    ];
    renderPage();

    // expand the warehouse → stock table with action buttons
    fireEvent.click(screen.getByTestId('warehouse-toggle-Central'));
    fireEvent.click(screen.getByText('Salida a tienda'));

    fireEvent.change(screen.getByTestId('movement-quantity'), { target: { value: '12' } });
    fireEvent.change(screen.getByTestId('movement-reason'), { target: { value: 'pedido' } });
    fireEvent.click(screen.getAllByText('Guardar')[0]);

    await waitFor(() => {
      expect(fakeState.recordMovementImpl).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'sale_out',
          warehouseId: 'wh-1',
          productId: 'prod-1',
          quantity: 12,
          reason: 'pedido',
        }),
      );
    });
    expect(showToastSuccessMock).toHaveBeenCalled();
  });

  it('blocks deactivation when the warehouse has stock', async () => {
    fakeState.warehouses = [
      { id: 'wh-1', name: 'Central', isActive: true, createdDate: new Date(), createdByName: 'x' },
    ];
    fakeState.levels = [
      { id: 'sl-1', warehouseId: 'wh-1', productId: 'prod-1', onHand: 24, costPrice: 660, createdDate: new Date() },
    ];
    renderPage();
    fireEvent.click(screen.getByText('Desactivar'));
    await waitFor(() => {
      expect(showBlockingErrorMock).toHaveBeenCalledWith(
        expect.any(String),
        WarehouseErrors.CannotDeactivate.description,
      );
    });
  });

  it('shows the movements history', async () => {
    fakeState.warehouses = [
      { id: 'wh-1', name: 'Central', isActive: true, createdDate: new Date(), createdByName: 'x' },
    ];
    fakeState.movements = [
      {
        id: 'mv-1',
        warehouseId: 'wh-1',
        productId: 'prod-1',
        type: 'purchase_in',
        quantity: 24,
        reason: null,
        createdDate: new Date(),
        createdByName: 'x',
      },
    ];
    renderPage();
    expect(screen.getByText('Entrada (compra)')).toBeTruthy();
  });
});