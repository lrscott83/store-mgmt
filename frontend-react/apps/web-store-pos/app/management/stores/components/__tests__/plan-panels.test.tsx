import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { Feature, Plan, PlanModule } from '@store-mgmt/domain';

// ─── Factories — CUMULATIVE catalog (the real GET /v1/plans shape) ───────────

function makePlanModule(overrides: Partial<PlanModule> = {}): PlanModule {
  return {
    moduleId: 1,
    name: 'Ventas',
    order: 1,
    priceIncluded: true,
    price: 0,
    currentPrice: 0,
    discountPrice: 0,
    percentDiscountPrice: 0,
    discountText: '',
    featureDescriptions: [],
    ...overrides,
  };
}

function makePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: 1,
    name: 'Gratis',
    order: 1,
    planType: 'Gratis',
    price: 0,
    modules: [],
    ...overrides,
  };
}

/**
 * Real cumulative catalog shape: each plan lists the modules of the previous
 * plan PLUS its own additions — Gratis [Ventas], Pago [Ventas, Reportes],
 * Superior [Ventas, Reportes, Créditos]. The DELTA suites below pin that the
 * panels filter out the predecessor's modules.
 */
function makeCatalog(): Plan[] {
  return [
    makePlan({
      id: 1,
      name: 'Gratis',
      planType: 'Gratis',
      order: 1,
      price: 0,
      modules: [makePlanModule({ moduleId: 1, name: 'Ventas', order: 1 })],
    }),
    makePlan({
      id: 2,
      name: 'Pago',
      planType: 'Pago',
      order: 2,
      price: 1500,
      modules: [
        makePlanModule({ moduleId: 1, name: 'Ventas', order: 1 }),
        makePlanModule({
          moduleId: 2,
          name: 'Reportes',
          order: 2,
          priceIncluded: false,
          price: 2000,
          currentPrice: 1500,
          discountText: '- 25%',
        }),
      ],
    }),
    makePlan({
      id: 3,
      name: 'Superior',
      planType: 'Superior',
      order: 3,
      price: 2000,
      modules: [
        makePlanModule({ moduleId: 1, name: 'Ventas', order: 1 }),
        makePlanModule({
          moduleId: 2,
          name: 'Reportes',
          order: 2,
          priceIncluded: false,
          price: 2000,
          currentPrice: 1500,
          discountText: '- 25%',
        }),
        makePlanModule({
          moduleId: 3,
          name: 'Créditos',
          order: 3,
          priceIncluded: false,
          price: 500,
          currentPrice: 500,
        }),
      ],
    }),
  ];
}

const FEATURES: ReadonlyMap<number, Feature[]> = new Map([
  [
    2,
    [
      {
        id: 20,
        name: 'reportes',
        moduleId: 2,
        displayName: 'Reportes',
        description: 'Genera reportes de ventas',
        order: 1,
        availableToStore: true,
      },
    ],
  ],
]);

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

const defaultProps = () => ({
  plans: makeCatalog(),
  storePlanType: 'Gratis',
  featuresByModuleId: FEATURES,
  activationError: null as string | null,
  onActivate: vi.fn(),
});

type TestProps = ReturnType<typeof defaultProps>;

async function renderPanels(props: Partial<TestProps> = {}) {
  const { PlanPanels } = await import('../plan-panels');
  const merged = { ...defaultProps(), ...props };
  render(
    <Wrapper>
      <PlanPanels {...merged} />
    </Wrapper>,
  );
  return merged;
}

/** Opens a plan panel by its header name (the collapsible <button>). */
async function expand(planName: string) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(planName) }));
}

// ─── DELTA-1: paid panels list ONLY additional modules ───────────────────────

describe('PlanPanels — DELTA-1: paid panels list only additional modules', () => {
  it('Pago panel shows Reportes and NOT the Gratis module (Ventas)', async () => {
    await renderPanels({ storePlanType: 'Gratis' });
    await expand('Pago');
    expect(screen.getByText('Reportes')).toBeInTheDocument();
    expect(screen.queryByText('Ventas')).not.toBeInTheDocument();
  });

  it('Superior panel shows Créditos and NOT Gratis/Pago modules (Ventas, Reportes)', async () => {
    await renderPanels({ storePlanType: 'Gratis' });
    await expand('Superior');
    expect(screen.getByText('Créditos')).toBeInTheDocument();
    expect(screen.queryByText('Ventas')).not.toBeInTheDocument();
    expect(screen.queryByText('Reportes')).not.toBeInTheDocument();
  });

  it('applies the same filtering on the ACTIVE paid panel (not just upgrade targets)', async () => {
    await renderPanels({ storePlanType: 'Pago' });
    // Pago is active and expanded by default — its body lists only Reportes
    expect(screen.getByText('Reportes')).toBeInTheDocument();
    expect(screen.queryByText('Ventas')).not.toBeInTheDocument();
  });

  it('Gratis panel (no predecessor) still lists all its modules', async () => {
    // storePlanType 'Gratis' → the Gratis panel starts expanded (no click needed)
    await renderPanels({ storePlanType: 'Gratis' });
    expect(screen.getByText('Ventas')).toBeInTheDocument();
  });

  it('keeps the header total as the Σ of ALL plan modules (discount lifted to header)', async () => {
    await renderPanels({ storePlanType: 'Gratis' });
    // Pago header: strike 2,000 → current 1,500 USD (full cumulative totals,
    // unaffected by the delta list below the copy)
    const struck = screen.getByText('2,000');
    expect(struck.className).toContain('line-through');
    expect(screen.getByText('1,500 USD')).toBeInTheDocument();
  });
});

// ─── DELTA-2: cumulative copy on every paid panel ────────────────────────────

describe('PlanPanels — DELTA-2: INCLUDES_PREVIOUS_PLAN on every paid panel', () => {
  it('paid non-active panel names the catalog predecessor (Pago → Gratis)', async () => {
    await renderPanels({ storePlanType: 'Gratis' });
    await expand('Pago');
    expect(
      screen.getByText('Incluye todo lo del plan Gratis y además:'),
    ).toBeInTheDocument();
  });

  it('paid ACTIVE panel names the catalog predecessor too (not the plain Incluye:)', async () => {
    await renderPanels({ storePlanType: 'Pago' });
    // Pago active+expanded: the cumulative copy replaces the old plain "Incluye:"
    expect(
      screen.getByText('Incluye todo lo del plan Gratis y además:'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Incluye:$/)).not.toBeInTheDocument();
  });

  it('Superior panel names Pago as predecessor', async () => {
    await renderPanels({ storePlanType: 'Pago' });
    await expand('Superior');
    expect(
      screen.getByText('Incluye todo lo del plan Pago y además:'),
    ).toBeInTheDocument();
  });

  it('Gratis panel keeps the plain Incluye: (no predecessor)', async () => {
    // storePlanType 'Gratis' → the Gratis panel starts expanded (no click needed)
    await renderPanels({ storePlanType: 'Gratis' });
    expect(screen.getByText('Incluye:')).toBeInTheDocument();
  });
});

// ─── Existing contracts preserved (rows, badge, activation, tooltips) ────────

describe('PlanPanels — ROWS-2: header keeps plan total, strike carried to header', () => {
  it('shows the struck-through original total beside the current total in the header', async () => {
    await renderPanels({ storePlanType: 'Gratis' });
    const struck = screen.getByText('2,000');
    expect(struck.className).toContain('line-through');
    expect(screen.getByText('1,500 USD')).toBeInTheDocument();
  });
});

describe('PlanPanels — HEADER-3: active badge stays on the active plan', () => {
  it('marks the active panel with the Activo badge', async () => {
    await renderPanels({ storePlanType: 'Pago' });
    expect(screen.getByText('Activo')).toBeInTheDocument();
  });
});

describe('PlanPanels — ACTIVATE-1: "Activar Plan" per-panel immediate action', () => {
  it('renders "Activar Plan" on expanded non-active panels and calls onActivate', async () => {
    const onActivate = vi.fn();
    await renderPanels({ storePlanType: 'Gratis', onActivate });
    await expand('Pago');
    const buttons = screen.getAllByRole('button', { name: 'Activar Plan' });
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]);
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onActivate.mock.calls[0][0].planType).toBe('Pago');
    await expand('Superior');
    expect(screen.getAllByRole('button', { name: 'Activar Plan' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Activar Plan' }));
    expect(onActivate.mock.calls[1][0].planType).toBe('Superior');
  });
});

describe('PlanPanels — ACTIVATE-2: no action on the active panel', () => {
  it('never renders an activation action for the store’s current plan', async () => {
    await renderPanels({ storePlanType: 'Pago' });
    expect(screen.queryByRole('button', { name: 'Activar Plan' })).not.toBeInTheDocument();
  });
});

describe('PlanPanels — TOOLTIP-1: "?" h-6 w-6 green help icon', () => {
  it('sizes the help icon h-6 w-6 and colors it green', async () => {
    // Pago starts expanded (storePlanType 'Pago') and its delta module
    // (Reportes, id 2) is the one carrying feature data in the map.
    await renderPanels({ storePlanType: 'Pago' });
    const help = screen.getByRole('button', { name: '?' });
    expect(help.className).toContain('h-6');
    expect(help.className).toContain('w-6');
    // Green family (the panel renders a green help icon per the dialog design)
    expect(help.className).toMatch(/green/);
  });

  it('reveals the module feature description on demand', async () => {
    await renderPanels({ storePlanType: 'Pago' });
    fireEvent.click(screen.getByRole('button', { name: '?' }));
    expect(screen.getByText('Genera reportes de ventas')).toBeInTheDocument();
  });
});

describe('PlanPanels — TOOLTIP-2: tooltips suppressed when features unavailable', () => {
  it('hides the "?" affordances when no feature data is provided', async () => {
    // Pago expanded by default; its delta module (Reportes) has no features
    // in an empty map — no "?" affordance anywhere.
    await renderPanels({ storePlanType: 'Pago', featuresByModuleId: new Map() });
    expect(screen.queryByRole('button', { name: '?' })).not.toBeInTheDocument();
  });
});

describe('PlanPanels — ACTIVATE-3: activation error surfaces inline', () => {
  it('renders the inline error when activationError is provided', async () => {
    await renderPanels({
      storePlanType: 'Gratis',
      activationError: 'No se pudo activar el plan',
    });
    expect(screen.getByText('No se pudo activar el plan')).toBeInTheDocument();
  });
});
