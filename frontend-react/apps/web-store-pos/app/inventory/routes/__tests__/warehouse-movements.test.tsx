import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { Warehouse, WarehouseStockMovement } from '@store-mgmt/domain';
import { toLocalDayKey } from '~/shared/lib/date-utils';
import { validateMovementQuantity } from '~/inventory/lib/warehouse';

// ─── mock auth-store (mismo patrón que warehouses.test.tsx) ─────────────────
const mockUser = vi.hoisted(() => ({
  selectedStoreId: 's1',
  login: 'jdoe',
  isOwnerAdmin: true,
  featureIds: [],
  storeList: [{ id: 's1', name: 'Tienda Seleccionada' }],
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

// ─── blocking-alert + toast mocks (patrón de inventory-routes.test.tsx) ────
const confirmDialogMock = vi.hoisted(() => vi.fn().mockResolvedValue(true));
const showBlockingErrorMock = vi.hoisted(() => vi.fn());
const showToastSuccessMock = vi.hoisted(() => vi.fn());
vi.mock('~/shared/lib/blocking-alert', () => ({
  confirmDialog: (...args: unknown[]) => confirmDialogMock(...args),
  showBlockingError: (...args: unknown[]) => showBlockingErrorMock(...args),
}));
vi.mock('~/shared/lib/toast', () => ({
  showToastSuccess: (...args: unknown[]) => showToastSuccessMock(...args),
}));

// ─── fake WarehouseOfflineService (estado controlado) ───────────────────────
const fakeState = vi.hoisted(() => ({
  warehouses: [] as Warehouse[],
  movements: [] as WarehouseStockMovement[],
  stockLevels: [] as Array<Record<string, unknown>>,
  products: [] as Array<[string, Record<string, unknown>]>,
  reverseMovementImpl: vi.fn() as unknown as ReturnType<typeof vi.fn>,
  recordMovementImpl: vi.fn() as unknown as ReturnType<typeof vi.fn>,
  previewImpl: vi.fn() as unknown as ReturnType<typeof vi.fn>,
  applyCostEditImpl: vi.fn() as unknown as ReturnType<typeof vi.fn>,
  isOwnerAdminFlag: true,
}));

const EMPTY_PREVIEW = {
  hasOutflow: false,
  saleOutMovements: 0,
  storeEntries: 0,
  activeOrders: 0,
  deactivatedOrders: 0,
  soldUnits: 0,
  storeUnits: 0,
  from: 5,
  to: 0,
};

vi.mock('~/inventory/lib/services/warehouse-offline-service', () => ({
  WarehouseOfflineService: class FakeWarehouseOfflineService {
    getStorageWarehouses() {
      return fakeState.warehouses;
    }
    getStorageStockLevels() {
      return fakeState.stockLevels;
    }
    getStockLevel(warehouseId: string, productId: string) {
      return fakeState.stockLevels.find(
        (l) => l['warehouseId'] === warehouseId && l['productId'] === productId,
      ) as unknown;
    }
    getStorageMovements() {
      return fakeState.movements;
    }
    reverseMovement(id: string, reason?: string) {
      return fakeState.reverseMovementImpl(id, reason);
    }
    recordMovement(params: unknown) {
      return fakeState.recordMovementImpl(params);
    }
    getPurchasePropagationPreview(purchaseId: string, newCostPrice: number) {
      return fakeState.previewImpl(purchaseId, newCostPrice);
    }
    applyPurchaseCostEdit(purchaseId: string, quantity: number, costPrice: number) {
      return fakeState.applyCostEditImpl(purchaseId, quantity, costPrice);
    }
    isReversed(id: string) {
      return fakeState.movements.some(
        (m) => m.type === 'reversal' && m.reversalOfMovementId === id,
      );
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
    fakeState.reverseMovementImpl.mockReset();
    fakeState.recordMovementImpl.mockReset();
    fakeState.previewImpl.mockReset();
    fakeState.applyCostEditImpl.mockReset();
    fakeState.previewImpl.mockReturnValue({ succeeded: true, data: EMPTY_PREVIEW, errors: [] });
    fakeState.applyCostEditImpl.mockReturnValue({
      succeeded: true,
      data: { costOnly: false, storeEntries: 0, activeOrders: 0, deactivatedOrders: 0 },
      errors: [],
    });
    confirmDialogMock.mockReset();
    confirmDialogMock.mockResolvedValue(true);
    showBlockingErrorMock.mockReset();
    showToastSuccessMock.mockReset();
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
      { id: 'wh-2', name: 'Anexo', isActive: true, createdDate: new Date(), createdByName: 'x' },
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
    // Compra: rótulo 'Compra' en la fila 2 y almacén de entrada en la fila 3
    // (sin `mv-type-icon`; ese testid es solo para los tipos con icono propio).
    expect(screen.getByText('Compra')).toBeTruthy();
    expect(screen.getAllByText('Central')).toHaveLength(2);
    expect(screen.queryByTestId('mv-type-icon-mv-in')).toBeNull();
    for (const id of ['mv-out', 'mv-tr-out', 'mv-tr-in']) {
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

  // ─── Plan 2026-09-09: engranaje Editar/Revertir + badge (F4/F5, D6/D10) ────

  function seedTodayMovements() {
    const today = new Date();
    fakeState.warehouses = [
      { id: 'wh-1', name: 'Central', isActive: true, createdDate: new Date(), createdByName: 'x' },
      { id: 'wh-2', name: 'Anexo', isActive: true, createdDate: new Date(), createdByName: 'x' },
    ];
    fakeState.products = [['prod-1', { id: 'prod-1', name: 'Cerveza' }]];
    // Niveles de stock: la edición de una compra topa con lo que QUEDA de su lote
    // (A1). El lote de `mv-in` está intacto (24) → tope 24.
    fakeState.stockLevels = [
      {
        warehouseId: 'wh-1',
        productId: 'prod-1',
        onHand: 24,
        costPrice: 5,
        lots: [{ costPrice: 5, quantity: 24, lotOriginMovementId: 'mv-in' }],
      },
    ];
    fakeState.movements = [
      { id: 'mv-in', warehouseId: 'wh-1', productId: 'prod-1', type: 'purchase_in', quantity: 24, reason: null, createdDate: today, createdByName: 'x', costPrice: 5 },
      { id: 'mv-out', warehouseId: 'wh-1', productId: 'prod-1', type: 'sale_out', quantity: 6, reason: null, createdDate: today, createdByName: 'x' },
      { id: 'mv-tr-in', warehouseId: 'wh-2', productId: 'prod-1', type: 'transfer_in', quantity: 6, reason: null, fromWarehouseId: 'wh-1', createdDate: today, createdByName: 'x' },
      {
        id: 'mv-rev', warehouseId: 'wh-1', productId: 'prod-1', type: 'reversal', quantity: 2, reason: null,
        createdDate: today, createdByName: 'x', reversalOfMovementId: 'mv-other-reverted',
      },
      {
        id: 'mv-other-reverted', warehouseId: 'wh-1', productId: 'prod-1', type: 'purchase_in', quantity: 2, reason: null,
        createdDate: today, createdByName: 'x',
      },
    ];
  }

  function openToday() {
    fireEvent.click(screen.getByTestId(`mv-day-panel-toggle-${toLocalDayKey(new Date())}`));
  }

  it('U-M1: OwnerAdmin ve engranaje solo en filas UI sin reversa (no en reversal ni transfer_in)', () => {
    seedTodayMovements();
    renderPage();
    openToday();
    expect(screen.getByTestId('mv-actions-toggle-mv-in')).toBeTruthy();
    expect(screen.getByTestId('mv-actions-toggle-mv-out')).toBeTruthy();
    expect(screen.queryByTestId('mv-actions-toggle-mv-rev')).toBeNull(); // reversal: solo lectura
    expect(screen.queryByTestId('mv-actions-toggle-mv-tr-in')).toBeNull(); // transfer_in: solo lectura
    expect(screen.queryByTestId('mv-actions-toggle-mv-other-reverted')).toBeNull(); // ya revertida
  });

  it('U-M2: StoreUser no ve engranajes (D6)', () => {
    seedTodayMovements();
    mockUser.isOwnerAdmin = false;
    renderPage();
    openToday();
    expect(screen.queryByTestId('mv-actions-toggle-mv-in')).toBeNull();
    expect(screen.queryByTestId('mv-actions-toggle-mv-out')).toBeNull();
    mockUser.isOwnerAdmin = true;
  });

  it('U-M4: Eliminar confirma con Swal Si/No; No cancela sin llamar al servicio', async () => {
    seedTodayMovements();
    confirmDialogMock.mockResolvedValueOnce(false);
    renderPage();
    openToday();
    fireEvent.click(screen.getByTestId('mv-actions-toggle-mv-out'));
    fireEvent.click(screen.getByTestId('mv-revert-mv-out'));
    await waitFor(() => expect(confirmDialogMock).toHaveBeenCalledTimes(1));
    // La confirmación de eliminación incluye los datos del movimiento.
    expect(confirmDialogMock.mock.calls[0][0].title).toBe('Eliminar movimiento');
    expect(confirmDialogMock.mock.calls[0][0].message).toBe(
      '¿Está seguro de que desea eliminar el movimiento de Cerveza (6) del almacén Central?',
    );
    expect(fakeState.reverseMovementImpl).not.toHaveBeenCalled();
  });

  it('U-M4b: confirmar Si ejecuta reverseMovement y recarga', async () => {
    seedTodayMovements();
    fakeState.reverseMovementImpl.mockReturnValue({ succeeded: true, data: {}, errors: [] });
    renderPage();
    openToday();
    fireEvent.click(screen.getByTestId('mv-actions-toggle-mv-out'));
    fireEvent.click(screen.getByTestId('mv-revert-mv-out'));
    await waitFor(() => expect(fakeState.reverseMovementImpl).toHaveBeenCalledWith('mv-out', undefined));
    expect(showToastSuccessMock).toHaveBeenCalled();
  });

  it('U-M5: reverseMovement fallida → Swal blocking error con mensaje específico', async () => {
    seedTodayMovements();
    fakeState.reverseMovementImpl.mockReturnValue({
      succeeded: false,
      data: undefined,
      errors: [{ code: 'Warehouse.SaleOutAlreadyConsumed', description: 'La salida ya fue consumida por ventas — no se puede revertir la entrada de tienda.' }],
    });
    renderPage();
    openToday();
    fireEvent.click(screen.getByTestId('mv-actions-toggle-mv-out'));
    fireEvent.click(screen.getByTestId('mv-revert-mv-out'));
    await waitFor(() =>
      expect(showBlockingErrorMock).toHaveBeenCalledWith(
        expect.any(String),
        'La salida ya fue consumida por ventas — no se puede revertir la entrada de tienda.',
      ),
    );
  });

  it('U-M6: fila revertida muestra badge Revertido; fila reversal con icono violeta (E-R10)', () => {
    seedTodayMovements();
    renderPage();
    openToday();
    expect(screen.getByTestId('mv-reversal-badge-mv-other-reverted').textContent).toBe('Revertido');
    // La fila reversal existe con icono violeta y NO lleva badge (no es reversible).
    expect(screen.getByTestId('mv-type-icon-mv-rev').className).toContain('text-violet-600');
    // Los tipos normales conservan el azul del gear de Almacenes.
    expect(screen.getByTestId('mv-type-icon-mv-out').className).toContain('text-primary');
    expect(screen.queryByTestId('mv-reversal-badge-mv-rev')).toBeNull();
  });

  it('U-M-R2: mv-qty-{id} contiene solo la cantidad cruda; los paréntesis quedan fuera', () => {
    const today = new Date();
    fakeState.warehouses = [
      { id: 'wh-1', name: 'Central', isActive: true, createdDate: new Date(), createdByName: 'x' },
    ];
    fakeState.products = [['prod-1', { id: 'prod-1', name: 'Cerveza' }]];
    fakeState.movements = [
      { id: 'mv-dec', warehouseId: 'wh-1', productId: 'prod-1', type: 'purchase_in', quantity: 10.56, costPrice: 2, reason: null, createdDate: today, createdByName: 'x' },
    ];
    renderPage();
    openToday();
    const qty = screen.getByTestId('mv-qty-mv-dec');
    // Contrato E2E: `toHaveText('10.56')` / `hasText: /^10\.56$/` sobre el span.
    expect(qty.textContent).toBe('10.56');
    // Los paréntesis son texto hermano FUERA del span.
    expect(qty.parentElement?.textContent).toBe('(10.56)');
  });

  it('U-M-R3: el engranaje muestra Editar y Eliminar', () => {
    seedTodayMovements();
    renderPage();
    openToday();
    fireEvent.click(screen.getByTestId('mv-actions-toggle-mv-out'));
    expect(screen.getByTestId('mv-edit-mv-out').textContent).toBe('Editar');
    expect(screen.getByTestId('mv-revert-mv-out').textContent).toBe('Eliminar');
  });

  it('U-M9: load() refresca el historial tras la reversa (movements re-leído)', async () => {
    seedTodayMovements();
    fakeState.reverseMovementImpl.mockImplementation(() => {
      // La reversa "aterriza" en el storage — la página debe volver a leerla.
      fakeState.movements = [
        ...fakeState.movements,
        { id: 'mv-new-rev', warehouseId: 'wh-1', productId: 'prod-1', type: 'reversal', quantity: 6, reason: null, createdDate: new Date(), createdByName: 'x', reversalOfMovementId: 'mv-out' },
      ];
      return { succeeded: true, data: {}, errors: [] };
    });
    renderPage();
    openToday();
    expect(screen.queryByTestId('mv-qty-mv-new-rev')).toBeNull();
    fireEvent.click(screen.getByTestId('mv-actions-toggle-mv-out'));
    fireEvent.click(screen.getByTestId('mv-revert-mv-out'));
    await waitFor(() => expect(screen.getByTestId('mv-qty-mv-new-rev')).toBeTruthy());
    // El original ahora lleva badge.
    expect(screen.getByTestId('mv-reversal-badge-mv-out')).toBeTruthy();
  });

  // ─── Edición = reversa + recreación (F3, por fila D10) ─────────────────────

  it('U-M3: Editar abre el modal precargado con los valores de la fila', () => {
    seedTodayMovements();
    renderPage();
    openToday();
    fireEvent.click(screen.getByTestId('mv-actions-toggle-mv-in'));
    fireEvent.click(screen.getByTestId('mv-edit-mv-in'));
    // Modal de edición con la cantidad y el costo de la fila original precargados.
    const modal = screen.getByTestId('movement-form-purchase_in');
    expect(modal).toBeTruthy();
    expect((screen.getByTestId('movement-quantity') as HTMLInputElement).value).toBe('24');
    expect((screen.getByTestId('movement-cost') as HTMLInputElement).value).toBe(String(5));
    // A1/A9e: el tope (lo que queda del lote) se anuncia dentro del modal.
    expect(screen.getByTestId('movement-max-hint').textContent).toContain('24');
  });

  it('U-A1-1: editar una compra precarga lo que QUEDA del lote, no la cantidad original', () => {
    seedTodayMovements();
    // La compra original fue de 24, pero ya se consumieron 18 → quedan 6.
    fakeState.stockLevels = [
      {
        warehouseId: 'wh-1',
        productId: 'prod-1',
        onHand: 6,
        costPrice: 5,
        lots: [{ costPrice: 5, quantity: 6, lotOriginMovementId: 'mv-in' }],
      },
    ];
    renderPage();
    openToday();
    fireEvent.click(screen.getByTestId('mv-actions-toggle-mv-in'));
    fireEvent.click(screen.getByTestId('mv-edit-mv-in'));
    // Precargar 24 devolvería 6 y recrearía 24: 18 unidades fantasma.
    expect((screen.getByTestId('movement-quantity') as HTMLInputElement).value).toBe('6');
    expect(screen.getByTestId('movement-max-hint').textContent).toContain('6');
  });

  it('U-A1-2: guardar por encima del tope queda bloqueado y avisa (A9e)', () => {
    seedTodayMovements();
    fakeState.stockLevels = [
      {
        warehouseId: 'wh-1',
        productId: 'prod-1',
        onHand: 6,
        costPrice: 5,
        lots: [{ costPrice: 5, quantity: 6, lotOriginMovementId: 'mv-in' }],
      },
    ];
    renderPage();
    openToday();
    fireEvent.click(screen.getByTestId('mv-actions-toggle-mv-in'));
    fireEvent.click(screen.getByTestId('mv-edit-mv-in'));
    fireEvent.change(screen.getByTestId('movement-quantity'), { target: { value: '15' } });
    expect(screen.getByTestId('movement-max-error').textContent).toContain('6');
    fireEvent.click(screen.getByText('Guardar'));
    // Guardar está deshabilitado: no se tocó el servicio.
    expect(fakeState.reverseMovementImpl).not.toHaveBeenCalled();
    expect(fakeState.recordMovementImpl).not.toHaveBeenCalled();
  });

  it('U-A1-3: una salida no lleva tope (su límite real lo valida el servicio)', () => {
    seedTodayMovements();
    fakeState.stockLevels = [];
    renderPage();
    openToday();
    fireEvent.click(screen.getByTestId('mv-actions-toggle-mv-out'));
    fireEvent.click(screen.getByTestId('mv-edit-mv-out'));
    expect((screen.getByTestId('movement-quantity') as HTMLInputElement).value).toBe('6');
    expect(screen.queryByTestId('movement-max-hint')).toBeNull();
    expect(screen.queryByTestId('movement-max-error')).toBeNull();
  });

  it('U-M7b: guardar la edición de compra llama a applyPurchaseCostEdit atómico y recarga', async () => {
    seedTodayMovements();
    // mv-in: purchase_in qty 24 @ 5 → se edita a 15 @ 7.
    renderPage();
    openToday();
    fireEvent.click(screen.getByTestId('mv-actions-toggle-mv-in'));
    fireEvent.click(screen.getByTestId('mv-edit-mv-in'));
    fireEvent.change(screen.getByTestId('movement-quantity'), { target: { value: '15' } });
    fireEvent.change(screen.getByTestId('movement-cost'), { target: { value: '7' } });
    // Botón Guardar del modal (sin testid — por texto).
    fireEvent.click(screen.getByText('Guardar'));
    await waitFor(() =>
      expect(fakeState.applyCostEditImpl).toHaveBeenCalledWith('mv-in', 15, 7),
    );
    // Sin unidades fuera del almacén no hay diálogo de propagación.
    expect(confirmDialogMock).not.toHaveBeenCalled();
    expect(showToastSuccessMock).toHaveBeenCalled();
    // El modal se cierra tras guardar.
    expect(screen.queryByTestId('movement-form-purchase_in')).toBeNull();
  });

  it('U-M7: si applyPurchaseCostEdit falla, el error se muestra inline y el modal sigue abierto (A9d)', async () => {
    seedTodayMovements();
    fakeState.applyCostEditImpl.mockReturnValue({
      succeeded: false,
      data: undefined,
      errors: [
        {
          code: 'Warehouse.PurchasePropagationAmbiguous',
          description:
            'Hay varias compras con el mismo costo y sin referencia de origen — no se puede propagar el costo automáticamente.',
        },
      ],
    });
    renderPage();
    openToday();
    fireEvent.click(screen.getByTestId('mv-actions-toggle-mv-in'));
    fireEvent.click(screen.getByTestId('mv-edit-mv-in'));
    fireEvent.change(screen.getByTestId('movement-quantity'), { target: { value: '15' } });
    fireEvent.click(screen.getByText('Guardar'));
    // A9d: el error vive DENTRO del modal, que sigue abierto — sin Swal.
    await waitFor(() =>
      expect(screen.getByTestId('movement-form-error').textContent).toBe(
        'Hay varias compras con el mismo costo y sin referencia de origen — no se puede propagar el costo automáticamente.',
      ),
    );
    expect(showBlockingErrorMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('movement-form-purchase_in')).toBeTruthy();
  });

  it('U-A9d-1: tras un fallo el usuario reintenta y la edición atómica vuelve a aplicarse', async () => {
    seedTodayMovements();
    fakeState.applyCostEditImpl
      .mockReturnValueOnce({
        succeeded: false,
        data: undefined,
        errors: [{ code: 'Warehouse.InsufficientStock', description: 'Falta stock.' }],
      })
      .mockReturnValue({
        succeeded: true,
        data: { costOnly: false, storeEntries: 0, activeOrders: 0, deactivatedOrders: 0 },
        errors: [],
      });
    renderPage();
    openToday();
    fireEvent.click(screen.getByTestId('mv-actions-toggle-mv-in'));
    fireEvent.click(screen.getByTestId('mv-edit-mv-in'));
    fireEvent.change(screen.getByTestId('movement-quantity'), { target: { value: '9' } });
    fireEvent.click(screen.getByText('Guardar'));
    await waitFor(() => expect(screen.getByTestId('movement-form-error')).toBeTruthy());
    // Reintento: la operación atómica vuelve a ejecutarse completa.
    fireEvent.click(screen.getByText('Guardar'));
    await waitFor(() => expect(showToastSuccessMock).toHaveBeenCalled());
    expect(fakeState.applyCostEditImpl).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('movement-form-purchase_in')).toBeNull();
  });

  it('U-A9e-1: el tope sigue vigente tras un fallo (la edición atómica no lo baja a 0)', async () => {
    seedTodayMovements();
    fakeState.stockLevels = [
      {
        warehouseId: 'wh-1',
        productId: 'prod-1',
        onHand: 6,
        costPrice: 5,
        lots: [{ costPrice: 5, quantity: 6, lotOriginMovementId: 'mv-in' }],
      },
    ];
    fakeState.applyCostEditImpl.mockReturnValue({
      succeeded: false,
      data: undefined,
      errors: [{ code: 'Warehouse.InsufficientStock', description: 'Falta stock.' }],
    });
    renderPage();
    openToday();
    fireEvent.click(screen.getByTestId('mv-actions-toggle-mv-in'));
    fireEvent.click(screen.getByTestId('mv-edit-mv-in'));
    fireEvent.click(screen.getByText('Guardar'));
    await waitFor(() => expect(screen.getByTestId('movement-form-error')).toBeTruthy());
    // El tope se congeló al abrir (6) y la edición atómica no lo alteró.
    expect(screen.getByTestId('movement-max-hint').textContent).toContain('6');
    expect((screen.getByTestId('movement-quantity') as HTMLInputElement).value).toBe('6');
  });

  it('U-M-R1: el bloque compacto usa el formato unificado (compra/sale_out/transferencia)', () => {
    seedTodayMovements();
    // sale_out con destino de tienda conocido (multi-tienda): resuelve por storeList.
    fakeState.movements.push({
      id: 'mv-out-store',
      warehouseId: 'wh-1',
      productId: 'prod-1',
      type: 'sale_out',
      quantity: 3,
      reason: null,
      toStoreId: 's1',
      createdDate: new Date(),
      createdByName: 'x',
    });
    renderPage();
    openToday();
    // purchase_in: rótulo 'Compra' en la fila 2 (las dos filas de compra del seed)
    // y total (24 × 5) cuando hay costPrice.
    expect(screen.getAllByText('Compra')).toHaveLength(2);
    expect(screen.getByText('120 CUP')).toBeTruthy();
    // sale_out con toStoreId → 'Central → Tienda Seleccionada'.
    expect(screen.getByText('Central → Tienda Seleccionada')).toBeTruthy();
    // transfer_in → 'Central → Anexo'.
    expect(screen.getByText('Central → Anexo')).toBeTruthy();
    // Fila 3: compras (mv-in, mv-other-reverted), sale_out legacy sin toStoreId
    // (mv-out) y reversal (mv-rev) muestran solo 'Central', sin flecha.
    expect(screen.getAllByText('Central')).toHaveLength(4);
  });

  it('U-PROP-1: con unidades fuera confirma con detalle; cancelar no aplica la propagación', async () => {
    seedTodayMovements();
    fakeState.previewImpl.mockReturnValue({
      succeeded: true,
      data: {
        ...EMPTY_PREVIEW,
        hasOutflow: true,
        saleOutMovements: 1,
        storeEntries: 1,
        activeOrders: 1,
        soldUnits: 2,
        storeUnits: 4,
        from: 5,
        to: 7,
      },
      errors: [],
    });
    confirmDialogMock.mockResolvedValueOnce(false);
    renderPage();
    openToday();
    fireEvent.click(screen.getByTestId('mv-actions-toggle-mv-in'));
    fireEvent.click(screen.getByTestId('mv-edit-mv-in'));
    fireEvent.change(screen.getByTestId('movement-cost'), { target: { value: '7' } });
    fireEvent.click(screen.getByText('Guardar'));
    await waitFor(() => expect(confirmDialogMock).toHaveBeenCalledTimes(1));
    expect(confirmDialogMock.mock.calls[0][0].title).toBe('Propagar costo de la compra');
    expect(confirmDialogMock.mock.calls[0][0].message).toContain('de 5 CUP a 7 CUP');
    expect(fakeState.applyCostEditImpl).not.toHaveBeenCalled();
  });

  it('U-PROP-2: compra sin remanente abre modo costOnly y guarda con cantidad 0', async () => {
    seedTodayMovements();
    fakeState.stockLevels = [
      { warehouseId: 'wh-1', productId: 'prod-1', onHand: 0, costPrice: 5, lots: [] },
    ];
    fakeState.previewImpl.mockReturnValue({
      succeeded: true,
      data: { ...EMPTY_PREVIEW, hasOutflow: true, saleOutMovements: 1, storeEntries: 1, activeOrders: 1, soldUnits: 2 },
      errors: [],
    });
    renderPage();
    openToday();
    fireEvent.click(screen.getByTestId('mv-actions-toggle-mv-in'));
    fireEvent.click(screen.getByTestId('mv-edit-mv-in'));
    // Sin remanente no hay campo de cantidad; el aviso explica el modo.
    expect(screen.queryByTestId('movement-quantity')).toBeNull();
    expect(screen.getByTestId('movement-cost-only-hint')).toBeTruthy();
    fireEvent.change(screen.getByTestId('movement-cost'), { target: { value: '9' } });
    fireEvent.click(screen.getByText('Guardar'));
    // confirmDialog (mock) resuelve true → aplica la corrección de solo costo.
    await waitFor(() => expect(fakeState.applyCostEditImpl).toHaveBeenCalledWith('mv-in', 0, 9));
  });

  it('U-M8: el acordeón por día muestra muchas reversas intercaladas con sus badges', () => {
    const today = new Date();
    fakeState.warehouses = [
      { id: 'wh-1', name: 'Central', isActive: true, createdDate: new Date(), createdByName: 'x' },
      { id: 'wh-2', name: 'Anexo', isActive: true, createdDate: new Date(), createdByName: 'x' },
    ];
    fakeState.products = [['prod-1', { id: 'prod-1', name: 'Cerveza' }]];
    fakeState.stockLevels = [
      { warehouseId: 'wh-1', productId: 'prod-1', onHand: 0, costPrice: 5, lots: [] },
    ];
    fakeState.movements = [
      { id: 'mv-p1', warehouseId: 'wh-1', productId: 'prod-1', type: 'purchase_in', quantity: 10, costPrice: 5, reason: null, createdDate: today, createdByName: 'x' },
      { id: 'rev-1', warehouseId: 'wh-1', productId: 'prod-1', type: 'reversal', quantity: 10, reason: null, createdDate: today, createdByName: 'x', reversalOfMovementId: 'mv-p1' },
      { id: 'mv-p2', warehouseId: 'wh-1', productId: 'prod-1', type: 'purchase_in', quantity: 8, costPrice: 6, reason: null, createdDate: today, createdByName: 'x' },
      { id: 'mv-s1', warehouseId: 'wh-1', productId: 'prod-1', type: 'sale_out', quantity: 4, reason: null, createdDate: today, createdByName: 'x', lotOriginMovementId: 'mv-p2' },
      { id: 'rev-2', warehouseId: 'wh-1', productId: 'prod-1', type: 'reversal', quantity: 4, reason: null, createdDate: today, createdByName: 'x', reversalOfMovementId: 'mv-s1', reversalInventoryEntryId: 'e1' },
      { id: 'mv-ti', warehouseId: 'wh-1', productId: 'prod-1', type: 'transfer_in', quantity: 2, reason: null, createdDate: today, createdByName: 'x', fromWarehouseId: 'wh-2', toWarehouseId: 'wh-1' },
    ];
    renderPage();
    openToday();

    // El header del día cuenta TODAS las filas (6), intercaladas.
    expect(screen.getByTestId(`mv-day-panel-toggle-${toLocalDayKey(today)}`).textContent).toContain('(6)');

    // Cada original revertida lleva badge; las filas de reversa no.
    expect(screen.getByTestId('mv-reversal-badge-mv-p1')).toBeTruthy();
    expect(screen.getByTestId('mv-reversal-badge-mv-s1')).toBeTruthy();
    expect(screen.queryByTestId('mv-reversal-badge-rev-1')).toBeNull();
    expect(screen.queryByTestId('mv-reversal-badge-rev-2')).toBeNull();

    // Ambas filas de reversa existen con su icono violeta.
    expect(screen.getByTestId('mv-qty-rev-1')).toBeTruthy();
    expect(screen.getByTestId('mv-qty-rev-2')).toBeTruthy();
    expect(screen.getByTestId('mv-type-icon-rev-1').className).toContain('text-violet-600');
    expect(screen.getByTestId('mv-type-icon-rev-2').className).toContain('text-violet-600');

    // El gear solo aparece en la compra NO revertida.
    expect(screen.queryByTestId('mv-actions-toggle-mv-p1')).toBeNull();
    expect(screen.queryByTestId('mv-actions-toggle-mv-s1')).toBeNull();
    expect(screen.getByTestId('mv-actions-toggle-mv-p2')).toBeTruthy();
  });

  it('U-C1: el modal de edición precarga los valores del original por tipo', () => {
    seedTodayMovements();
    // Compra con remanente 6 → precarga el remanente y su costo.
    fakeState.stockLevels = [
      { warehouseId: 'wh-1', productId: 'prod-1', onHand: 6, costPrice: 5, lots: [{ costPrice: 5, quantity: 6, lotOriginMovementId: 'mv-in' }] },
    ];
    // Transferencia hacia wh-2 con destino precargable.
    fakeState.movements.push({
      id: 'mv-tr', warehouseId: 'wh-1', productId: 'prod-1', type: 'transfer_out', quantity: 3,
      reason: null, createdDate: new Date(), createdByName: 'x', toWarehouseId: 'wh-2',
    });
    renderPage();
    openToday();

    // purchase_in: cantidad = lo que queda (6), costo = original (5), campo de costo visible.
    fireEvent.click(screen.getByTestId('mv-actions-toggle-mv-in'));
    fireEvent.click(screen.getByTestId('mv-edit-mv-in'));
    expect((screen.getByTestId('movement-quantity') as HTMLInputElement).value).toBe('6');
    expect((screen.getByTestId('movement-cost') as HTMLInputElement).value).toBe('5');
    fireEvent.click(screen.getByText('Cancelar'));

    // sale_out: cantidad = original (6); sin campo de costo (solo compras).
    fireEvent.click(screen.getByTestId('mv-actions-toggle-mv-out'));
    fireEvent.click(screen.getByTestId('mv-edit-mv-out'));
    expect((screen.getByTestId('movement-quantity') as HTMLInputElement).value).toBe('6');
    expect(screen.queryByTestId('movement-cost')).toBeNull();
    fireEvent.click(screen.getByText('Cancelar'));

    // transfer_out: cantidad = original (3) y destino precargado.
    fireEvent.click(screen.getByTestId('mv-actions-toggle-mv-tr'));
    fireEvent.click(screen.getByTestId('mv-edit-mv-tr'));
    expect((screen.getByTestId('movement-quantity') as HTMLInputElement).value).toBe('3');
    expect((screen.getByTestId('movement-target') as HTMLSelectElement).value).toBe('wh-2');
  });

  it('U-C2: la validación por modo coincide con el validador existente (validateMovementQuantity)', () => {
    seedTodayMovements();
    renderPage();
    openToday();

    const quantityVerdicts: Array<{ value: string; valid: boolean }> = [
      { value: '0', valid: false },
      { value: '-1', valid: false },
      { value: '0.01', valid: true },
      { value: '5', valid: true },
    ];

    for (const mode of [
      { action: 'mv-in', form: 'purchase_in' },
      { action: 'mv-out', form: 'sale_out' },
    ]) {
      fireEvent.click(screen.getByTestId(`mv-actions-toggle-${mode.action}`));
      fireEvent.click(screen.getByTestId(`mv-edit-${mode.action}`));
      // El costo solo aplica a compras; se completa válido para aislar la cantidad.
      if (mode.form === 'purchase_in') {
        fireEvent.change(screen.getByTestId('movement-cost'), { target: { value: '5' } });
      }
      for (const { value, valid } of quantityVerdicts) {
        fireEvent.change(screen.getByTestId('movement-quantity'), { target: { value } });
        // Misma regla que el validador del servicio (fuente de verdad).
        expect(validateMovementQuantity(Number(value)).succeeded).toBe(valid);
        const save = screen.getByRole('button', { name: 'Guardar' }) as HTMLButtonElement;
        expect(save.disabled).toBe(!valid);
      }
      fireEvent.click(screen.getByText('Cancelar'));
    }
  });
});
