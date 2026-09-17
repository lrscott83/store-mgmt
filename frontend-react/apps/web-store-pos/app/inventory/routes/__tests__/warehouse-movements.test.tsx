import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  isOwnerAdminFlag: true,
}));

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

  it('U-M7b: guardar la edición ejecuta reversa + recordMovement y recarga', async () => {
    seedTodayMovements();
    // mv-in: purchase_in qty 24 @ 5 → se edita a 15 @ 7.
    fakeState.reverseMovementImpl.mockReturnValue({ succeeded: true, data: {}, errors: [] });
    fakeState.recordMovementImpl.mockReturnValue({
      succeeded: true,
      data: [{ id: 'mv-new' }],
      errors: [],
    });
    renderPage();
    openToday();
    fireEvent.click(screen.getByTestId('mv-actions-toggle-mv-in'));
    fireEvent.click(screen.getByTestId('mv-edit-mv-in'));
    fireEvent.change(screen.getByTestId('movement-quantity'), { target: { value: '15' } });
    fireEvent.change(screen.getByTestId('movement-cost'), { target: { value: '7' } });
    // Botón Guardar del modal (sin testid — por texto).
    fireEvent.click(screen.getByText('Guardar'));
    await waitFor(() => expect(fakeState.reverseMovementImpl).toHaveBeenCalledWith('mv-in', undefined));
    expect(fakeState.recordMovementImpl).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'purchase_in', quantity: 15, costPrice: 7 }),
    );
    expect(showToastSuccessMock).toHaveBeenCalled();
    // El modal se cierra tras guardar.
    expect(screen.queryByTestId('movement-form-purchase_in')).toBeNull();
  });

  it('U-M7: si recordMovement falla tras la reversa, el error se muestra inline y la reversa NO se deshace (A9d)', async () => {
    seedTodayMovements();
    fakeState.reverseMovementImpl.mockReturnValue({ succeeded: true, data: {}, errors: [] });
    fakeState.recordMovementImpl.mockReturnValue({
      succeeded: false,
      data: undefined,
      errors: [{ code: 'Warehouse.InsufficientStock', description: 'No hay suficiente stock en el almacén.' }],
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
        'No hay suficiente stock en el almacén.',
      ),
    );
    expect(showBlockingErrorMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('movement-form-purchase_in')).toBeTruthy();
    // La reversa quedó persistida (no-atómico §7.3) — no se llamó dos veces.
    expect(fakeState.reverseMovementImpl).toHaveBeenCalledTimes(1);
  });

  it('U-A9d-1: tras el fallo del paso 2 el usuario corrige y reintenta sin repetir la reversa', async () => {
    seedTodayMovements();
    fakeState.reverseMovementImpl.mockReturnValue({ succeeded: true, data: {}, errors: [] });
    fakeState.recordMovementImpl
      .mockReturnValueOnce({
        succeeded: false,
        data: undefined,
        errors: [{ code: 'Warehouse.InsufficientStock', description: 'Falta stock.' }],
      })
      .mockReturnValue({ succeeded: true, data: [{ id: 'mv-new' }], errors: [] });
    renderPage();
    openToday();
    fireEvent.click(screen.getByTestId('mv-actions-toggle-mv-in'));
    fireEvent.click(screen.getByTestId('mv-edit-mv-in'));
    fireEvent.change(screen.getByTestId('movement-quantity'), { target: { value: '9' } });
    fireEvent.click(screen.getByText('Guardar'));
    await waitFor(() => expect(screen.getByTestId('movement-form-error')).toBeTruthy());
    // Reintento: la reversa NO se repite (descontaría stock dos veces).
    fireEvent.click(screen.getByText('Guardar'));
    await waitFor(() => expect(showToastSuccessMock).toHaveBeenCalled());
    expect(fakeState.reverseMovementImpl).toHaveBeenCalledTimes(1);
    expect(fakeState.recordMovementImpl).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('movement-form-purchase_in')).toBeNull();
  });

  it('U-A9e-1: el tope sigue vigente durante el reintento (la reversa no lo baja a 0)', async () => {
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
    fakeState.reverseMovementImpl.mockReturnValue({ succeeded: true, data: {}, errors: [] });
    fakeState.recordMovementImpl.mockReturnValue({
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
    // La reversa bajó el nivel real a 0, pero el tope se congeló al abrir (6).
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
    expect(screen.getByText('$120')).toBeTruthy();
    // sale_out con toStoreId → 'Central → Tienda Seleccionada'.
    expect(screen.getByText('Central → Tienda Seleccionada')).toBeTruthy();
    // transfer_in → 'Central → Anexo'.
    expect(screen.getByText('Central → Anexo')).toBeTruthy();
    // Fila 3: compras (mv-in, mv-other-reverted), sale_out legacy sin toStoreId
    // (mv-out) y reversal (mv-rev) muestran solo 'Central', sin flecha.
    expect(screen.getAllByText('Central')).toHaveLength(4);
  });
});
