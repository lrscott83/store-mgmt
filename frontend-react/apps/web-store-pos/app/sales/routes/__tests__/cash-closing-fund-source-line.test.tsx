import { beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import type { UserModel } from '@store-mgmt/domain';
import {
  Currency,
  ExpenseFundSource,
  ExpenseType,
  PaymentType,
  SalePaymentMethod,
} from '@store-mgmt/domain';
import esMessages from '~/shared/lib/i18n/es';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { toLocalDayKey } from '~/shared/lib/date-utils';
import { StorageKeys } from '~/shared/lib/storage/storage-keys';
import { CashClosingOfflineService } from '~/sales/lib/cash-closing/cash-closing-offline-service';
import { CashClosingPage } from '../cash-closing';

/**
 * expense-fund-source follow-ups (RDD R3-3): la línea visible del cierre con
 * los gastos de caja. Debe aparecer siempre —también en cero— y su importe debe
 * coincidir con lo restado del Esperado.
 *
 * RDD R3-4: el rótulo "Gastos de caja" del cuadre queda fijado aquí por su
 * texto, no por su posición.
 */

const STORE = 'store-cash-line';
const DAY = toLocalDayKey(new Date());

function makeUser(): UserModel {
  return {
    id: 'u1',
    login: 'cashier',
    fullName: 'Test User',
    cellPhone: '',
    email: 'cashier@test.com',
    isActive: true,
    password: '',
    authToken: 'tok',
    refreshToken: 'ref',
    expiresIn: Date.now() + 1_000_000,
    roles: [],
    featureIds: [],
    storeModuleIds: [],
    isSuperAdmin: false,
    isOwnerAdmin: false,
    isReSeller: false,
    selectedStoreId: STORE,
    paymentDueDate: null,
    isInTrial: false,
    paymentStatus: 'NoAplica',
  };
}

function seedCashSale(total: number): void {
  const key = StorageKeys.entityKey('orders', STORE);
  const list = JSON.parse(localStorage.getItem(key) ?? '[]') as unknown[];
  list.push({
    id: `o-${Math.random().toString(36).slice(2)}`,
    isActive: true,
    isCredit: false,
    total,
    currency: Currency.CUP,
    salePaymentMethod: SalePaymentMethod.Efectivo,
    paymentType: PaymentType.Efectivo,
    date: new Date().toISOString(),
    orderItems: [],
  });
  localStorage.setItem(key, JSON.stringify(list));
}

function seedExpense(
  id: string,
  total: number,
  options: { fundSource?: ExpenseFundSource; currency?: Currency } = {},
): void {
  const key = StorageKeys.entityKey('expenses', STORE);
  const list = JSON.parse(localStorage.getItem(key) ?? '[]') as unknown[];
  list.push({
    id,
    type: ExpenseType.Transporte,
    total,
    date: new Date().toISOString(),
    paymentType: PaymentType.Efectivo,
    isActive: true,
    currency: options.currency ?? Currency.CUP,
    ...(options.fundSource !== undefined ? { fundSource: options.fundSource } : {}),
  });
  localStorage.setItem(key, JSON.stringify(list));
}

function renderPage() {
  return render(
    <IntlProvider locale="es" messages={esMessages}>
      <CashClosingPage />
    </IntlProvider>,
  );
}

beforeEach(() => {
  cleanup();
  localStorage.clear();
  useAuthStore.setState({ user: makeUser(), isAuthenticated: true, isLoading: false, error: null });
});

describe('CashClosingPage — línea de gastos de caja', () => {
  it('shows only the Caja expenses and subtracts them from the Esperado', () => {
    seedCashSale(100);
    seedExpense('caja', 30, { fundSource: ExpenseFundSource.Caja });
    seedExpense('externo', 50, { fundSource: ExpenseFundSource.Externo });
    seedExpense('legacy', 70);

    renderPage();

    expect(screen.getByTestId('cash-closing-cash-expenses')).toHaveTextContent(
      'Gastos de caja restados del Esperado: 30 CUP',
    );
    // 0 de apertura + 100 de efectivo − 30 de caja = 70.
    expect(screen.getByTestId('cash-closing-expected')).toHaveTextContent('70 CUP');
  });

  it('keeps the line visible with a zero amount when the day has no Caja expenses', () => {
    seedExpense('externo', 50, { fundSource: ExpenseFundSource.Externo });
    seedExpense('legacy', 70);

    renderPage();

    const line = screen.getByTestId('cash-closing-cash-expenses');
    expect(line).toBeInTheDocument();
    expect(line).toHaveTextContent('0 CUP');
  });

  it('ignores a Caja expense in another currency', () => {
    seedCashSale(100);
    seedExpense('caja-usd', 40, { fundSource: ExpenseFundSource.Caja, currency: Currency.USD });

    renderPage();

    // La vista abre en CUP: el gasto en USD no toca el Esperado en CUP.
    expect(screen.getByTestId('cash-closing-expected')).toHaveTextContent('100 CUP');
  });

  it('reflects the persisted opening cash in the Esperado', () => {
    seedCashSale(100);
    seedExpense('caja', 30, { fundSource: ExpenseFundSource.Caja });
    new CashClosingOfflineService(STORE).saveDraft(
      {
        dayKey: DAY,
        currency: Currency.CUP,
        openingCash: 1_000,
        denominations: [],
        comment: '',
      },
      'cashier',
    );

    renderPage();

    const opening = screen.getByTestId('cash-closing-opening') as HTMLInputElement;
    expect(opening.value).toBe('1000');
    // 1 000 + 100 − 30 = 1 070.
    expect(screen.getByTestId('cash-closing-expected')).toHaveTextContent('1 070 CUP');
  });
});
