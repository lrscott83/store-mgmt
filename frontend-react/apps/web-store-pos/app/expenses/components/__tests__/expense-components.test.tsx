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
    fireEvent.click(screen.getByText('Salvar'));
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
    fireEvent.click(screen.getByText('Salvar'));
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

  // Angular's EXPENSE.EDIT_EXPENSE has a source typo ('Editar Gatos'). Per policy #511
  // (Angular bugs are FIXED in React, not replicated) it is corrected to 'Editar Gastos'.
  it('shows the corrected edit-mode title (not the Angular "Gatos" typo)', () => {
    render(
      <Wrapper>
        <ExpenseFormModal
          isOpen
          onClose={() => {}}
          onSave={() => {}}
          expense={{
            id: 'e1',
            type: ExpenseType.Comida,
            total: 10,
            date: new Date('2024-03-15T10:00:00.000'),
            paymentType: PaymentType.Efectivo,
            note: '',
            isActive: true,
            createdDate: new Date('2024-03-15T10:00:00.000'),
            createdByName: '',
          }}
        />
      </Wrapper>,
    );
    expect(screen.getByText('Editar Gastos')).toBeInTheDocument();
    expect(screen.queryByText('Editar Gatos')).not.toBeInTheDocument();
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
  it('hides the actions gear entirely when readOnly', () => {
    render(
      <Wrapper>
        <ExpenseList expenses={[MOCK_EXPENSE]} readOnly onEdit={() => {}} onDelete={() => {}} />
      </Wrapper>,
    );
    expect(screen.queryByTestId('expense-actions-toggle-e1')).not.toBeInTheDocument();
    expect(screen.queryByText('Editar')).not.toBeInTheDocument();
    expect(screen.queryByText('Eliminar')).not.toBeInTheDocument();
  });

  it('shows edit/delete actions (via the gear menu) when not readOnly', () => {
    render(
      <Wrapper>
        <ExpenseList expenses={[MOCK_EXPENSE]} readOnly={false} onEdit={() => {}} onDelete={() => {}} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId('expense-actions-toggle-e1'));
    expect(screen.getByText('Editar')).toBeInTheDocument();
    expect(screen.getByText('Eliminar')).toBeInTheDocument();
  });
});

describe('ExpenseList — gear action menu (S-GM-EXPENSE)', () => {
  it('S-GM-EXPENSE-1: not read-only with onDelete shows Editar (text-primary) and Eliminar (text-danger, separator)', () => {
    render(
      <Wrapper>
        <ExpenseList expenses={[MOCK_EXPENSE]} readOnly={false} onEdit={() => {}} onDelete={() => {}} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId('expense-actions-toggle-e1'));
    const editItem = screen.getByRole('menuitem', { name: 'Editar' });
    const deleteItem = screen.getByRole('menuitem', { name: 'Eliminar' });
    expect(editItem).toHaveClass('text-primary');
    expect(deleteItem).toHaveClass('text-danger');
    expect(deleteItem.previousElementSibling).toHaveAttribute('role', 'separator');
  });

  it('S-GM-EXPENSE-2: no onDelete handler hides Eliminar only', () => {
    render(
      <Wrapper>
        <ExpenseList expenses={[MOCK_EXPENSE]} readOnly={false} onEdit={() => {}} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId('expense-actions-toggle-e1'));
    expect(screen.getByRole('menuitem', { name: 'Editar' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Eliminar' })).not.toBeInTheDocument();
  });

  it('S-GM-EXPENSE-3: read-only hides the actions gear entirely', () => {
    render(
      <Wrapper>
        <ExpenseList expenses={[MOCK_EXPENSE]} readOnly onEdit={() => {}} onDelete={() => {}} />
      </Wrapper>,
    );
    expect(screen.queryByTestId('expense-actions-toggle-e1')).not.toBeInTheDocument();
  });

  it('Editar/Eliminar invoke the existing onEdit/onDelete handlers with the expense', () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(
      <Wrapper>
        <ExpenseList expenses={[MOCK_EXPENSE]} readOnly={false} onEdit={onEdit} onDelete={onDelete} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId('expense-actions-toggle-e1'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Editar' }));
    expect(onEdit).toHaveBeenCalledWith(MOCK_EXPENSE);

    fireEvent.click(screen.getByTestId('expense-actions-toggle-e1'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Eliminar' }));
    expect(onDelete).toHaveBeenCalledWith(MOCK_EXPENSE);
  });
});
