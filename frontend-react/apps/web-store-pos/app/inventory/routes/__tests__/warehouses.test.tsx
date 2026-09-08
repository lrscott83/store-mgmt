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
  products: [] as Array<[string, Record<string, unknown>]>,
  categories: [] as Array<[string, Record<string, unknown>]>,
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
      if (!w)
        return {
          data: undefined,
          succeeded: false,
          message: null,
          actionCode: 400,
          errors: [WarehouseErrors.NotExists],
        };
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

vi.mock('~/sales/lib/repositories/product-repository', () => ({
  ProductRepository: vi.fn().mockImplementation(() => ({
    getStorageProductsMap: () => new Map(fakeState.products),
    getCategoryRepository: () => ({
      getStorageCategoriesMap: () => new Map(fakeState.categories),
    }),
  })),
}));

vi.mock('~/sales/lib/repositories/product-category-repository', () => ({
  ProductCategoryRepository: vi.fn().mockImplementation(() => ({})),
}));

import { WarehousesPage } from '../warehouses';

function renderPage() {
  return render(
    <IntlProvider locale="es" messages={esMessages}>
      <WarehousesPage />
    </IntlProvider>,
  );
}

/** Siembra un almacén Central con stock de 2 productos en categorías distintas. */
function seedCentralWarehouseWithStock() {
  fakeState.warehouses = [
    { id: 'wh-1', name: 'Central', isActive: true, createdDate: new Date(), createdByName: 'x' },
  ];
  fakeState.categories = [
    ['cat-1', { id: 'cat-1', name: 'Bebidas', isActive: true }],
    ['cat-2', { id: 'cat-2', name: 'Lácteos', isActive: true }],
  ];
  fakeState.products = [
    ['prod-1', { id: 'prod-1', name: 'Cerveza', isActive: true, categoryId: 'cat-1' }],
    ['prod-2', { id: 'prod-2', name: 'Leche', isActive: true, categoryId: 'cat-2' }],
  ];
  fakeState.levels = [
    {
      id: 'sl-1',
      warehouseId: 'wh-1',
      productId: 'prod-1',
      onHand: 24,
      costPrice: 660,
      createdDate: new Date(),
    },
    {
      id: 'sl-2',
      warehouseId: 'wh-1',
      productId: 'prod-2',
      onHand: 10,
      costPrice: 100,
      createdDate: new Date(),
    },
  ];
}

describe('WarehousesPage', () => {
  beforeEach(() => {
    localStorage.clear();
    fakeState.warehouses = [];
    fakeState.levels = [];
    fakeState.movements = [];
    fakeState.products = [];
    fakeState.categories = [];
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

  it('creates a warehouse from the modal', async () => {
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

  it('lists warehouses with their unit count in the header', async () => {
    seedCentralWarehouseWithStock();
    renderPage();
    expect(screen.getByText('Central')).toBeTruthy();
    expect(screen.getByTestId('warehouse-toggle-Central').textContent).toContain('(34)');
  });

  it('shows units and total cost in the header plus the global summary row (WUI-1-a)', async () => {
    seedCentralWarehouseWithStock();
    renderPage();
    // Header estilo InventoryProductList: nombre (unidades) + costo total.
    expect(screen.getByTestId('warehouse-toggle-Central').textContent).toContain('(34)');
    // format-currency usa NBSP (U+00A0) como separador de miles — el header del
    // almacén y el resumen global muestran el mismo monto.
    expect(screen.getByTestId('warehouses-total-cost').textContent).toBe('$16\u00A0840');
    const headerCost = screen.getByTestId('warehouse-toggle-Central').textContent ?? '';
    expect(headerCost).toContain('$16\u00A0840');
  });

  it('shows zeroed counters for an empty warehouse (WUI-1-b)', async () => {
    fakeState.warehouses = [
      { id: 'wh-1', name: 'Vacío', isActive: true, createdDate: new Date(), createdByName: 'x' },
    ];
    renderPage();
    expect(screen.getByTestId('warehouse-toggle-Vacío').textContent).toContain('(0)');
    expect(screen.getAllByText('$0')).toHaveLength(2); // header del almacén + resumen global
  });

  it('renders the gear with Entrada/Movimiento/Salida and Editar/Desactivar, no flat buttons (WUI-2-a)', async () => {
    fakeState.warehouses = [
      { id: 'wh-1', name: 'Central', isActive: true, createdDate: new Date(), createdByName: 'x' },
    ];
    renderPage();
    fireEvent.click(screen.getByTestId('warehouse-actions-toggle-wh-1'));
    expect(screen.getByRole('menuitem', { name: 'Entrada' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Movimiento' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Salida' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Editar' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Desactivar' })).toBeTruthy();
    // Flat buttons are gone: the only "Editar"/"Desactivar" texts are menu items.
    expect(screen.getAllByText('Editar')).toHaveLength(1);
    expect(screen.getAllByText('Desactivar')).toHaveLength(1);
  });

  describe('expanded panel — productos agrupados por categoría (estilo Disponible)', () => {
    it('groups the warehouse stock by category with headers "Nombre (N) $Total" (WUI-4-a)', async () => {
      seedCentralWarehouseWithStock();
      renderPage();
      fireEvent.click(screen.getByTestId('warehouse-toggle-Central'));

      // Header de categoría estilo InventoryProductList: nombre (cantidad) + costo total.
      const bebidasHeader = screen.getByTestId('warehouse-category-toggle-wh-1-cat-1');
      expect(bebidasHeader.textContent).toContain('Bebidas');
      expect(bebidasHeader.textContent).toContain('(24)');
      expect(bebidasHeader.textContent).toContain('$15\u00A0840'); // 24 × 660

      const lacteosHeader = screen.getByTestId('warehouse-category-toggle-wh-1-cat-2');
      expect(lacteosHeader.textContent).toContain('Lácteos');
      expect(lacteosHeader.textContent).toContain('(10)');
      expect(lacteosHeader.textContent).toContain('$1\u00A0000'); // 10 × 100
    });

    it('shows product rows with quantity and costs, same layout as Disponible (WUI-4-b)', async () => {
      seedCentralWarehouseWithStock();
      renderPage();
      fireEvent.click(screen.getByTestId('warehouse-toggle-Central'));
      // Acordeón: expandir la categoría para ver sus productos (igual que Disponible).
      fireEvent.click(screen.getByTestId('warehouse-category-toggle-wh-1-cat-1'));
      fireEvent.click(screen.getByTestId('warehouse-category-toggle-wh-1-cat-2'));

      // Productos visibles con su cantidad.
      expect(screen.getByTestId('warehouse-product-row-wh-1-prod-1').textContent).toContain(
        'Cerveza',
      );
      expect(screen.getByTestId('warehouse-product-row-wh-1-prod-1').textContent).toContain('(24)');
      expect(screen.getByTestId('warehouse-product-row-wh-1-prod-2').textContent).toContain(
        'Leche',
      );
      expect(screen.getByTestId('warehouse-product-row-wh-1-prod-2').textContent).toContain('(10)');

      // Costo promedio y total por producto (mismo diseño que Disponible).
      expect(screen.getByTestId('warehouse-product-cost-wh-1-prod-1').textContent).toBe('$660');
      expect(screen.getByTestId('warehouse-product-total-wh-1-prod-1').textContent).toBe(
        '$15\u00A0840',
      );
      expect(screen.getByTestId('warehouse-product-cost-wh-1-prod-2').textContent).toBe('$100');
      expect(screen.getByTestId('warehouse-product-total-wh-1-prod-2').textContent).toBe(
        '$1\u00A0000',
      );
    });

    it('categories are collapsed by default and expand on click (WUI-4-c)', async () => {
      seedCentralWarehouseWithStock();
      renderPage();
      fireEvent.click(screen.getByTestId('warehouse-toggle-Central'));

      // Colapsado por defecto: los productos no son visibles aún.
      expect(screen.queryByTestId('warehouse-product-row-wh-1-prod-1')).toBeNull();

      // Expandir la categoría revela sus productos.
      fireEvent.click(screen.getByTestId('warehouse-category-toggle-wh-1-cat-1'));
      expect(screen.getByTestId('warehouse-product-row-wh-1-prod-1')).toBeTruthy();
      // La otra categoría sigue colapsada.
      expect(screen.queryByTestId('warehouse-product-row-wh-1-prod-2')).toBeNull();
    });

    it('removes the purchase selector and per-row action buttons from the panel (WUI-4-d)', async () => {
      seedCentralWarehouseWithStock();
      renderPage();
      fireEvent.click(screen.getByTestId('warehouse-toggle-Central'));

      // El selector de compra y los botones por fila ya no existen dentro del panel.
      expect(screen.queryByTestId('purchase-select-Central')).toBeNull();
      expect(screen.queryAllByTestId(/^stock-action-/)).toHaveLength(0);
      // Los movimientos se hacen desde el gear del almacén (sigue disponible).
      fireEvent.click(screen.getByTestId('warehouse-actions-toggle-wh-1'));
      expect(screen.getByRole('menuitem', { name: 'Entrada' })).toBeTruthy();
    });

    it('shows the empty-stock InfoBox when the warehouse has no products (WUI-4-e)', async () => {
      fakeState.warehouses = [
        { id: 'wh-1', name: 'Vacío', isActive: true, createdDate: new Date(), createdByName: 'x' },
      ];
      renderPage();
      fireEvent.click(screen.getByTestId('warehouse-toggle-Vacío'));
      expect(screen.getByText('Este almacén no tiene productos en stock.')).toBeTruthy();
    });

    it('shows product names for unknown product ids without crashing (WUI-4-f)', async () => {
      fakeState.warehouses = [
        {
          id: 'wh-1',
          name: 'Central',
          isActive: true,
          createdDate: new Date(),
          createdByName: 'x',
        },
      ];
      fakeState.levels = [
        {
          id: 'sl-1',
          warehouseId: 'wh-1',
          productId: 'prod-ghost',
          onHand: 5,
          costPrice: 100,
          createdDate: new Date(),
        },
      ];
      renderPage();
      fireEvent.click(screen.getByTestId('warehouse-toggle-Central'));
      // El producto no existe en el repositorio — se omite y la vista no revienta:
      // queda el InfoBox de sin stock (no hay filas de producto para ese ghost).
      expect(screen.getByText('Este almacén no tiene productos en stock.')).toBeTruthy();
      expect(screen.queryByTestId('warehouse-product-row-wh-1-prod-ghost')).toBeNull();
    });
  });

  it('shows the movement modal and records a sale_out from the gear', async () => {
    seedCentralWarehouseWithStock();
    renderPage();

    // gear → Salida abre el modal con el selector de producto habilitado
    fireEvent.click(screen.getByTestId('warehouse-actions-toggle-wh-1'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Salida' }));
    expect(screen.getByText(/Salida a tienda — Central/)).toBeTruthy();
    expect((screen.getByTestId('movement-product') as HTMLSelectElement).disabled).toBe(false);

    fireEvent.change(screen.getByTestId('movement-product'), { target: { value: 'prod-1' } });
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

  it('records a purchase_in from the gear with the product selector (modal)', async () => {
    seedCentralWarehouseWithStock();
    renderPage();

    // gear → Entrada abre el modal con un selector de producto HABILITADO
    fireEvent.click(screen.getByTestId('warehouse-actions-toggle-wh-1'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Entrada' }));
    expect(screen.getByText(/Entrada al almacén — Central/)).toBeTruthy();
    expect((screen.getByTestId('movement-product') as HTMLSelectElement).disabled).toBe(false);

    fireEvent.change(screen.getByTestId('movement-product'), { target: { value: 'prod-1' } });
    fireEvent.change(screen.getByTestId('movement-quantity'), { target: { value: '10' } });
    fireEvent.change(screen.getByTestId('movement-cost'), { target: { value: '660' } });
    fireEvent.click(screen.getAllByText('Guardar')[0]);

    await waitFor(() => {
      expect(fakeState.recordMovementImpl).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'purchase_in',
          warehouseId: 'wh-1',
          productId: 'prod-1',
          quantity: 10,
          costPrice: 660,
        }),
      );
    });
  });

  it('blocks deactivation when the warehouse has stock', async () => {
    seedCentralWarehouseWithStock();
    renderPage();
    fireEvent.click(screen.getByTestId('warehouse-actions-toggle-wh-1'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Desactivar' }));
    await waitFor(() => {
      expect(showBlockingErrorMock).toHaveBeenCalledWith(
        expect.any(String),
        WarehouseErrors.CannotDeactivate.description,
      );
    });
  });

  it('opens the edit modal prefilled from the gear and updates (WUI-3-c)', async () => {
    fakeState.warehouses = [
      { id: 'wh-1', name: 'Central', isActive: true, createdDate: new Date(), createdByName: 'x' },
    ];
    renderPage();
    fireEvent.click(screen.getByTestId('warehouse-actions-toggle-wh-1'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Editar' }));

    const input = screen.getByTestId('warehouse-name-input') as HTMLInputElement;
    expect(input.value).toBe('Central');
    expect(screen.getByText('Editar almacén')).toBeTruthy();

    fireEvent.change(input, { target: { value: 'Central Norte' } });
    fireEvent.click(screen.getByText('Guardar'));

    await waitFor(() => {
      expect(fakeState.warehouses[0].name).toBe('Central Norte');
    });
    expect(showToastSuccessMock).toHaveBeenCalled();
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
