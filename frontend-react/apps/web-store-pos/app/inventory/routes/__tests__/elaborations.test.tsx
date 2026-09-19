import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import { toLocalDayKey } from '~/shared/lib/date-utils';
import { formatCurrency } from '~/shared/lib/format-currency';
import { ProductCategoryRepository } from '~/sales/lib/repositories/product-category-repository';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';
import { ElaborationOfflineService } from '../../lib/services/elaboration-offline-service';
import { InventoryOfflineService } from '../../lib/services/inventory-offline-service';
import { RecipeOfflineService } from '../../lib/services/recipe-offline-service';
import { WarehouseOfflineService } from '../../lib/services/warehouse-offline-service';
import { ElaborationsPage } from '../elaborations';

const storeId = 's1';

// ─── auth store mock ─────────────────────────────────────────────────────────
const mockUser = vi.hoisted(() => ({
  selectedStoreId: 's1',
  login: 'jdoe',
  isOwnerAdmin: true,
  featureIds: [121],
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

vi.mock('~/auth/routes/loaders', () => ({
  featureLoader: () => vi.fn().mockResolvedValue(null),
}));

const showToastSuccessMock = vi.hoisted(() => vi.fn());
vi.mock('~/shared/lib/toast', () => ({
  showToastSuccess: (...args: unknown[]) => showToastSuccessMock(...args),
}));

// ─── world seeding (real services, localStorage) ────────────────────────────

function seedProduct(productRepo: ProductRepository, id: string, name: string) {
  productRepo.addImportedProduct({
    id,
    name,
    categoryId: 'cat-1',
    categoryName: 'Elaborados',
    price: 700,
    order: 1,
    availableToSale: true,
    discountFromInvantory: true,
    businessId: storeId,
    isActive: true,
    createdDate: new Date(),
    createdByName: 'test',
  });
}

interface SeededWorld {
  recipeId: string;
  warehouseId: string;
}

/** Seeds the acceptance world; `harinaStock` lets a test force a shortage. */
function seedWorld(harinaStock: number): SeededWorld {
  const categoryRepo = new ProductCategoryRepository(storeId);
  categoryRepo.addImportedProductCategory({
    id: 'cat-1',
    name: 'Elaborados',
    order: 1,
    isActive: true,
  });
  const productRepo = new ProductRepository(storeId, categoryRepo);
  seedProduct(productRepo, 'pan', 'Pan de 500g');
  seedProduct(productRepo, 'harina', 'Harina');
  seedProduct(productRepo, 'levadura', 'Levadura');
  seedProduct(productRepo, 'sal', 'Sal');
  seedProduct(productRepo, 'agua', 'Agua');

  const inventoryService = new InventoryOfflineService(storeId, productRepo);
  const warehouseService = new WarehouseOfflineService(storeId, productRepo, inventoryService);
  const recipeService = new RecipeOfflineService(storeId, productRepo);

  const warehouseId = warehouseService.createWarehouse('Central').data!.id;
  const seedStock = (productId: string, quantity: number, costPrice: number) => {
    const result = warehouseService.recordMovement({
      type: 'purchase_in',
      warehouseId,
      productId,
      quantity,
      costPrice,
    });
    expect(result.succeeded).toBe(true);
  };
  seedStock('harina', harinaStock, 20);
  seedStock('levadura', 100, 80);
  seedStock('sal', 100, 15);
  seedStock('agua', 100, 0.5);

  const recipe = recipeService.addRecipe({
    productId: 'pan',
    outputQty: 20,
    components: [
      { productId: 'harina', qty: 3, scrapPct: 2 },
      { productId: 'levadura', qty: 0.05, scrapPct: 0 },
      { productId: 'sal', qty: 0.04, scrapPct: 0 },
      { productId: 'agua', qty: 2, scrapPct: 5 },
    ],
    laborCost: 50,
    overheadPct: 10,
  });
  expect(recipe.succeeded).toBe(true);

  return { recipeId: recipe.data!.id, warehouseId };
}

/** Seeds a world whose recipe lists the SAME ingredient on two separate rows. */
function seedDuplicateRowWorld(): SeededWorld {
  const categoryRepo = new ProductCategoryRepository(storeId);
  categoryRepo.addImportedProductCategory({
    id: 'cat-1',
    name: 'Elaborados',
    order: 1,
    isActive: true,
  });
  const productRepo = new ProductRepository(storeId, categoryRepo);
  seedProduct(productRepo, 'pan', 'Pan de 500g');
  seedProduct(productRepo, 'harina', 'Harina');

  const inventoryService = new InventoryOfflineService(storeId, productRepo);
  const warehouseService = new WarehouseOfflineService(storeId, productRepo, inventoryService);
  const recipeService = new RecipeOfflineService(storeId, productRepo);

  const warehouseId = warehouseService.createWarehouse('Central').data!.id;
  const seeded = warehouseService.recordMovement({
    type: 'purchase_in',
    warehouseId,
    productId: 'harina',
    quantity: 100,
    costPrice: 20,
  });
  expect(seeded.succeeded).toBe(true);

  const recipe = recipeService.addRecipe({
    productId: 'pan',
    outputQty: 1,
    components: [
      { productId: 'harina', qty: 1, scrapPct: 0 },
      { productId: 'harina', qty: 2, scrapPct: 0 },
    ],
    laborCost: 0,
    overheadPct: 0,
  });
  expect(recipe.succeeded).toBe(true);

  return { recipeId: recipe.data!.id, warehouseId };
}

function renderPage() {
  return render(
    <IntlProvider locale="es" messages={esMessages}>
      <ElaborationsPage />
    </IntlProvider>,
  );
}

/** A fresh service over the same localStorage, for reading persisted state. */
function buildElaborationService(): ElaborationOfflineService {
  const productRepo = new ProductRepository(storeId, new ProductCategoryRepository(storeId));
  const inventoryService = new InventoryOfflineService(storeId, productRepo);
  return new ElaborationOfflineService(
    storeId,
    productRepo,
    new RecipeOfflineService(storeId, productRepo),
    new WarehouseOfflineService(storeId, productRepo, inventoryService),
    inventoryService,
  );
}

function selectPlan(recipeId: string, warehouseId: string, batches = '1') {
  fireEvent.change(screen.getByTestId('elaboration-recipe'), { target: { value: recipeId } });
  fireEvent.change(screen.getByTestId('elaboration-batches'), { target: { value: batches } });
  fireEvent.change(screen.getByTestId('elaboration-warehouse'), {
    target: { value: warehouseId },
  });
}

beforeEach(() => {
  localStorage.clear();
  showToastSuccessMock.mockClear();
});

describe('ElaborationsPage — Elaboraciones (feature 121)', () => {
  it('renders the plan preview with theoretical quantities and the estimated unit cost', () => {
    const { recipeId, warehouseId } = seedWorld(100);
    renderPage();

    selectPlan(recipeId, warehouseId);

    const plan = screen.getByTestId('elaboration-plan');
    expect(within(plan).getByText('Harina')).toBeTruthy();
    // Acceptance recipe: harina theoretical = 3 × (1 + 2/100) = 3.06.
    expect(screen.getByTestId('elaboration-row-0').textContent).toContain('3.06');
    expect(screen.getByTestId('elaboration-produced-qty').textContent).toBe('20');
    // 123.535 / 20 → 6.18.
    expect(screen.getByTestId('elaboration-unit-cost').textContent).toBe(formatCurrency(6.18));
  });

  it('blocks the confirm on insufficient stock and shows the NAMED message', async () => {
    const { recipeId, warehouseId } = seedWorld(1);
    renderPage();

    selectPlan(recipeId, warehouseId);

    // The row flags the shortage before confirming.
    expect(screen.getByTestId('elaboration-insufficient-0')).toBeTruthy();

    fireEvent.click(screen.getByTestId('elaboration-confirm'));

    await waitFor(() => {
      expect(screen.getByTestId('elaboration-error').textContent).toBe(
        'No hay suficiente stock de Harina: disponible 1, necesario 3.06.',
      );
    });

    // Nothing was written.
    expect(buildElaborationService().getStorageElaborations()).toHaveLength(0);
    expect(showToastSuccessMock).not.toHaveBeenCalled();
  });

  it('confirms a valid elaboration and the history shows its real total and unit cost', async () => {
    const { recipeId, warehouseId } = seedWorld(100);
    renderPage();

    selectPlan(recipeId, warehouseId);
    fireEvent.click(screen.getByTestId('elaboration-confirm'));

    await waitFor(() => {
      expect(showToastSuccessMock).toHaveBeenCalled();
    });

    const [elaboration] = buildElaborationService().getStorageElaborations();
    expect(elaboration).toBeDefined();

    // Expand today's history panel.
    const todayKey = toLocalDayKey(new Date());
    fireEvent.click(screen.getByTestId(`elaboration-day-toggle-${todayKey}`));

    const row = screen.getByTestId(`elaboration-history-row-${elaboration.id}`);
    expect(row.textContent).toContain('Pan de 500g');
    expect(row.textContent).toContain(formatCurrency(elaboration.totalCost));
    expect(row.textContent).toContain(formatCurrency(elaboration.unitCost));
  });

  it('shows the warehouse-required empty state when no warehouse exists', () => {
    // Products only, no warehouse.
    const categoryRepo = new ProductCategoryRepository(storeId);
    categoryRepo.addImportedProductCategory({
      id: 'cat-1',
      name: 'Elaborados',
      order: 1,
      isActive: true,
    });
    const productRepo = new ProductRepository(storeId, categoryRepo);
    seedProduct(productRepo, 'pan', 'Pan de 500g');

    renderPage();

    expect(
      screen.getByText('No hay almacenes configurados. Cree un almacén para poder elaborar.'),
    ).toBeTruthy();
  });

  it('clamps a negative real quantity to zero (no negative preview, non-negative actualQty)', async () => {
    const { recipeId, warehouseId } = seedWorld(100);
    renderPage();
    selectPlan(recipeId, warehouseId);

    expect(screen.getByTestId('elaboration-ingredients-cost').textContent).toBe(
      formatCurrency(66.85),
    );

    const confirmSpy = vi.spyOn(ElaborationOfflineService.prototype, 'confirmElaboration');
    try {
      fireEvent.change(screen.getByTestId('elaboration-actual-0'), { target: { value: '-5' } });

      // Harina clamps to 0 → only levadura + sal + agua contribute (4 + 0.6 + 1.05).
      expect(screen.getByTestId('elaboration-ingredients-cost').textContent).toBe(
        formatCurrency(5.65),
      );
      expect(screen.getByTestId('elaboration-total-cost').textContent).not.toContain('-');

      fireEvent.click(screen.getByTestId('elaboration-confirm'));
      await waitFor(() => expect(showToastSuccessMock).toHaveBeenCalled());

      const params = confirmSpy.mock.calls[0][0];
      for (const component of params.actualComponents ?? []) {
        expect(component.actualQty).toBeGreaterThanOrEqual(0);
      }
      const [elaboration] = buildElaborationService().getStorageElaborations();
      const harina = elaboration.components.find((component) => component.productId === 'harina');
      expect(harina?.actualQty).toBe(0);
      expect(elaboration.totalCost).toBeGreaterThanOrEqual(0);
    } finally {
      confirmSpy.mockRestore();
    }
  });

  it('keeps duplicate ingredient rows independently editable and sends each row own actualQty', async () => {
    const { recipeId, warehouseId } = seedDuplicateRowWorld();
    renderPage();
    selectPlan(recipeId, warehouseId);

    const first = screen.getByTestId('elaboration-actual-0') as HTMLInputElement;
    const second = screen.getByTestId('elaboration-actual-1') as HTMLInputElement;
    expect(first.value).toBe('1');
    expect(second.value).toBe('2');

    // Editing the first row must not change the second: the rows are independent.
    fireEvent.change(first, { target: { value: '5' } });
    expect((screen.getByTestId('elaboration-actual-0') as HTMLInputElement).value).toBe('5');
    expect((screen.getByTestId('elaboration-actual-1') as HTMLInputElement).value).toBe('2');

    fireEvent.change(second, { target: { value: '7' } });
    expect((screen.getByTestId('elaboration-actual-0') as HTMLInputElement).value).toBe('5');
    expect((screen.getByTestId('elaboration-actual-1') as HTMLInputElement).value).toBe('7');

    const confirmSpy = vi.spyOn(ElaborationOfflineService.prototype, 'confirmElaboration');
    try {
      fireEvent.click(screen.getByTestId('elaboration-confirm'));
      await waitFor(() => expect(showToastSuccessMock).toHaveBeenCalled());

      const params = confirmSpy.mock.calls[0][0];
      expect(params.actualComponents).toHaveLength(2);
      expect(params.actualComponents?.map((component) => component.productId)).toEqual([
        'harina',
        'harina',
      ]);
      expect(params.actualComponents?.map((component) => component.actualQty)).toEqual([5, 7]);
    } finally {
      confirmSpy.mockRestore();
    }
  });

  it('clears a stale error when the selection changes', async () => {
    const { recipeId, warehouseId } = seedWorld(1);
    renderPage();
    selectPlan(recipeId, warehouseId);

    fireEvent.click(screen.getByTestId('elaboration-confirm'));
    await waitFor(() => {
      expect(screen.getByTestId('elaboration-error')).toBeTruthy();
    });

    fireEvent.change(screen.getByTestId('elaboration-batches'), { target: { value: '2' } });

    await waitFor(() => {
      expect(screen.queryByTestId('elaboration-error')).toBeNull();
    });
  });

  it('edits a real quantity: the live preview recomputes and the stored elaboration keeps the real cost', async () => {
    const { recipeId, warehouseId } = seedWorld(100);
    renderPage();
    selectPlan(recipeId, warehouseId);

    expect(screen.getByTestId('elaboration-unit-cost').textContent).toBe(formatCurrency(6.18));

    fireEvent.change(screen.getByTestId('elaboration-actual-0'), { target: { value: '1' } });

    // Harina 1 × 20 = 20, plus 4 + 0.6 + 1.05 → 25.65; overhead 2.565; labor 50.
    expect(screen.getByTestId('elaboration-ingredients-cost').textContent).toBe(
      formatCurrency(25.65),
    );
    expect(screen.getByTestId('elaboration-total-cost').textContent).toBe(formatCurrency(78.215));
    expect(screen.getByTestId('elaboration-unit-cost').textContent).toBe(formatCurrency(3.91));

    fireEvent.click(screen.getByTestId('elaboration-confirm'));
    await waitFor(() => expect(showToastSuccessMock).toHaveBeenCalled());

    const [elaboration] = buildElaborationService().getStorageElaborations();
    const harina = elaboration.components.find((component) => component.productId === 'harina');
    expect(harina?.actualQty).toBe(1);
    expect(elaboration.totalCost).toBeCloseTo(78.215, 6);
    expect(elaboration.unitCost).toBe(3.91);

    const todayKey = toLocalDayKey(new Date());
    fireEvent.click(screen.getByTestId(`elaboration-day-toggle-${todayKey}`));

    const row = screen.getByTestId(`elaboration-history-row-${elaboration.id}`);
    expect(row.textContent).toContain(formatCurrency(elaboration.totalCost));
    expect(row.textContent).toContain(formatCurrency(elaboration.unitCost));
  });

  it('warns that a negative real quantity is treated as zero while the preview stays non-negative', () => {
    const { recipeId, warehouseId } = seedWorld(100);
    renderPage();
    selectPlan(recipeId, warehouseId);

    expect(screen.queryByTestId('elaboration-negative-warning')).toBeNull();

    fireEvent.change(screen.getByTestId('elaboration-actual-0'), { target: { value: '-5' } });

    expect(screen.getByTestId('elaboration-negative-warning').textContent).toBe(
      'Las cantidades reales negativas se tratan como cero.',
    );
    // The clamp is preserved: harina → 0, only levadura + sal + agua contribute.
    expect(screen.getByTestId('elaboration-ingredients-cost').textContent).toBe(
      formatCurrency(5.65),
    );
    expect(screen.getByTestId('elaboration-total-cost').textContent).not.toContain('-');
  });

  it('hides the negative-quantity warning when the value is corrected to a non-negative number', () => {
    const { recipeId, warehouseId } = seedWorld(100);
    renderPage();
    selectPlan(recipeId, warehouseId);

    fireEvent.change(screen.getByTestId('elaboration-actual-0'), { target: { value: '-5' } });
    expect(screen.getByTestId('elaboration-negative-warning')).toBeTruthy();

    fireEvent.change(screen.getByTestId('elaboration-actual-0'), { target: { value: '3' } });

    expect(screen.queryByTestId('elaboration-negative-warning')).toBeNull();
  });
});
