import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { Currency, ExpenseType, PaymentType } from '@store-mgmt/domain';
import type { Expense, UserModel } from '@store-mgmt/domain';
import { EModules } from '@store-mgmt/domain';
import esMessages from '~/shared/lib/i18n/es';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { ExpenseFormModal } from '../expense-form-modal';

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

function makeUser(storeModuleIds: number[]): UserModel {
  return {
    id: 'u1',
    userName: 'owner',
    email: 'o@x.com',
    tenantId: 't1',
    selectedStoreId: 's1',
    roles: [],
    featureIds: [],
    storeModuleIds,
    storeList: [],
    isSuperAdmin: false,
    isOwnerAdmin: true,
    isReSeller: false,
  } as unknown as UserModel;
}

function makeExpense(paymentType: PaymentType): Expense {
  return {
    id: 'e1',
    type: ExpenseType.Comida,
    total: 10,
    date: new Date('2024-03-15T10:00:00.000'),
    paymentType,
    note: '',
    isActive: true,
    createdDate: new Date('2024-03-15T10:00:00.000'),
    createdByName: '',
  };
}

beforeEach(() => {
  useAuthStore.setState({ user: makeUser([2, 3]), isAuthenticated: true });
});

// ─── Todos los tipos de pago posibles ────────────────────────────────────────

describe('ExpenseFormModal — todos los tipos de pago posibles', () => {
  it('ofrece los 3 tipos de pago en el select (Efectivo, Transferencia (CUP), Zelle)', () => {
    render(
      <Wrapper>
        <ExpenseFormModal isOpen onClose={() => {}} onSave={() => {}} />
      </Wrapper>,
    );
    // El tipo de pago es el SEGUNDO combobox del formulario (el primero es Tipo de gasto).
    const paymentSelect = screen.getAllByRole('combobox')[1] as HTMLSelectElement;
    const labels = [...paymentSelect.options].map((o) => o.textContent);
    expect(labels).toEqual(['Efectivo', 'Transferencia (CUP)', 'Zelle']);
  });

  it('persiste Zelle al guardar un gasto nuevo con ese tipo de pago', () => {
    const onSave = vi.fn();
    render(
      <Wrapper>
        <ExpenseFormModal isOpen onClose={() => {}} onSave={onSave} />
      </Wrapper>,
    );
    const paymentSelect = screen.getAllByRole('combobox')[1] as HTMLSelectElement;
    fireEvent.change(paymentSelect, { target: { value: String(PaymentType.Zelle) } });
    fireEvent.change(screen.getByLabelText('Total'), { target: { value: '15' } });
    fireEvent.click(screen.getByText('Adicionar'));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].paymentType).toBe(PaymentType.Zelle);
  });

  it('edit-mode: un gasto guardado con Zelle se recarga seleccionado (no cae a Efectivo)', () => {
    render(
      <Wrapper>
        <ExpenseFormModal isOpen onClose={() => {}} onSave={() => {}} expense={makeExpense(PaymentType.Zelle)} />
      </Wrapper>,
    );
    const paymentSelect = screen.getAllByRole('combobox')[1] as HTMLSelectElement;
    expect(paymentSelect.value).toBe(String(PaymentType.Zelle));
  });

  it('edit-mode: un gasto guardado con Tarjeta muestra Transferencia (CUP) seleccionado', () => {
    render(
      <Wrapper>
        <ExpenseFormModal isOpen onClose={() => {}} onSave={() => {}} expense={makeExpense(PaymentType.Tarjeta)} />
      </Wrapper>,
    );
    const paymentSelect = screen.getAllByRole('combobox')[1] as HTMLSelectElement;
    expect(paymentSelect.value).toBe(String(PaymentType.Tarjeta));
    expect(screen.getByText('Transferencia (CUP)')).toBeInTheDocument();
  });
});

// ─── Moneda: MultiMonedas muestra el combo, default CUP ──────────────────────

describe('ExpenseFormModal — moneda (MultiMonedas)', () => {
  it('MUESTRA el combo de moneda cuando la tienda tiene el módulo MultiMonedas', () => {
    useAuthStore.setState({ user: makeUser([2, 3, EModules.MultiMonedas]), isAuthenticated: true });
    render(
      <Wrapper>
        <ExpenseFormModal isOpen onClose={() => {}} onSave={() => {}} />
      </Wrapper>,
    );
    const currencySelect = screen.getByTestId('expense-currency-select') as HTMLSelectElement;
    expect(currencySelect).toBeInTheDocument();
    // Default CUP sin interacción del usuario.
    expect(Number(currencySelect.value)).toBe(Currency.CUP);
  });

  it('persiste la moneda elegida en el input de guardado', () => {
    useAuthStore.setState({ user: makeUser([2, 3, EModules.MultiMonedas]), isAuthenticated: true });
    const onSave = vi.fn();
    render(
      <Wrapper>
        <ExpenseFormModal isOpen onClose={() => {}} onSave={onSave} />
      </Wrapper>,
    );
    const currencySelect = screen.getByTestId('expense-currency-select') as HTMLSelectElement;
    fireEvent.change(currencySelect, { target: { value: String(Currency.USD) } });
    fireEvent.change(screen.getByLabelText('Total'), { target: { value: '25' } });
    fireEvent.click(screen.getByText('Adicionar'));
    expect(onSave.mock.calls[0][0].currency).toBe(Currency.USD);
  });

  it('sin datos de moneda (gasto histórico) el combo abre en CUP y el guardado emite CUP', () => {
    useAuthStore.setState({ user: makeUser([2, 3, EModules.MultiMonedas]), isAuthenticated: true });
    const legacy: Expense = { ...makeExpense(PaymentType.Efectivo), currency: undefined };
    const onSave = vi.fn();
    render(
      <Wrapper>
        <ExpenseFormModal isOpen onClose={() => {}} onSave={onSave} expense={legacy} />
      </Wrapper>,
    );
    const currencySelect = screen.getByTestId('expense-currency-select') as HTMLSelectElement;
    expect(Number(currencySelect.value)).toBe(Currency.CUP);
    fireEvent.click(screen.getByText('Actualizar'));
    expect(onSave.mock.calls[0][0].currency).toBe(Currency.CUP);
  });

  it('SIN el módulo MultiMonedas el combo no se renderiza (default CUP implícito)', () => {
    render(
      <Wrapper>
        <ExpenseFormModal isOpen onClose={() => {}} onSave={() => {}} />
      </Wrapper>,
    );
    expect(screen.queryByTestId('expense-currency-select')).not.toBeInTheDocument();
  });
});
