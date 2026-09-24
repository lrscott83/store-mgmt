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
    const row = container.querySelector('[data-testid="expense-row-exp-1"]') as HTMLElement;
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
        <ExpenseList
          expenses={[makeExpense({ total: 2000 })]}
          readOnly
          onEdit={vi.fn()}
          onDelete={vi.fn()}
        />
      </Wrapper>,
    );
    expect(screen.getByText('2 000 CUP')).toBeInTheDocument();
  });
});

// Layout 3 columnas (petición del owner): motivo alineado a la IZQUIERDA,
// modo de pago en el CENTRO (alineado a la izquierda dentro de su columna) y
// precio alineado a la DERECHA — estructura, no texto.
describe('ExpenseList — row layout (motivo izq / pago centro / precio der)', () => {
  it('renders a 3-column grid: reason | payment | price', () => {
    const { container } = render(
      <Wrapper>
        <ExpenseList expenses={[makeExpense()]} readOnly onEdit={vi.fn()} onDelete={vi.fn()} />
      </Wrapper>,
    );
    const row = container.querySelector('[data-testid="expense-row-exp-1"]') as HTMLElement;
    expect(row).not.toBeNull();
    expect(row.className).toContain('grid');
    expect(row.className).toContain('grid-cols-3');
  });

  it('aligns the reason left, the payment center-left and the price right', () => {
    render(
      <Wrapper>
        <ExpenseList expenses={[makeExpense()]} readOnly onEdit={vi.fn()} onDelete={vi.fn()} />
      </Wrapper>,
    );
    const row = screen.getByTestId('expense-row-exp-1');
    const reason = screen.getByText('Salario');
    const payment = screen.getByText('Efectivo');
    const price = screen.getByText('2 000 CUP');

    expect(reason.className).toMatch(/text-left/);
    expect(payment.className).toMatch(/text-left/);
    expect(price.className).toMatch(/text-right/);

    // Orden visual dentro de la fila: motivo → pago → precio.
    const order = [reason, payment, price].map((el) => row.compareDocumentPosition(el));
    expect(order[0] & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(order[1] & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps the row compact (p-2) and the actions gear outside the grid', () => {
    const { container } = render(
      <Wrapper>
        <ExpenseList
          expenses={[makeExpense()]}
          readOnly={false}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
        />
      </Wrapper>,
    );
    const row = container.querySelector('[data-testid="expense-row-exp-1"]') as HTMLElement;
    expect(row.className).toMatch(/\bp-2\b/);
    // El gear vive FUERA de la fila de 3 columnas (no desplaza las columnas).
    expect(row.querySelector('[data-testid="expense-actions-toggle-exp-1"]')).toBeNull();
    expect(
      container.querySelector('[data-testid="expense-actions-toggle-exp-1"]'),
    ).not.toBeNull();
  });
});
