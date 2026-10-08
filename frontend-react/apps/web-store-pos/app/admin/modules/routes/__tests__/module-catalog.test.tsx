import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { currentModulePrice } from '@store-mgmt/domain';
import type { BaseResponseModel, Module, ModuleCatalogPricingResult } from '@store-mgmt/domain';
import esMessages from '~/shared/lib/i18n/es';

// ─── superAdminLoader mock ────────────────────────────────────────────────────

vi.mock('~/auth/routes/loaders', () => ({
  superAdminLoader: vi.fn().mockResolvedValue(null),
}));

// ─── storeHttpService mock ────────────────────────────────────────────────────

vi.mock('~/management/stores/lib/services/store-http-service', () => ({
  storeHttpService: {
    getModuleCatalog: vi.fn(),
    getPlans: vi.fn(),
    updateModulePricing: vi.fn(),
  },
}));

// ─── toast mock ───────────────────────────────────────────────────────────────

vi.mock('~/shared/lib/toast', () => ({
  showToastSuccess: vi.fn(),
  showToastError: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

/**
 * Catalog row exactly as GET /v1/modules/ToStore serializes ModuleDto: it carries NO
 * `selected` (that field only exists on the per-store payload) and no code reads it here,
 * so the fixture stays wire-faithful and the cast below bridges the declared `Module`
 * return type to the real DTO.
 */
function moduleDto(
  id: number,
  name: string,
  price: number,
  discountPrice = 0,
  percentDiscountPrice = 0,
) {
  return {
    id,
    name,
    order: id,
    priceIncluded: false,
    isActive: true,
    price,
    currentPrice: currentModulePrice(price, percentDiscountPrice, discountPrice),
    discountPrice,
    percentDiscountPrice,
    availableToStore: true,
    featureDescriptions: [],
    discountText: '',
  };
}

function plan(order: number, planType: string, moduleIds: number[]) {
  return {
    id: order,
    name: planType,
    order,
    planType,
    price: 0,
    modules: moduleIds.map((moduleId) => ({
      moduleId,
      name: `module-${moduleId}`,
      order: 0,
      priceIncluded: false,
      isActive: true,
      price: 0,
      currentPrice: 0,
      discountPrice: 0,
      percentDiscountPrice: 0,
      discountText: '',
      featureDescriptions: [],
    })),
  };
}

/**
 * Cumulative plan membership (as GET /v1/plans reports it), so `groupModulesByPlanDelta`
 * derives a real per-plan delta: Gratis claims Ventas, Pago adds Inventario, Superior adds
 * Mayorista, and Almacenes + Exclusivo VIP are claimed by NO plan (the catch-all — VIP is
 * excluded server-side from /v1/plans, so its modules land there).
 */
const CATALOG = [
  moduleDto(1, 'Ventas', 10),
  moduleDto(2, 'Inventario', 20),
  moduleDto(3, 'Mayorista', 30, 0, 10),
  moduleDto(4, 'Almacenes', 40, 5),
  moduleDto(5, 'Exclusivo VIP', 50),
];

const PLANS = [
  plan(1, 'Gratis', [1]),
  plan(2, 'Pago', [1, 2]),
  plan(3, 'Superior', [1, 2, 3]),
];

async function seedRead(catalog = CATALOG, plans = PLANS) {
  const { storeHttpService } = await import('~/management/stores/lib/services/store-http-service');
  vi.mocked(storeHttpService.getModuleCatalog).mockResolvedValue({
    succeeded: true,
    data: catalog as unknown as Module[],
    message: '',
    actionCode: 0,
    errors: [],
  });
  vi.mocked(storeHttpService.getPlans).mockResolvedValue({
    succeeded: true,
    data: plans,
    message: '',
    actionCode: 0,
    errors: [],
  });
}

async function renderPage() {
  await seedRead();
  const { ModuleCatalogPage } = await import('../module-catalog');
  const result = render(
    <Wrapper>
      <ModuleCatalogPage />
    </Wrapper>,
  );
  // The catalog read is a promise, so the table only exists after it resolves.
  await waitFor(() => {
    expect(screen.getByTestId('module-catalog-table')).toBeInTheDocument();
  });
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACCESS — exports
// ═══════════════════════════════════════════════════════════════════════════════

describe('ModuleCatalogPage — exports', () => {
  it('exports a named clientLoader function', async () => {
    const mod = await import('../module-catalog');
    expect(typeof mod.clientLoader).toBe('function');
  });

  it('exports ModuleCatalogPage as named and default export', async () => {
    const mod = await import('../module-catalog');
    expect(typeof mod.ModuleCatalogPage).toBe('function');
    expect(typeof mod.default).toBe('function');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// T5.1 — modules grouped by plan
// ═══════════════════════════════════════════════════════════════════════════════

describe('ModuleCatalogPage — grouping by plan', () => {
  it('renders the page title', async () => {
    await renderPage();
    expect(screen.getByText(esMessages['MODULE_CATALOG.TITLE'])).toBeInTheDocument();
  });

  it('renders one group per plan plus the catch-all for unclaimed modules', async () => {
    await renderPage();
    expect(screen.getByTestId('module-catalog-group-Gratis')).toHaveTextContent(
      esMessages['STORES.PLAN.FREE_TAB'],
    );
    expect(screen.getByTestId('module-catalog-group-Pago')).toHaveTextContent(
      esMessages['STORES.PLAN.PAID_TAB'],
    );
    expect(screen.getByTestId('module-catalog-group-Superior')).toHaveTextContent(
      esMessages['STORES.PLAN.SUPERIOR_TAB'],
    );
    expect(screen.getByTestId('module-catalog-group-no-plan')).toHaveTextContent(
      esMessages['MODULE_CATALOG.NO_PLAN_GROUP'],
    );
  });

  it('places every module in exactly one group (delta partition, no duplicates)', async () => {
    await renderPage();
    /** Text of the whole group section: the heading <th> plus its module rows. */
    const group = (planType: string) =>
      screen.getByTestId(`module-catalog-group-${planType}`).closest('tbody')?.textContent ?? '';

    // Ventas is in all three plans; the LOWEST-order plan claims it, so it appears once.
    expect(group('Gratis')).toContain('Ventas');
    expect(group('Pago')).not.toContain('Ventas');
    expect(group('Superior')).not.toContain('Ventas');
    // Inventario is in Pago/Superior → Pago (the lower order) claims it.
    expect(group('Pago')).toContain('Inventario');
    expect(group('Superior')).not.toContain('Inventario');
    // Mayorista is only in Superior → Superior claims it.
    expect(group('Superior')).toContain('Mayorista');
    // Claimed by no plan at all → only the catch-all.
    expect(group('no-plan')).toContain('Almacenes');
    expect(group('no-plan')).toContain('Exclusivo VIP');
    expect(group('Gratis')).not.toContain('Almacenes');
  });

  it('renders an empty state when the catalog has no modules', async () => {
    const { storeHttpService } = await import('~/management/stores/lib/services/store-http-service');
    vi.mocked(storeHttpService.getModuleCatalog).mockResolvedValue({
      succeeded: true,
      data: [],
      message: '',
      actionCode: 0,
      errors: [],
    });
    vi.mocked(storeHttpService.getPlans).mockResolvedValue({
      succeeded: true,
      data: PLANS,
      message: '',
      actionCode: 0,
      errors: [],
    });
    const { ModuleCatalogPage } = await import('../module-catalog');
    render(
      <Wrapper>
        <ModuleCatalogPage />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('module-catalog-empty')).toHaveTextContent(
        esMessages['MODULE_CATALOG.EMPTY'],
      );
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// T5.2 — offer display: base struck through, effective price normal
// ═══════════════════════════════════════════════════════════════════════════════

describe('ModuleCatalogPage — offer display', () => {
  it('strikes the base price through and shows the effective price for a percent discount', async () => {
    await renderPage();
    // Mayorista: 30 with 10% → 27 effective.
    expect(screen.getByTestId('module-catalog-base-3')).toHaveTextContent('30');
    expect(screen.getByTestId('module-catalog-current-3')).toHaveTextContent('27');
    expect(screen.getByTestId('module-catalog-current-3').querySelector('s')).toHaveTextContent(
      '30',
    );
  });

  it('strikes the base price through for a flat discount too', async () => {
    await renderPage();
    // Almacenes: 40 with a flat 5 → 35 effective.
    expect(screen.getByTestId('module-catalog-base-4')).toHaveTextContent('40');
    expect(screen.getByTestId('module-catalog-current-4')).toHaveTextContent('35');
  });

  it('shows no strikethrough for a module with no discount', async () => {
    await renderPage();
    expect(screen.queryByTestId('module-catalog-base-1')).toBeNull();
    expect(screen.getByTestId('module-catalog-current-1')).toHaveTextContent('10');
    expect(screen.getByTestId('module-catalog-current-1').querySelector('s')).toBeNull();
  });

  it('shows the group base total struck through when any module in the group is on offer', async () => {
    await renderPage();
    // The footer prices Superior's CUMULATIVE membership — Ventas (10) + Inventario (20) +
    // Mayorista (30 - 10% = 27) = 57 of a 60 base — even though only Mayorista is RENDERED
    // in that section (the delta partition gives Ventas to Gratis and Inventario to Pago).
    expect(screen.getByTestId('module-catalog-group-base-Superior')).toHaveTextContent('60 USD');
    expect(screen.getByTestId('module-catalog-group-total-Superior')).toHaveTextContent('57 USD');
  });

  it('prices a middle plan by its cumulative membership too, not by its delta', async () => {
    await renderPage();
    // Pago carries Ventas + Inventario (10 + 20) although it RENDERS only Inventario:
    // 30 USD, and no strikethrough because neither row is discounted.
    expect(screen.queryByTestId('module-catalog-group-base-Pago')).toBeNull();
    expect(screen.getByTestId('module-catalog-group-total-Pago')).toHaveTextContent('30 USD');
  });

  it('shows no group base total for a group with no discounts at all', async () => {
    await renderPage();
    // Gratis's cumulative membership is just Ventas (10, no discount) → no offer, no strike.
    expect(screen.queryByTestId('module-catalog-group-base-Gratis')).toBeNull();
    expect(screen.getByTestId('module-catalog-group-total-Gratis')).toHaveTextContent('10 USD');
  });

  it('sums the effective prices of every module in a multi-module group', async () => {
    await renderPage();
    // The catch-all holds Almacenes (40 - 5 = 35) and Exclusivo VIP (50): 85 of a 90 base.
    expect(screen.getByTestId('module-catalog-group-base-no-plan')).toHaveTextContent('90 USD');
    expect(screen.getByTestId('module-catalog-group-total-no-plan')).toHaveTextContent('85 USD');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// T5.3 — live math while typing
// ═══════════════════════════════════════════════════════════════════════════════

describe('ModuleCatalogPage — live math', () => {
  it('recomputes the effective price and the group total on every keystroke', async () => {
    await renderPage();
    // Gratis holds only Ventas, so its group total is that module's effective price: 10 → 16.
    expect(screen.getByTestId('module-catalog-group-total-Gratis')).toHaveTextContent('10 USD');
    fireEvent.change(screen.getByTestId('module-catalog-price-1'), { target: { value: '16' } });
    expect(screen.getByTestId('module-catalog-current-1')).toHaveTextContent('16');
    expect(screen.getByTestId('module-catalog-group-total-Gratis')).toHaveTextContent('16 USD');
    // Still no offer: the group has no discount, so there is nothing to strike through.
    // Offer state tracks the DISCOUNTS, not whether base happens to differ from effective.
    expect(screen.queryByTestId('module-catalog-group-base-Gratis')).toBeNull();

    // A percent discount on top: 16 - 16*25/100 = 12, and the group total follows.
    fireEvent.change(screen.getByTestId('module-catalog-percent-1'), {
      target: { value: '25' },
    });
    expect(screen.getByTestId('module-catalog-current-1')).toHaveTextContent('12');
    expect(screen.getByTestId('module-catalog-base-1')).toHaveTextContent('16');
    expect(screen.getByTestId('module-catalog-group-total-Gratis')).toHaveTextContent('12 USD');

    // And a flat discount after the percent: 12 - 2 = 10.
    fireEvent.change(screen.getByTestId('module-catalog-discount-1'), { target: { value: '2' } });
    expect(screen.getByTestId('module-catalog-current-1')).toHaveTextContent('10');
    expect(screen.getByTestId('module-catalog-group-total-Gratis')).toHaveTextContent('10 USD');
  });

  it('recomputes a plan footer from a member module rendered in ANOTHER group', async () => {
    await renderPage();
    expect(screen.getByTestId('module-catalog-group-total-Pago')).toHaveTextContent('30 USD');
    expect(screen.getByTestId('module-catalog-group-total-Superior')).toHaveTextContent('57 USD');
    // Ventas renders under Gratis (the delta partition), yet it is a member of Pago AND
    // Superior: editing it must move all three footers, or the totals are stale snapshots.
    fireEvent.change(screen.getByTestId('module-catalog-price-1'), { target: { value: '16' } });
    expect(screen.getByTestId('module-catalog-group-total-Pago')).toHaveTextContent('36 USD');
    expect(screen.getByTestId('module-catalog-group-total-Superior')).toHaveTextContent('63 USD');
    expect(screen.getByTestId('module-catalog-group-base-Superior')).toHaveTextContent('66 USD');
  });

  it('keeps the percent-before-flat order of the shared formula when both are set', async () => {
    await renderPage();
    // Ventas 100, 10% then 5 flat: (100 - 10) - 5 = 85. Swapping the order gives the same
    // number here, so use values where it differs: 20% of 100 is 20, 20 - 10 = 10.
    fireEvent.change(screen.getByTestId('module-catalog-price-1'), { target: { value: '100' } });
    fireEvent.change(screen.getByTestId('module-catalog-percent-1'), {
      target: { value: '20' },
    });
    fireEvent.change(screen.getByTestId('module-catalog-discount-1'), { target: { value: '10' } });
    expect(currentModulePrice(100, 20, 10)).toBe(70);
    expect(screen.getByTestId('module-catalog-current-1')).toHaveTextContent('70');
  });

  it('clamps the effective price at zero when the discounts exceed the base price', async () => {
    await renderPage();
    fireEvent.change(screen.getByTestId('module-catalog-percent-1'), {
      target: { value: '100' },
    });
    fireEvent.change(screen.getByTestId('module-catalog-discount-1'), { target: { value: '50' } });
    expect(screen.getByTestId('module-catalog-current-1')).toHaveTextContent('0');
  });

  it('excludes an INACTIVE and a PRICE-INCLUDED member from the plan footer', async () => {
    // Same plan, but two of its members are excluded by the price rule the backend applies:
    // Ventas is inactive in the catalog and Inventario is a gratis (price-included) module.
    const catalog = [
      { ...moduleDto(1, 'Ventas', 10), isActive: false },
      { ...moduleDto(2, 'Inventario', 20), priceIncluded: true },
      moduleDto(3, 'Mayorista', 30, 0, 10),
    ];
    await seedRead(catalog, [plan(3, 'Superior', [1, 2, 3])]);
    const { ModuleCatalogPage } = await import('../module-catalog');
    render(
      <Wrapper>
        <ModuleCatalogPage />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('module-catalog-table')).toBeInTheDocument();
    });

    // Only Mayorista is billable: 30 - 30*10/100 = 27, and BOTH columns count that one row
    // — a base built from all three rows would strike 60 through a 27 that excludes two of them.
    expect(screen.getByTestId('module-catalog-group-base-Superior')).toHaveTextContent('30 USD');
    expect(screen.getByTestId('module-catalog-group-total-Superior')).toHaveTextContent('27 USD');
  });

  it('seeds the inputs with the catalog values and accepts every row as editable', async () => {
    await renderPage();
    expect(screen.getByTestId('module-catalog-price-3')).toHaveValue(30);
    expect(screen.getByTestId('module-catalog-percent-3')).toHaveValue(10);
    expect(screen.getByTestId('module-catalog-discount-4')).toHaveValue(5);
    expect(screen.getByTestId('module-catalog-discount-1')).not.toBeDisabled();
    expect(screen.getByTestId('module-catalog-price-5')).not.toBeDisabled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// T5.4 — save: sends the whole table, then refetches
// ═══════════════════════════════════════════════════════════════════════════════

describe('ModuleCatalogPage — save', () => {
  it('sends the whole table with the edited values and refetches after success', async () => {
    const { storeHttpService } = await import('~/management/stores/lib/services/store-http-service');
    await renderPage();
    await waitFor(() => {
      expect(storeHttpService.getModuleCatalog).toHaveBeenCalledTimes(1);
    });

    fireEvent.change(screen.getByTestId('module-catalog-price-1'), { target: { value: '16' } });
    vi.mocked(storeHttpService.updateModulePricing).mockResolvedValue({
      succeeded: true,
      data: {
        modules: CATALOG.map((m) => ({
          moduleId: m.id,
          name: m.name,
          price: m.id === 1 ? 16 : m.price,
          discountPrice: m.discountPrice,
          percentDiscountPrice: m.percentDiscountPrice,
          isActive: m.isActive,
          currentPrice: m.id === 1 ? 16 : m.currentPrice,
        })),
        totalCurrentPrice: 16 + 20 + 27 + 35 + 50,
      },
      message: '',
      actionCode: 0,
      errors: [],
    });

    fireEvent.click(screen.getByTestId('module-catalog-save'));

    await waitFor(() => {
      expect(storeHttpService.updateModulePricing).toHaveBeenCalledTimes(1);
    });
    // Every module in the table — the save is all-or-nothing, so an omitted row would
    // silently mean "leave this module untouched". Each row carries its own activation flag.
    expect(storeHttpService.updateModulePricing).toHaveBeenCalledWith([
      { moduleId: 1, price: 16, discountPrice: 0, percentDiscountPrice: 0, isActive: true },
      { moduleId: 2, price: 20, discountPrice: 0, percentDiscountPrice: 0, isActive: true },
      { moduleId: 3, price: 30, discountPrice: 0, percentDiscountPrice: 10, isActive: true },
      { moduleId: 4, price: 40, discountPrice: 5, percentDiscountPrice: 0, isActive: true },
      { moduleId: 5, price: 50, discountPrice: 0, percentDiscountPrice: 0, isActive: true },
    ]);

    // Refetched: the catalog read is the authority on what the table now shows.
    await waitFor(() => {
      expect(storeHttpService.getModuleCatalog).toHaveBeenCalledTimes(2);
    });
    expect(screen.queryByTestId('module-catalog-error')).toBeNull();
  });

  it('shows the success message after a successful save', async () => {
    const { storeHttpService } = await import('~/management/stores/lib/services/store-http-service');
    const { showToastSuccess } = await import('~/shared/lib/toast');
    await renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('module-catalog-table')).toBeInTheDocument();
    });
    vi.mocked(storeHttpService.updateModulePricing).mockResolvedValue({
      succeeded: true,
      data: { modules: [], totalCurrentPrice: 0 },
      message: '',
      actionCode: 0,
      errors: [],
    });

    fireEvent.click(screen.getByTestId('module-catalog-save'));

    await waitFor(() => {
      expect(showToastSuccess).toHaveBeenCalledWith(
        esMessages['MODULE_CATALOG.SAVE_SUCCESS'],
        esMessages['GENERAL.RESPONSE.SUCCESS_TITLE'],
      );
    });
  });

  it('ignores a second click while the save is already in-flight', async () => {
    const { storeHttpService } = await import('~/management/stores/lib/services/store-http-service');
    await renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('module-catalog-table')).toBeInTheDocument();
    });

    let resolveSave!: (v: BaseResponseModel<ModuleCatalogPricingResult>) => void;
    vi.mocked(storeHttpService.updateModulePricing).mockReturnValueOnce(
      new Promise<BaseResponseModel<ModuleCatalogPricingResult>>((resolve) => {
        resolveSave = resolve;
      }),
    );

    const save = screen.getByTestId('module-catalog-save');
    fireEvent.click(save);
    fireEvent.click(save);

    resolveSave({
      succeeded: true,
      data: { modules: [], totalCurrentPrice: 0 },
      message: null,
      actionCode: null,
      errors: [],
    });
    await waitFor(() => {
      expect(storeHttpService.updateModulePricing).toHaveBeenCalledTimes(1);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// T5.5 — save error path: message shown, edits kept
// ═══════════════════════════════════════════════════════════════════════════════

describe('ModuleCatalogPage — save error', () => {
  it('shows the error message and keeps the operator edits when the save throws', async () => {
    const { storeHttpService } = await import('~/management/stores/lib/services/store-http-service');
    await renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('module-catalog-table')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('module-catalog-price-1'), { target: { value: '16' } });
    vi.mocked(storeHttpService.updateModulePricing).mockRejectedValue(new Error('Network error'));

    fireEvent.click(screen.getByTestId('module-catalog-save'));

    await waitFor(() => {
      expect(screen.getByTestId('module-catalog-error')).toHaveTextContent(
        esMessages['MODULE_CATALOG.ERROR'],
      );
    });
    // The draft IS the state: a failed save must not wipe the table the operator just typed.
    expect(screen.getByTestId('module-catalog-price-1')).toHaveValue(16);
    expect(screen.getByTestId('module-catalog-current-1')).toHaveTextContent('16');
    // No refetch on failure — the screen keeps showing the unpersisted draft.
    expect(storeHttpService.getModuleCatalog).toHaveBeenCalledTimes(1);
  });

  it('shows the error when the response reports succeeded false, and keeps the edits', async () => {
    const { storeHttpService } = await import('~/management/stores/lib/services/store-http-service');
    await renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('module-catalog-table')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('module-catalog-discount-4'), {
      target: { value: '9' },
    });
    vi.mocked(storeHttpService.updateModulePricing).mockResolvedValue({
      succeeded: false,
      data: null,
      message: 'error',
      actionCode: 400,
      errors: [],
    });

    fireEvent.click(screen.getByTestId('module-catalog-save'));

    await waitFor(() => {
      expect(screen.getByTestId('module-catalog-error')).toHaveTextContent(
        esMessages['MODULE_CATALOG.ERROR'],
      );
    });
    expect(screen.getByTestId('module-catalog-discount-4')).toHaveValue(9);
  });

  it('shows the connectivity message when the save fails at the network layer', async () => {
    const { storeHttpService } = await import('~/management/stores/lib/services/store-http-service');
    await renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('module-catalog-table')).toBeInTheDocument();
    });

    vi.mocked(storeHttpService.updateModulePricing).mockRejectedValue({
      isNetworkError: true,
      message: 'Network Error',
    } as unknown as Error);

    fireEvent.click(screen.getByTestId('module-catalog-save'));

    await waitFor(() => {
      expect(screen.getByTestId('module-catalog-error')).toHaveTextContent(
        esMessages['GENERAL.OFFLINE'],
      );
    });
  });

  it('shows the error and an empty table when the catalog read itself fails', async () => {
    const { storeHttpService } = await import('~/management/stores/lib/services/store-http-service');
    vi.mocked(storeHttpService.getModuleCatalog).mockRejectedValue(new Error('boom'));
    vi.mocked(storeHttpService.getPlans).mockResolvedValue({
      succeeded: true,
      data: PLANS,
      message: '',
      actionCode: 0,
      errors: [],
    });
    const { ModuleCatalogPage } = await import('../module-catalog');
    render(
      <Wrapper>
        <ModuleCatalogPage />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('module-catalog-error')).toHaveTextContent(
        esMessages['MODULE_CATALOG.ERROR'],
      );
    });
    expect(screen.getByTestId('module-catalog-empty')).toBeInTheDocument();
    expect(screen.getByTestId('module-catalog-save')).toBeDisabled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// T5.6 — activation checkbox (admin-module-activation-toggle)
// ═══════════════════════════════════════════════════════════════════════════════

describe('ModuleCatalogPage — activation checkbox', () => {
  it('renders a checkbox per module, checked from the catalog isActive flag', async () => {
    const catalog = [
      moduleDto(1, 'Ventas', 10),
      { ...moduleDto(2, 'Inventario', 20), isActive: false },
    ];
    await seedRead(catalog, [plan(1, 'Gratis', [1, 2])]);
    const { ModuleCatalogPage } = await import('../module-catalog');
    render(
      <Wrapper>
        <ModuleCatalogPage />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('module-catalog-table')).toBeInTheDocument();
    });

    expect(screen.getByTestId('module-catalog-active-1')).toBeChecked();
    expect(screen.getByTestId('module-catalog-active-2')).not.toBeChecked();
  });

  it('drops an unticked module from the group total and sends isActive=false on save', async () => {
    await renderPage();
    const { storeHttpService } = await import('~/management/stores/lib/services/store-http-service');
    vi.mocked(storeHttpService.updateModulePricing).mockResolvedValue({
      succeeded: true,
      data: { modules: [], totalCurrentPrice: 0 },
      message: '',
      actionCode: 0,
      errors: [],
    });

    // Gratis holds only Ventas (10); deactivating it drops it from the price rule.
    expect(screen.getByTestId('module-catalog-group-total-Gratis')).toHaveTextContent('10 USD');
    fireEvent.click(screen.getByTestId('module-catalog-active-1'));
    expect(screen.getByTestId('module-catalog-active-1')).not.toBeChecked();
    expect(screen.getByTestId('module-catalog-group-total-Gratis')).toHaveTextContent('0 USD');

    fireEvent.click(screen.getByTestId('module-catalog-save'));
    await waitFor(() => {
      expect(storeHttpService.updateModulePricing).toHaveBeenCalledTimes(1);
    });
    const payload = vi.mocked(storeHttpService.updateModulePricing).mock.calls[0][0];
    expect(payload.find((row) => row.moduleId === 1)?.isActive).toBe(false);
    expect(payload.find((row) => row.moduleId === 2)?.isActive).toBe(true);
  });
});
