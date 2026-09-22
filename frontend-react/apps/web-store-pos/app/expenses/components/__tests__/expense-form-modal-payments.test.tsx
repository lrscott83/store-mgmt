import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { Currency, ExpenseType, PaymentType, SalePaymentMethod } from '@store-mgmt/domain';
import type { Expense, UserModel } from '@store-mgmt/domain';
import { EModules } from '@store-mgmt/domain';
import esMessages from '~/shared/lib/i18n/es';
import { StorePaymentMethodsConfigService } from '~/shared/lib/payment-methods/store-payment-methods-config-service';
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
  // store-payment-methods-config: la config se persiste en localStorage y la
  // tienda default del fixture es 's1' — reset entre tests para no filtrar.
  localStorage.clear();
  useAuthStore.setState({ user: makeUser([2, 3]), isAuthenticated: true });
});

// ─── Formas de pago según módulo MultiMonedas (2026-09-21) ───────────────────

describe('ExpenseFormModal — formas de pago (MultiMonedas)', () => {
  it('SIN MultiMonedas: solo Efectivo y Transferencia (CUP) — sin Zelle', () => {
    render(
      <Wrapper>
        <ExpenseFormModal isOpen onClose={() => {}} onSave={() => {}} />
      </Wrapper>,
    );
    // El tipo de pago es el SEGUNDO combobox del formulario (el primero es Tipo de gasto).
    const paymentSelect = screen.getAllByRole('combobox')[1] as HTMLSelectElement;
    const labels = [...paymentSelect.options].map((o) => o.textContent);
    expect(labels).toEqual(['Efectivo', 'Transferencia (CUP)']);
  });

  it('CON MultiMonedas y moneda CUP: Efectivo y Transferencia (CUP)', () => {
    useAuthStore.setState({
      user: makeUser([2, 3, EModules.MultiMonedas]),
      isAuthenticated: true,
    });
    render(
      <Wrapper>
        <ExpenseFormModal isOpen onClose={() => {}} onSave={() => {}} />
      </Wrapper>,
    );
    // Con MultiMonedas hay 3 comboboxes (Tipo, Moneda, Pago) — el de pago es el ÚLTIMO.
    const paymentSelect = screen.getAllByRole('combobox')[2] as HTMLSelectElement;
    const labels = [...paymentSelect.options].map((o) => o.textContent);
    expect(labels).toEqual(['Efectivo', 'Transferencia (CUP)']);
  });

  it('CON MultiMonedas y moneda USD: catálogo completo (Efectivo, Zelle, Transferencia (USD))', () => {
    useAuthStore.setState({
      user: makeUser([2, 3, EModules.MultiMonedas]),
      isAuthenticated: true,
    });
    render(
      <Wrapper>
        <ExpenseFormModal isOpen onClose={() => {}} onSave={() => {}} />
      </Wrapper>,
    );
    const currencySelect = screen.getByTestId('expense-currency-select') as HTMLSelectElement;
    fireEvent.change(currencySelect, { target: { value: String(Currency.USD) } });
    // Con MultiMonedas hay 3 comboboxes (Tipo, Moneda, Pago) — el de pago es el ÚLTIMO.
    const paymentSelect = screen.getAllByRole('combobox')[2] as HTMLSelectElement;
    const labels = [...paymentSelect.options].map((o) => o.textContent);
    expect(labels).toEqual(['Efectivo', 'Zelle', 'Transferencia (USD)']);
  });

  it('persiste el MÉTODO real (salePaymentMethod) y el legacy espejo al guardar', () => {
    const onSave = vi.fn();
    useAuthStore.setState({
      user: makeUser([2, 3, EModules.MultiMonedas]),
      isAuthenticated: true,
    });
    render(
      <Wrapper>
        <ExpenseFormModal isOpen onClose={() => {}} onSave={onSave} />
      </Wrapper>,
    );
    const currencySelect = screen.getByTestId('expense-currency-select') as HTMLSelectElement;
    fireEvent.change(currencySelect, { target: { value: String(Currency.USD) } });
    // Con MultiMonedas hay 3 comboboxes (Tipo, Moneda, Pago) — el de pago es el ÚLTIMO.
    const paymentSelect = screen.getAllByRole('combobox')[2] as HTMLSelectElement;
    fireEvent.change(paymentSelect, { target: { value: String(SalePaymentMethod.Zelle) } });
    fireEvent.change(screen.getByLabelText('Total'), { target: { value: '15' } });
    fireEvent.click(screen.getByText('Adicionar'));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].salePaymentMethod).toBe(SalePaymentMethod.Zelle);
    // Legacy espejo: Zelle sigue siendo Zelle en el campo de compatibilidad.
    expect(onSave.mock.calls[0][0].paymentType).toBe(PaymentType.Zelle);
  });

  it('edit-mode: un gasto guardado con Zelle se recarga seleccionado (no cae a Efectivo)', () => {
    render(
      <Wrapper>
        <ExpenseFormModal isOpen onClose={() => {}} onSave={() => {}} expense={makeExpense(PaymentType.Zelle)} />
      </Wrapper>,
    );
    const paymentSelect = screen.getAllByRole('combobox')[1] as HTMLSelectElement;
    expect(paymentSelect.value).toBe(String(SalePaymentMethod.Zelle));
  });

  it('edit-mode: un gasto guardado con Tarjeta muestra Transferencia (CUP) seleccionado', () => {
    render(
      <Wrapper>
        <ExpenseFormModal isOpen onClose={() => {}} onSave={() => {}} expense={makeExpense(PaymentType.Tarjeta)} />
      </Wrapper>,
    );
    const paymentSelect = screen.getAllByRole('combobox')[1] as HTMLSelectElement;
    expect(paymentSelect.value).toBe(String(SalePaymentMethod.Transferencia));
    expect(screen.getByText('Transferencia (CUP)')).toBeInTheDocument();
  });

  it('edit-mode: gasto con método guardado fuera del catálogo (Zelle, moneda CUP) sigue visible', () => {
    render(
      <Wrapper>
        <ExpenseFormModal
          isOpen
          onClose={() => {}}
          onSave={() => {}}
          expense={makeExpense(PaymentType.Zelle)}
        />
      </Wrapper>,
    );
    const paymentSelect = screen.getAllByRole('combobox')[1] as HTMLSelectElement;
    const labels = [...paymentSelect.options].map((o) => o.textContent);
    // Catálogo sin MultiMonedas + Zelle histórico conservado al final.
    expect(labels).toEqual(['Efectivo', 'Transferencia (CUP)', 'Zelle']);
    expect(paymentSelect.value).toBe(String(SalePaymentMethod.Zelle));
  });
});

// ─── Config por-tienda (store-payment-methods-config, 2026-09-22) ────────────

describe('ExpenseFormModal — formas de pago (store-payment-methods-config)', () => {
  it('Zelle desactivado en config: desaparece del catálogo USD (MultiMonedas)', () => {
    new StorePaymentMethodsConfigService('s1').setMethodEnabled(
      's1',
      SalePaymentMethod.Zelle,
      false,
    );
    useAuthStore.setState({
      user: makeUser([2, 3, EModules.MultiMonedas]),
      isAuthenticated: true,
    });
    render(
      <Wrapper>
        <ExpenseFormModal isOpen onClose={() => {}} onSave={() => {}} />
      </Wrapper>,
    );
    const currencySelect = screen.getByTestId('expense-currency-select') as HTMLSelectElement;
    fireEvent.change(currencySelect, { target: { value: String(Currency.USD) } });
    const paymentSelect = screen.getAllByRole('combobox')[2] as HTMLSelectElement;
    const labels = [...paymentSelect.options].map((o) => o.textContent);
    expect(labels).toEqual(['Efectivo', 'Transferencia (USD)']);
  });

  it('Zelle reactivado en config: vuelve al catálogo USD (MultiMonedas)', () => {
    new StorePaymentMethodsConfigService('s1').setMethodEnabled(
      's1',
      SalePaymentMethod.Zelle,
      false,
    );
    new StorePaymentMethodsConfigService('s1').setMethodEnabled(
      's1',
      SalePaymentMethod.Zelle,
      true,
    );
    useAuthStore.setState({
      user: makeUser([2, 3, EModules.MultiMonedas]),
      isAuthenticated: true,
    });
    render(
      <Wrapper>
        <ExpenseFormModal isOpen onClose={() => {}} onSave={() => {}} />
      </Wrapper>,
    );
    const currencySelect = screen.getByTestId('expense-currency-select') as HTMLSelectElement;
    fireEvent.change(currencySelect, { target: { value: String(Currency.USD) } });
    const paymentSelect = screen.getAllByRole('combobox')[2] as HTMLSelectElement;
    const labels = [...paymentSelect.options].map((o) => o.textContent);
    expect(labels).toEqual(['Efectivo', 'Zelle', 'Transferencia (USD)']);
  });

  it('Transferencia desactivada en config: catálogo USD sin Transferencia, Efectivo siempre', () => {
    new StorePaymentMethodsConfigService('s1').setMethodEnabled(
      's1',
      SalePaymentMethod.Transferencia,
      false,
    );
    useAuthStore.setState({
      user: makeUser([2, 3, EModules.MultiMonedas]),
      isAuthenticated: true,
    });
    render(
      <Wrapper>
        <ExpenseFormModal isOpen onClose={() => {}} onSave={() => {}} />
      </Wrapper>,
    );
    const currencySelect = screen.getByTestId('expense-currency-select') as HTMLSelectElement;
    fireEvent.change(currencySelect, { target: { value: String(Currency.USD) } });
    const paymentSelect = screen.getAllByRole('combobox')[2] as HTMLSelectElement;
    const labels = [...paymentSelect.options].map((o) => o.textContent);
    expect(labels).toEqual(['Efectivo', 'Zelle']);
  });

  it('TODOS desactivados: queda solo Efectivo (no desactivable)', () => {
    const svc = new StorePaymentMethodsConfigService('s1');
    svc.setMethodEnabled('s1', SalePaymentMethod.Zelle, false);
    svc.setMethodEnabled('s1', SalePaymentMethod.Transferencia, false);
    render(
      <Wrapper>
        <ExpenseFormModal isOpen onClose={() => {}} onSave={() => {}} />
      </Wrapper>,
    );
    const paymentSelect = screen.getAllByRole('combobox')[1] as HTMLSelectElement;
    const labels = [...paymentSelect.options].map((o) => o.textContent);
    expect(labels).toEqual(['Efectivo']);
  });

  it('edit-mode: gasto histórico Zelle SE MANTIENE visible aunque la config lo desactive', () => {
    new StorePaymentMethodsConfigService('s1').setMethodEnabled(
      's1',
      SalePaymentMethod.Zelle,
      false,
    );
    render(
      <Wrapper>
        <ExpenseFormModal
          isOpen
          onClose={() => {}}
          onSave={() => {}}
          expense={makeExpense(PaymentType.Zelle)}
        />
      </Wrapper>,
    );
    const paymentSelect = screen.getAllByRole('combobox')[1] as HTMLSelectElement;
    const labels = [...paymentSelect.options].map((o) => o.textContent);
    // Catálogo sin MultiMonedas + config sin Zelle + Zelle histórico al final.
    expect(labels).toEqual(['Efectivo', 'Transferencia (CUP)', 'Zelle']);
    expect(paymentSelect.value).toBe(String(SalePaymentMethod.Zelle));
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
