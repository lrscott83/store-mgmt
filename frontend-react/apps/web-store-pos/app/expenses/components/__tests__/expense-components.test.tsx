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
    fireEvent.click(screen.getByText('Adicionar'));
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
    fireEvent.click(screen.getByText('Adicionar'));
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

// Angular reference: edit-expense-modal.component.ts:60 — create-mode default `type` is
// `ExpenseType.Salario`, not `ExpenseType.Otro`.
describe('ExpenseFormModal — create-mode default type (Angular parity: edit-expense-modal.component.ts:60)', () => {
  it('preselects Salario (not Otro) when opened in create mode', () => {
    render(
      <Wrapper>
        <ExpenseFormModal isOpen onClose={() => {}} onSave={() => {}} />
      </Wrapper>,
    );
    // The Type <select> is the first combobox in the form (Payment type is the second).
    const typeSelect = screen.getAllByRole('combobox')[0] as HTMLSelectElement;
    expect(typeSelect.value).toBe(String(ExpenseType.Salario));
  });
});

// Angular reference: edit-expense-modal.component.ts:88-92 `Validators.required` on total — a
// brand-new expense has NO default total, so submitting empty is blocked. But per
// isControlInvalid (component.ts:118-125), the error only surfaces once the control is
// `dirty || touched`, and the Save button has no [disabled] binding at all
// (edit-expense-modal.component.html:74) — so a fresh modal shows neither the error nor a
// disabled Save.
describe('ExpenseFormModal — total is required on create (Angular parity: Validators.required)', () => {
  it('shows no error and a clickable Save on a fresh mount, before any interaction', () => {
    render(
      <Wrapper>
        <ExpenseFormModal isOpen onClose={() => {}} onSave={() => {}} />
      </Wrapper>,
    );
    expect(screen.queryByText('El total debe ser mayor a 0')).not.toBeInTheDocument();
    expect(screen.getByText('Adicionar').closest('button')).not.toBeDisabled();
  });

  it('does not call onSave when Save is clicked before entering a total, and surfaces the error afterwards (markAllAsTouched)', () => {
    const onSave = vi.fn();
    render(
      <Wrapper>
        <ExpenseFormModal isOpen onClose={() => {}} onSave={onSave} />
      </Wrapper>,
    );
    expect(screen.queryByText('El total debe ser mayor a 0')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Adicionar'));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('El total debe ser mayor a 0')).toBeInTheDocument();
    expect(screen.getByText('Adicionar').closest('button')).not.toBeDisabled();
  });

  it('becomes valid once the user explicitly types 0', () => {
    const onSave = vi.fn();
    render(
      <Wrapper>
        <ExpenseFormModal isOpen onClose={() => {}} onSave={onSave} />
      </Wrapper>,
    );
    fireEvent.change(screen.getByLabelText('Total'), { target: { value: '0' } });
    expect(screen.queryByText('El total debe ser mayor a 0')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Adicionar'));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].total).toBe(0);
  });

  it('edit mode is unaffected — an existing expense keeps its own total as valid by default', () => {
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
    expect(screen.queryByText('El total debe ser mayor a 0')).not.toBeInTheDocument();
    expect(screen.getByText('Actualizar').closest('button')).not.toBeDisabled();
  });
});

// Angular reference: edit-expense-modal.component.html:70-73 binds the footer
// close button to GENERAL.CLOSE ("Cerrar"), not GENERAL.CANCEL ("Cancelar").
describe('ExpenseFormModal — footer close button label (Angular parity: GENERAL.CLOSE)', () => {
  it('renders the footer close button as "Cerrar", not "Cancelar"', () => {
    render(
      <Wrapper>
        <ExpenseFormModal isOpen onClose={() => {}} onSave={() => {}} />
      </Wrapper>,
    );
    expect(screen.getByText('Cerrar')).toBeInTheDocument();
    expect(screen.queryByText('Cancelar')).not.toBeInTheDocument();
  });
});

// Angular: edit-expense-modal.component.html:70-77 — mat-fab extended
// Close/Save buttons carry `close`/`save` mat-icons.
describe('ExpenseFormModal — footer close button icon (Angular parity: CloseIcon)', () => {
  it('renders a CloseIcon svg inside the footer close button', () => {
    render(
      <Wrapper>
        <ExpenseFormModal isOpen onClose={() => {}} onSave={() => {}} />
      </Wrapper>,
    );
    expect(screen.getByText('Cerrar').closest('button')?.querySelector('svg')).not.toBeNull();
  });
});

// Angular: edit-expense-modal.component.html:70 — the close button is
// `mat-fab extended color="primary"`, same fab styling as the save button.
describe('ExpenseFormModal — footer close button renders as fab (Angular parity)', () => {
  it('renders the footer close button as a fab (Button variant="fab"), not outline', () => {
    render(
      <Wrapper>
        <ExpenseFormModal isOpen onClose={() => {}} onSave={() => {}} />
      </Wrapper>,
    );
    const closeButton = screen.getByText('Cerrar').closest('button');
    expect(closeButton).toHaveClass('rounded-full');
    expect(closeButton).not.toHaveClass('border-primary');
  });
});

// Angular: edit-expense-modal.component.html:70-77 — the footer renders Close
// BEFORE Save. The sibling edit-inventory-entry-modal already matches this order.
describe('ExpenseFormModal — footer button order (Angular parity: Close before Save)', () => {
  it('renders the Close button before the Save button in the footer', () => {
    render(
      <Wrapper>
        <ExpenseFormModal isOpen onClose={() => {}} onSave={() => {}} />
      </Wrapper>,
    );
    const buttons = screen.getAllByRole('button').filter(
      (b) => b.textContent === 'Adicionar' || b.textContent === 'Cerrar',
    );
    expect(buttons.map((b) => b.textContent)).toEqual(['Cerrar', 'Adicionar']);
  });
});

// Angular reference: edit-expense-modal.component.html:74-77 —
// `{{ (!expense ? 'GENERAL.INSERT' : 'GENERAL.UPDATE') | translate }}`. The Save
// button label toggles by mode; it was hardcoded to GENERAL.SAVE regardless.
describe('ExpenseFormModal — save button label toggles INSERT/UPDATE (Angular parity)', () => {
  it('shows GENERAL.INSERT ("Adicionar") in create mode (no expense prop)', () => {
    render(
      <Wrapper>
        <ExpenseFormModal isOpen onClose={() => {}} onSave={() => {}} />
      </Wrapper>,
    );
    expect(screen.getByText('Adicionar')).toBeInTheDocument();
    expect(screen.queryByText('Salvar')).not.toBeInTheDocument();
  });

  it('shows GENERAL.UPDATE ("Actualizar") in edit mode (expense prop present)', () => {
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
    expect(screen.getByText('Actualizar')).toBeInTheDocument();
    expect(screen.queryByText('Salvar')).not.toBeInTheDocument();
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

// Angular parity: expense-list.component.html renders only type, payment icon, total,
// payment-type text and the actions menu — it never renders `expense.note` in the list.
// The React-only note preview was an invention (migration invents nothing new) → removed.
describe('ExpenseList — no note preview (Angular parity: expense-list.component.html omits the note)', () => {
  it('does not render the expense note text in the list row', () => {
    const withNote: Expense = { ...MOCK_EXPENSE, note: 'Compra de insumos secreta' };
    render(
      <Wrapper>
        <ExpenseList expenses={[withNote]} readOnly={false} onEdit={() => {}} onDelete={() => {}} />
      </Wrapper>,
    );
    expect(screen.queryByText('Compra de insumos secreta')).not.toBeInTheDocument();
  });
});
