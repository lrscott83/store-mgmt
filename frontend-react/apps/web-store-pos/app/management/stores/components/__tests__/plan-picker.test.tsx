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

describe('PlanPicker — PLAN-5: initial selection = active plan, no emit on mount', () => {
  it('marks the active plan as selected and does not call onChange on mount', async () => {
    const { PlanPicker } = await import('../plan-picker');
    const onChange = vi.fn();
    render(<Wrapper><PlanPicker modules={CATALOG} onChange={onChange} /></Wrapper>);
    // active = free; free tab is shown and marked selected
    expect(screen.getByText('Plan seleccionado')).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('PlanPicker — PLAN-6: activating Pago emits ALL module ids', () => {
  it('emits every module id when the paid plan is activated', async () => {
    const { PlanPicker } = await import('../plan-picker');
    const onChange = vi.fn();
    render(<Wrapper><PlanPicker modules={CATALOG} onChange={onChange} /></Wrapper>);
    fireEvent.click(screen.getByRole('tab', { name: /Pago/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Activar este plan' }));
    expect(onChange).toHaveBeenCalledWith([1, 2, 3]);
  });
});

describe('PlanPicker — PLAN-7: activating Gratis emits only free ids', () => {
  it('emits only priceIncluded ids when the free plan is activated', async () => {
    const { PlanPicker } = await import('../plan-picker');
    const onChange = vi.fn();
    // active = paid (Reportes selected) so Gratis is not the selected plan
    const modules = CATALOG.map((m) => (m.id === 2 ? { ...m, selected: true } : m));
    render(<Wrapper><PlanPicker modules={modules} onChange={onChange} /></Wrapper>);
    fireEvent.click(screen.getByRole('tab', { name: /Gratis/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Activar este plan' }));
    expect(onChange).toHaveBeenCalledWith([1]);
  });
});

describe('PlanPicker — PLAN-8: "Se activará al guardar" hint', () => {
  it('shows the hint on the selected plan when it differs from the active plan', async () => {
    const { PlanPicker } = await import('../plan-picker');
    render(<Wrapper><PlanPicker modules={CATALOG} onChange={vi.fn()} /></Wrapper>);
    // active = free; activate Pago → selected(paid) !== active(free)
    fireEvent.click(screen.getByRole('tab', { name: /Pago/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Activar este plan' }));
    expect(screen.getByText('Se activará al guardar')).toBeInTheDocument();
  });
});

describe('PlanPicker — PLAN-9: re-syncs to active plan when modules arrive async', () => {
  it('moves the Activo badge to Pago after modules load with a paid module selected', async () => {
    const { PlanPicker } = await import('../plan-picker');
    const { rerender } = render(<Wrapper><PlanPicker modules={[]} onChange={vi.fn()} /></Wrapper>);
    const loaded = CATALOG.map((m) => (m.id === 2 ? { ...m, selected: true } : m));
    rerender(<Wrapper><PlanPicker modules={loaded} onChange={vi.fn()} /></Wrapper>);
    expect(screen.getByRole('tab', { name: /Pago/ })).toHaveTextContent('Activo');
  });
});

// DG-7: readOnly hides ONLY "Activar este plan" — tabs still render, and since
// onChange is wired solely to that button (choosePlan), removing it structurally
// prevents onChange from firing on tab interaction without disabling the tabs.
describe('PlanPicker — Read-Only Lock (DG-7)', () => {
  it('readOnly=true hides "Activar este plan" and tab clicks never call onChange', async () => {
    const { PlanPicker } = await import('../plan-picker');
    const onChange = vi.fn();
    render(<Wrapper><PlanPicker modules={CATALOG} onChange={onChange} readOnly /></Wrapper>);

    // Tabs still render (readOnly does not disable browsing the plan catalog).
    expect(screen.getByRole('tab', { name: /Gratis/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Pago/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Pago/ }));
    expect(screen.getByText('Reportes')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Activar este plan' })).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('readOnly=false (default) still shows "Activar este plan" and onChange fires normally', async () => {
    const { PlanPicker } = await import('../plan-picker');
    const onChange = vi.fn();
    render(<Wrapper><PlanPicker modules={CATALOG} onChange={onChange} /></Wrapper>);
    fireEvent.click(screen.getByRole('tab', { name: /Pago/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Activar este plan' }));
    expect(onChange).toHaveBeenCalledWith([1, 2, 3]);
  });
});
