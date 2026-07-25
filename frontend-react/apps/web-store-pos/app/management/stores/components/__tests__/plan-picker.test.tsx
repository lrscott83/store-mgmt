import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { Module } from '@store-mgmt/domain';

function makeModule(overrides: Partial<Module> = {}): Module {
  return {
    id: 1,
    name: 'Module A',
    price: 10,
    currentPrice: 8,
    priceIncluded: false,
    discountText: '',
    selected: false,
    ...overrides,
  };
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

// free: Ventas(1). paid: Reportes(2, $1500), Créditos(3, $500) => total $2000
const CATALOG: Module[] = [
  makeModule({ id: 1, name: 'Ventas', priceIncluded: true, currentPrice: 0 }),
  makeModule({ id: 2, name: 'Reportes', priceIncluded: false, currentPrice: 1500 }),
  makeModule({ id: 3, name: 'Créditos', priceIncluded: false, currentPrice: 500 }),
];

describe('PlanPicker — PLAN-1: section title + billing notice', () => {
  it('renders the section title and the verbatim billing notice', async () => {
    const { PlanPicker } = await import('../plan-picker');
    render(<Wrapper><PlanPicker modules={CATALOG} onChange={vi.fn()} /></Wrapper>);
    expect(screen.getByText('Plan de la tienda')).toBeInTheDocument();
    expect(
      screen.getByText('Plan Pago: 1 mes GRATIS. Luego se cobra por mes vencido → el primer pago después del segundo mes.')
    ).toBeInTheDocument();
  });
});

describe('PlanPicker — PLAN-2: paid tab label shows the summed total', () => {
  it('shows "Pago" with the sum of paid currentPrice formatted as USD', async () => {
    const { PlanPicker } = await import('../plan-picker');
    render(<Wrapper><PlanPicker modules={CATALOG} onChange={vi.fn()} /></Wrapper>);
    expect(screen.getByRole('tab', { name: /Pago/ })).toHaveTextContent('$2,000.00');
  });
});

describe('PlanPicker — PLAN-3: module lists per tab (no prices)', () => {
  it('free tab lists free modules; paid tab lists paid modules after switching', async () => {
    const { PlanPicker } = await import('../plan-picker');
    render(<Wrapper><PlanPicker modules={CATALOG} onChange={vi.fn()} /></Wrapper>);
    // default tab = active plan = free (no paid selected)
    expect(screen.getByText('Ventas')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /Pago/ }));
    expect(screen.getByText('Reportes')).toBeInTheDocument();
    expect(screen.getByText('Créditos')).toBeInTheDocument();
  });
});

describe('PlanPicker — PLAN-4: active badge', () => {
  it('shows Activo on the Gratis tab when no paid module is selected', async () => {
    const { PlanPicker } = await import('../plan-picker');
    render(<Wrapper><PlanPicker modules={CATALOG} onChange={vi.fn()} /></Wrapper>);
    expect(screen.getByRole('tab', { name: /Gratis/ })).toHaveTextContent('Activo');
  });

  it('shows Activo on the Pago tab when a paid module is selected', async () => {
    const { PlanPicker } = await import('../plan-picker');
    const modules = CATALOG.map((m) => (m.id === 2 ? { ...m, selected: true } : m));
    render(<Wrapper><PlanPicker modules={modules} onChange={vi.fn()} /></Wrapper>);
    expect(screen.getByRole('tab', { name: /Pago/ })).toHaveTextContent('Activo');
  });
});
