import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { Feature, Plan, PlanModule } from '@store-mgmt/domain';

// ─── Factories (owner-plan-change matrix) ────────────────────────────────────

function makePlanModule(overrides: Partial<PlanModule> = {}): PlanModule {
  return {
    moduleId: 1,
    name: 'Ventas',
    order: 1,
    priceIncluded: true,
    price: 100,
    currentPrice: 100,
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

function makeCatalog(): Plan[] {
  return [
    makePlan({ id: 1, name: 'Gratis', planType: 'Gratis', order: 1, price: 0, modules: [] }),
    makePlan({
      id: 2,
      name: 'Pago',
      planType: 'Pago',
      order: 2,
      price: 1500,
      modules: [
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

// ─── owner-plan-change: dialog UI matrix (T6.1) ──────────────────────────────

describe('PlanPanels — ROWS-1: module rows are name+"?" only', () => {
  it('renders the module name with no per-row price, strike, or discount text', async () => {
    await renderPanels({ storePlanType: 'Superior' });
    expect(screen.getByText('Reportes')).toBeInTheDocument();
    // Module rows carry NO price: no discount text and no per-row "USD" total.
    // (The 1,500 USD header total is the Pago panel header — legitimate, asserted
    // in ROWS-2; "500 USD" as a row total is the old per-row pricing, now gone.)
    expect(screen.queryByText('- 25%')).not.toBeInTheDocument();
    expect(screen.queryByText('500 USD')).not.toBeInTheDocument();
  });
});

describe('PlanPanels — ROWS-2: header keeps plan total, strike carried to header', () => {
  it('shows the struck-through original total beside the current total in the header', async () => {
    await renderPanels({ storePlanType: 'Gratis' });
    // Pago header: strike 2,000 → current 1,500 USD (discount lifted to the header)
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
    fireEvent.click(screen.getByRole('button', { name: /Pago/ }));
    const buttons = screen.getAllByRole('button', { name: 'Activar Plan' });
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]);
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onActivate.mock.calls[0][0].planType).toBe('Pago');
    fireEvent.click(screen.getByRole('button', { name: /Superior/ }));
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

describe('PlanPanels — NOLOCK-1: readOnly prop removed (owner can change any plan)', () => {
  it('exposes the activation action even for a paid (non-Gratis) storePlanType', async () => {
    const onActivate = vi.fn();
    await renderPanels({ storePlanType: 'Pago', onActivate });
    // The Pago panel is expanded (active) — Superior carries the action
    fireEvent.click(screen.getByRole('button', { name: /Superior/ }));
    expect(screen.getAllByRole('button', { name: 'Activar Plan' })).toHaveLength(1);
    // The active plan itself never carries an action (Pago is active: only one button exists)
    expect(screen.getAllByRole('button', { name: 'Activar Plan' })).toHaveLength(1);
  });
});

describe('PlanPanels — COPY-1: INCLUDES_PREVIOUS_PLAN for paid targets', () => {
  it('renders "Incluye todo lo del plan {plan_anterior} y además:" on non-active paid panels', async () => {
    await renderPanels({ storePlanType: 'Gratis' });
    fireEvent.click(screen.getByRole('button', { name: /Pago/ }));
    // previous plan = the store's current plan (Gratis)
    expect(
      screen.getByText('Incluye todo lo del plan Gratis y además:'),
    ).toBeInTheDocument();
  });

  it('uses the store’s current plan as plan_anterior (not the catalog predecessor)', async () => {
    await renderPanels({ storePlanType: 'Pago' });
    fireEvent.click(screen.getByRole('button', { name: /Superior/ }));
    expect(
      screen.getByText('Incluye todo lo del plan Pago y además:'),
    ).toBeInTheDocument();
  });
});

describe('PlanPanels — COPY-2: INCLUDES for the Gratis panel', () => {
  it('renders "Incluye:" on the Gratis panel body', async () => {
    await renderPanels({ storePlanType: 'Gratis' });
    expect(screen.getByText('Incluye:')).toBeInTheDocument();
  });
});

describe('PlanPanels — COPY-3: no cross-copy leakage between panels', () => {
  it('never renders INCLUDES_PREVIOUS_PLAN on the active panel body', async () => {
    await renderPanels({ storePlanType: 'Pago' });
    // Pago (active, expanded) shows the plain "Incluye:" — it is not an upgrade target
    expect(screen.getByText('Incluye:')).toBeInTheDocument();
    expect(screen.queryByText(/Incluye todo lo del plan/)).not.toBeInTheDocument();
  });
});

describe('PlanPanels — TOOLTIP-1: "?" h-6 w-6 green help icon', () => {
  it('sizes the help icon h-6 w-6 and colors it green', async () => {
    await renderPanels({ storePlanType: 'Superior' });
    const help = screen.getByRole('button', { name: '?' });
    expect(help.className).toContain('h-6');
    expect(help.className).toContain('w-6');
    // Green family (the panel renders a green help icon per the dialog design)
    expect(help.className).toMatch(/green/);
  });

  it('reveals the module feature description on demand', async () => {
    await renderPanels({ storePlanType: 'Superior' });
    fireEvent.click(screen.getByRole('button', { name: '?' }));
    expect(screen.getByText('Genera reportes de ventas')).toBeInTheDocument();
  });
});

describe('PlanPanels — TOOLTIP-2: tooltips suppressed when features unavailable', () => {
  it('hides the "?" affordances when no feature data is provided', async () => {
    await renderPanels({ storePlanType: 'Superior', featuresByModuleId: new Map() });
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
