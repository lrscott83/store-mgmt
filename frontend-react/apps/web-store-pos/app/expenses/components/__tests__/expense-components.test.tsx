import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { ExpenseType, PaymentType } from '@store-mgmt/domain';
import type { Expense } from '@store-mgmt/domain';
import esMessages from '~/shared/lib/i18n/es';

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

// ─── ExpenseFormModal ────────────────────────────────────────────────────────

import { ExpenseFormModal } from '../expense-form-modal';

describe('ExpenseFormModal — total validation (Angular parity: required + min(0))', () => {
  it('allows a total of exactly 0 (Angular Validators.min(0) permits 0)', () => {
    const onSave = vi.fn();
    render(
      <Wrapper>
        <ExpenseFormModal isOpen onClose={() => {}} onSave={onSave} />
      </Wrapper>,
    );
    fireEvent.change(screen.getByLabelText('Total'), { target: { value: '0' } });
    fireEvent.click(screen.getByText('Guardar'));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].total).toBe(0);
  });

  it('blocks a negative total and shows the TOTAL_REQUIRED validation message', () => {
    const onSave = vi.fn();
    render(
      <Wrapper>
        <ExpenseFormModal isOpen onClose={() => {}} onSave={onSave} />
      </Wrapper>,
    );
    fireEvent.change(screen.getByLabelText('Total'), { target: { value: '-5' } });
    expect(screen.getByText('El total debe ser mayor a 0')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Guardar'));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('does not show the validation message for a valid (non-negative) total', () => {
    render(
      <Wrapper>
        <ExpenseFormModal isOpen onClose={() => {}} onSave={() => {}} />
      </Wrapper>,
    );
    fireEvent.change(screen.getByLabelText('Total'), { target: { value: '20' } });
    expect(screen.queryByText('El total debe ser mayor a 0')).not.toBeInTheDocument();
  });

  // Angular parity: edit-expense-modal has NO date field at all — create always uses
  // `new Date()`, update always reuses `expense.date` unchanged (never user-editable).
  it('has no editable Date field', () => {
    render(
      <Wrapper>
        <ExpenseFormModal isOpen onClose={() => {}} onSave={() => {}} />
      </Wrapper>,
    );
    expect(screen.queryByLabelText('Fecha')).not.toBeInTheDocument();
    expect(screen.queryByText('Fecha')).not.toBeInTheDocument();
  });
});

// ─── ExpenseList ─────────────────────────────────────────────────────────────

import { ExpenseList } from '../expense-list';

const MOCK_EXPENSE: Expense = {
  id: 'e1',
  type: ExpenseType.Comida,
  total: 42,
  date: new Date('2024-03-15T10:00:00.000'),
  paymentType: PaymentType.Efectivo,
  note: '',
  isActive: true,
  createdDate: new Date('2024-03-15T10:00:00.000'),
  createdByName: '',
};

describe('ExpenseList — readOnly gating (Angular parity: entry-list.component.html:22 @if (!readOnly))', () => {
  it('hides edit/delete actions when readOnly', () => {
    render(
      <Wrapper>
        <ExpenseList expenses={[MOCK_EXPENSE]} readOnly onEdit={() => {}} onDelete={() => {}} />
      </Wrapper>,
    );
    expect(screen.queryByText('Editar')).not.toBeInTheDocument();
    expect(screen.queryByText('Eliminar')).not.toBeInTheDocument();
  });

  it('shows edit/delete actions when not readOnly', () => {
    render(
      <Wrapper>
        <ExpenseList expenses={[MOCK_EXPENSE]} readOnly={false} onEdit={() => {}} onDelete={() => {}} />
      </Wrapper>,
    );
    expect(screen.getByText('Editar')).toBeInTheDocument();
    expect(screen.getByText('Eliminar')).toBeInTheDocument();
  });
});
