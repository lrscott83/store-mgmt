import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { Expense } from '@store-mgmt/domain';
import { ExpenseType, PaymentType } from '@store-mgmt/domain';
import { ExpenseList } from '../expense-list';

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'exp-1',
    type: ExpenseType.Salario,
    total: 2000,
    date: new Date('2025-01-01'),
    paymentType: PaymentType.Efectivo,
    note: '',
    isActive: true,
    createdDate: new Date('2025-01-01'),
    createdByName: 'test',
    ...overrides,
  };
}

describe('ExpenseList — list/table parity sweep (WU4)', () => {
  it('renders rows without an outer border/rounded wrapper', () => {
    const { container } = render(
      <Wrapper>
        <ExpenseList expenses={[makeExpense()]} readOnly onEdit={vi.fn()} onDelete={vi.fn()} />
      </Wrapper>,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).not.toMatch(/\bborder\b/);
    expect(wrapper.className).not.toMatch(/\brounded\b/);
    expect(wrapper.className).not.toMatch(/divide-y/);
  });

  it('renders compact row cell padding', () => {
    const { container } = render(
      <Wrapper>
        <ExpenseList expenses={[makeExpense()]} readOnly onEdit={vi.fn()} onDelete={vi.fn()} />
      </Wrapper>,
    );
    const row = container.querySelector('[class*="items-center"][class*="justify-between"]') as HTMLElement;
    expect(row.className).toMatch(/\bp-2\b/);
    expect(row.className).not.toMatch(/px-4 py-3/);
  });

  it('does not render a PaymentMethodIcon SVG', () => {
    const { container } = render(
      <Wrapper>
        <ExpenseList expenses={[makeExpense()]} readOnly onEdit={vi.fn()} onDelete={vi.fn()} />
      </Wrapper>,
    );
    expect(container.querySelector('svg')).toBeNull();
  });

  it('renders expense type and payment method as plain text, not a chip', () => {
    render(
      <Wrapper>
        <ExpenseList expenses={[makeExpense()]} readOnly onEdit={vi.fn()} onDelete={vi.fn()} />
      </Wrapper>,
    );
    const typeText = screen.getByText('Salario');
    const paymentText = screen.getByText('Efectivo');
    expect(typeText.className).not.toMatch(/rounded-full/);
    expect(paymentText.className).not.toMatch(/rounded-full/);
    expect(paymentText.className).toMatch(/font-semibold/);
    expect(paymentText.className).toMatch(/text-success/);
  });

  it('formats the amount with thousands separator via formatCurrency', () => {
    render(
      <Wrapper>
        <ExpenseList expenses={[makeExpense({ total: 2000 })]} readOnly onEdit={vi.fn()} onDelete={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByText('$2,000.00')).toBeInTheDocument();
  });
});
