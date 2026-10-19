import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { PlanPricingSection } from '../plan-pricing-section';

/**
 * "Precios" section of the public landing (owner request 2026-10-15): a ledger, one row per plan,
 * the suggested plan (Pago) open by default. Same shape as the store plan-change view — a paid
 * plan lists ONLY the modules it adds, under the "Incluye todo lo del plan X y además:" line —
 * and every price is shown as `X.XX USD`.
 *
 * The endpoint returns each plan's CUMULATIVE module list; the section derives the delta. The
 * component reads through `fetch`, so this stubs the global fetch: the real request path runs,
 * only the network is fake.
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
    modules: [
      { moduleId: 7, name: 'Gestión', basePrice: 0, currentPrice: 0 },
      { moduleId: 6, name: 'Estadísticas', basePrice: 2, currentPrice: 1 },
      { moduleId: 8, name: 'Gastos', basePrice: 2, currentPrice: 2 },
      { moduleId: 13, name: 'Almacenes', basePrice: 5, currentPrice: 2.5 },
    ],
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

  it('renders one row per plan and opens the suggested plan by default', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse(PLANS));

    render(<PlanPricingSection />);

    await screen.findByTestId('plan-pricing-toggle-Pago');
    expect(screen.getByTestId('plan-pricing-toggle-Gratis')).toBeInTheDocument();
    expect(screen.getByTestId('plan-pricing-toggle-Superior')).toBeInTheDocument();

    expect(screen.getByTestId('plan-pricing-recommended-Pago')).toBeInTheDocument();
    expect(screen.getByTestId('plan-pricing-body-Pago')).toBeInTheDocument();
    expect(screen.queryByTestId('plan-pricing-body-Gratis')).toBeNull();
    expect(screen.queryByTestId('plan-pricing-body-Superior')).toBeNull();
  });

  it('a paid plan lists ONLY the modules it adds, under the includes-previous line', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse(PLANS));

    render(<PlanPricingSection />);
    const pago = await screen.findByTestId('plan-pricing-body-Pago');

    expect(
      within(pago).getByText('Incluye todo lo del plan Gratis y además:'),
    ).toBeInTheDocument();
    // The deltas of Pago: its own modules, never the ones Gratis already covers.
    expect(within(pago).getByTestId('plan-pricing-module-Pago-6')).toBeInTheDocument();
    expect(within(pago).getByTestId('plan-pricing-module-Pago-8')).toBeInTheDocument();
    expect(within(pago).queryByTestId('plan-pricing-module-Pago-7')).toBeNull();

    fireEvent.click(screen.getByTestId('plan-pricing-toggle-Superior'));
    const superior = screen.getByTestId('plan-pricing-body-Superior');
    expect(
      within(superior).getByText('Incluye todo lo del plan de Pago y además:'),
    ).toBeInTheDocument();
    expect(within(superior).getByTestId('plan-pricing-module-Superior-13')).toBeInTheDocument();
    expect(within(superior).queryByTestId('plan-pricing-module-Superior-6')).toBeNull();
  });

  it('Gratis lists its modules and carries no includes-previous line', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse(PLANS));

    render(<PlanPricingSection />);
    await screen.findByTestId('plan-pricing-toggle-Gratis');
    fireEvent.click(screen.getByTestId('plan-pricing-toggle-Gratis'));

    const gratis = screen.getByTestId('plan-pricing-body-Gratis');
    expect(within(gratis).getByTestId('plan-pricing-module-Gratis-7')).toBeInTheDocument();
    expect(within(gratis).queryByText(/Incluye todo lo del plan/)).toBeNull();
  });

  it('shows every price as X.XX USD, with the original struck when discounted', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse(PLANS));

    render(<PlanPricingSection />);
    await screen.findByTestId('plan-pricing-body-Pago');

    const total = screen.getByTestId('plan-pricing-total-Pago');
    expect(within(total).getByText('5.00 USD')).toBeInTheDocument();
    expect(within(total).getByText('10.00 USD')).toBeInTheDocument();

    const flat = screen.getByTestId('plan-pricing-module-Pago-8');
    expect(within(flat).getByText('2.00 USD')).toBeInTheDocument();

    // El importe no lleva `$`: el sufijo es ` USD`.
    expect(screen.queryByText(/\$/)).toBeNull();
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

    expect(screen.getByTestId('plan-pricing-section')).toBeInTheDocument();
    await screen.findByText('Planes claros');
    expect(screen.queryByTestId('plan-pricing-toggle-Pago')).toBeNull();
  });
});
