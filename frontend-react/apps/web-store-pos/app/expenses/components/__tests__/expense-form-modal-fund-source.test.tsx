import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { ExpenseFundSource, ExpenseType, PaymentType } from '@store-mgmt/domain';
import type { Expense, UserModel } from '@store-mgmt/domain';
import esMessages from '~/shared/lib/i18n/es';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { ExpenseFormModal } from '../expense-form-modal';

/**
 * expense-fund-source follow-ups (RDD R3-1): el control "Origen" del
 * formulario de gasto. Default `Externo`, un gasto histórico sin el campo se
 * edita como `Externo`, y elegir `Caja` llega al payload de guardado.
 */

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

function makeUser(): UserModel {
  return {
    id: 'u1',
    userName: 'owner',
    email: 'o@x.com',
    tenantId: 't1',
    selectedStoreId: 's1',
    roles: [],
    featureIds: [],
    storeModuleIds: [2, 3],
    storeList: [],
    isSuperAdmin: false,
    isOwnerAdmin: true,
    isReSeller: false,
  } as unknown as UserModel;
}

function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'e1',
    type: ExpenseType.Comida,
    total: 100,
    date: new Date('2026-10-24T10:00:00.000'),
    paymentType: PaymentType.Efectivo,
    note: '',
    isActive: true,
    createdDate: new Date('2026-10-24T10:00:00.000'),
    createdByName: 'owner',
    ...overrides,
  };
}

function renderModal(props: {
  expense?: Expense;
  onSave?: (data: unknown, id?: string) => void;
}) {
  return render(
    <Wrapper>
      <ExpenseFormModal
        isOpen
        onClose={() => {}}
        onSave={props.onSave ?? (() => {})}
        expense={props.expense}
      />
    </Wrapper>,
  );
}

function radio(name: 'Caja' | 'Externo'): HTMLInputElement {
  return screen.getByRole('radio', { name }) as HTMLInputElement;
}

beforeEach(() => {
  localStorage.clear();
  useAuthStore.setState({ user: makeUser(), isAuthenticated: true });
});

describe('ExpenseFormModal — origen del gasto (fundSource)', () => {
  it('defaults a brand-new expense to Externo', () => {
    renderModal({});

    expect(radio('Externo').checked).toBe(true);
    expect(radio('Caja').checked).toBe(false);
  });

  it('renders a legacy expense with no fundSource as Externo', () => {
    renderModal({ expense: makeExpense() });

    expect(radio('Externo').checked).toBe(true);
  });

  it('renders an explicit Caja expense as Caja', () => {
    renderModal({ expense: makeExpense({ fundSource: ExpenseFundSource.Caja }) });

    expect(radio('Caja').checked).toBe(true);
    expect(radio('Externo').checked).toBe(false);
  });

  it('keeps the origin when the user switches back and forth', () => {
    renderModal({});

    fireEvent.click(radio('Caja'));
    expect(radio('Caja').checked).toBe(true);

    fireEvent.click(radio('Externo'));
    expect(radio('Externo').checked).toBe(true);
  });

  it('sends the chosen origin through the save payload', () => {
    const onSave = vi.fn();
    renderModal({ onSave });

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '30' } });
    fireEvent.click(radio('Caja'));
    fireEvent.click(screen.getByRole('button', { name: /Adicionar/ }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toMatchObject({
      fundSource: ExpenseFundSource.Caja,
      total: 30,
    });
  });

  it('defaults the save payload to Externo when the user never touches the control', () => {
    const onSave = vi.fn();
    renderModal({ onSave });

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: /Adicionar/ }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toMatchObject({ fundSource: ExpenseFundSource.Externo });
  });
});
