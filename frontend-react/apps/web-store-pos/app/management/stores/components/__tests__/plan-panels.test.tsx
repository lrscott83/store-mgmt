import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { Feature, Plan, PlanModule } from '@store-mgmt/domain';

// ─── Factories ────────────────────────────────────────────────────────────────

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

// Gratis (sin módulos), Pago (Reportes $1500 c/ 25% off), Superior (Reportes + Créditos $500)
function makeCatalog(): Plan[] {
  return [
    makePlan({ id: 1, name: 'Gratis', planType: 'Gratis', price: 0, modules: [] }),
    makePlan({
      id: 2,
      name: 'Pago',
      planType: 'Pago',
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
  readOnly: false,
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

describe('PlanPanels — PANELS-1: three panels from real membership', () => {
  it('renders Gratis, Pago and Superior panels with Σ currentPrice totals', async () => {
    await renderPanels();
    expect(screen.getByText('Gratis')).toBeInTheDocument();
    expect(screen.getByText('Pago')).toBeInTheDocument();
    expect(screen.getByText('Superior')).toBeInTheDocument();
    // Σ totals rendered in the panel headers
    expect(screen.getByText('1,500 USD')).toBeInTheDocument();
    expect(screen.getByText('2,000 USD')).toBeInTheDocument();
  });
});

describe('PlanPanels — PANELS-2: active panel expands from planType', () => {
  it('default-expands the Gratis panel (the active plan), collapsing the others', async () => {
    await renderPanels({ storePlanType: 'Gratis' });
    // Active badge marks the active plan
    expect(screen.getByText('Activo')).toBeInTheDocument();
    // Pago panel body is collapsed: its module content is hidden
    expect(screen.queryByText('Reportes')).not.toBeInTheDocument();
    // Expanding Pago reveals its lines
    fireEvent.click(screen.getByRole('button', { name: /Pago/ }));
    expect(screen.getByText('Reportes')).toBeInTheDocument();
  });
});

describe('PlanPanels — PANELS-3: only the active panel expanded on mount', () => {
  it('expands Pago only for a Pago store', async () => {
    await renderPanels({ storePlanType: 'Pago' });
    expect(screen.getByText('Reportes')).toBeInTheDocument();
    // Superior is collapsed — its Créditos line must not render
    expect(screen.queryByText('Créditos')).not.toBeInTheDocument();
  });
});

describe('PlanPanels — PANELS-4: strike-through original price when discounted', () => {
  it('shows discounted modules with the struck-through original price', async () => {
    await renderPanels({ storePlanType: 'Superior' });
    expect(screen.getByText('Créditos')).toBeInTheDocument();
    const struck = screen.getByText('2,000');
    expect(struck.className).toContain('line-through');
  });
});

describe('PlanPanels — TOOLTIP-1: "?" shows the real description', () => {
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
    // Panels still render fine without tooltip data
    expect(screen.getByText('Créditos')).toBeInTheDocument();
  });
});

describe('PlanPanels — ACTIVATE-1: per-panel immediate activation action', () => {
  it('renders "Activar ese plan" on expanded non-active panels and calls onActivate', async () => {
    const onActivate = vi.fn();
    await renderPanels({ storePlanType: 'Gratis', onActivate });
    // Active panel (Gratis) is expanded with no action; expand Pago to reach its action
    fireEvent.click(screen.getByRole('button', { name: /Pago/ }));
    const buttons = screen.getAllByRole('button', { name: 'Activar ese plan' });
    // Only the expanded panel's body shows its action; the active panel has none
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]);
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onActivate.mock.calls[0][0].planType).toBe('Pago');
    // Expanding Superior swaps the view (single-open accordion) to its action
    fireEvent.click(screen.getByRole('button', { name: /Superior/ }));
    expect(screen.getAllByRole('button', { name: 'Activar ese plan' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Activar ese plan' }));
    expect(onActivate.mock.calls[1][0].planType).toBe('Superior');
  });
});

describe('PlanPanels — ACTIVATE-2: no Guardar on picker surfaces', () => {
  it('does not render any Guardar button', async () => {
    await renderPanels();
    expect(screen.queryByRole('button', { name: /Guardar/ })).not.toBeInTheDocument();
  });
});

describe('PlanPanels — LOCK-1: DG-7 read-only lock for paid stores', () => {
  it('hides every activation action when readOnly, keeping prices visible', async () => {
    await renderPanels({ storePlanType: 'Pago', readOnly: true });
    expect(screen.queryByRole('button', { name: 'Activar ese plan' })).not.toBeInTheDocument();
    expect(screen.getByText('Reportes')).toBeInTheDocument();
    // Panel header total AND module row both price the discount — assert at least one
    expect(screen.getAllByText('1,500 USD').length).toBeGreaterThan(0);
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