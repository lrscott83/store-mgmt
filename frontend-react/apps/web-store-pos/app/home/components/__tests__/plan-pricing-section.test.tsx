import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { PlanPricingSection } from '../plan-pricing-section';

/**
 * "Precios" section of the public landing (owner request 2026-10-15): one accordion card per plan,
 * the suggested plan (Pago) open by default, each module with its effective price and — when it
 * has a discount — the original struck beside it.
 *
 * The component reads the public endpoint through `fetch`, so this stubs the global fetch: it
 * exercises the real request path, only the network is fake.
 */

const PLANS = [
  {
    planType: 'Gratis',
    name: 'Gratis',
    order: 1,
    basePrice: 0,
    currentPrice: 0,
    modules: [{ moduleId: 7, name: 'Gestión', basePrice: 0, currentPrice: 0 }],
  },
  {
    planType: 'Pago',
    name: 'Pago',
    order: 2,
    basePrice: 10,
    currentPrice: 5,
    modules: [
      { moduleId: 7, name: 'Gestión', basePrice: 0, currentPrice: 0 },
      { moduleId: 6, name: 'Estadísticas', basePrice: 2, currentPrice: 1 },
      { moduleId: 8, name: 'Gastos', basePrice: 2, currentPrice: 2 },
    ],
  },
  {
    planType: 'Superior',
    name: 'Superior',
    order: 3,
    basePrice: 20,
    currentPrice: 10,
    modules: [{ moduleId: 13, name: 'Almacenes', basePrice: 5, currentPrice: 2.5 }],
  },
];

function okResponse(data: unknown): Response {
  return { ok: true, status: 200, json: async () => ({ data }) } as unknown as Response;
}

describe('PlanPricingSection', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders one accordion card per plan and opens the suggested plan by default', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse(PLANS));

    render(<PlanPricingSection />);

    await screen.findByTestId('plan-pricing-toggle-Pago');
    expect(screen.getByTestId('plan-pricing-toggle-Gratis')).toBeInTheDocument();
    expect(screen.getByTestId('plan-pricing-toggle-Superior')).toBeInTheDocument();

    // Pago is suggested and starts open; the others are collapsed.
    expect(screen.getByTestId('plan-pricing-recommended-Pago')).toBeInTheDocument();
    expect(screen.getByTestId('plan-pricing-body-Pago')).toBeInTheDocument();
    expect(screen.queryByTestId('plan-pricing-body-Gratis')).toBeNull();
    expect(screen.queryByTestId('plan-pricing-body-Superior')).toBeNull();
  });

  it('shows each module with its effective price, and the original struck when discounted', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse(PLANS));

    render(<PlanPricingSection />);
    await screen.findByTestId('plan-pricing-body-Pago');

    const discounted = screen.getByTestId('plan-pricing-module-Pago-6');
    expect(within(discounted).getByText('Estadísticas')).toBeInTheDocument();
    expect(within(discounted).getByText('$1')).toBeInTheDocument();
    expect(within(discounted).getByText('$2')).toBeInTheDocument();

    // A module with no discount shows a single price.
    const flat = screen.getByTestId('plan-pricing-module-Pago-8');
    expect(within(flat).getByText('$2')).toBeInTheDocument();

    // An included module is shown at 0.
    const included = screen.getByTestId('plan-pricing-module-Pago-7');
    expect(within(included).getByText('$0')).toBeInTheDocument();

    // The plan total carries the original struck when discounted.
    const total = screen.getByTestId('plan-pricing-total-Pago');
    expect(within(total).getByText('$5')).toBeInTheDocument();
    expect(within(total).getByText('$10')).toBeInTheDocument();
  });

  it('mentions the USD price at the day rate of the bank', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse(PLANS));

    render(<PlanPricingSection />);
    await screen.findByTestId('plan-pricing-toggle-Pago');

    expect(
      screen.getByText('Precios en USD, al cambio del día según la tasa del banco.'),
    ).toBeInTheDocument();
  });

  it('toggling a plan opens it and collapses the previous one', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse(PLANS));

    render(<PlanPricingSection />);
    await screen.findByTestId('plan-pricing-toggle-Pago');

    fireEvent.click(screen.getByTestId('plan-pricing-toggle-Superior'));

    expect(screen.getByTestId('plan-pricing-body-Superior')).toBeInTheDocument();
    expect(screen.queryByTestId('plan-pricing-body-Pago')).toBeNull();
  });

  it('renders the section without crashing when the endpoint fails', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('offline'));

    render(<PlanPricingSection />);

    // The anchor still exists (the nav links to it) and no price rows are rendered.
    expect(screen.getByTestId('plan-pricing-section')).toBeInTheDocument();
    await screen.findByText('Planes claros');
    expect(screen.queryByTestId('plan-pricing-toggle-Pago')).toBeNull();
  });
});
