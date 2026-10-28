import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { ExpenseFundSource, ExpenseType, PaymentType } from '@store-mgmt/domain';
import type { Expense } from '@store-mgmt/domain';
import esMessages from '~/shared/lib/i18n/es';
import { toLocalDayKey } from '~/shared/lib/date-utils';

/**
 * expense-fund-source follow-ups (RDD R3-2): filtro por ORIGEN del historial de
 * gastos. Un gasto histórico sin el campo cuenta como `Externo`.
 */

const { authStoreState, expensesFixture, multiStoreState } = vi.hoisted(() => ({
  authStoreState: {
    user: { selectedStoreId: 's1' },
    isAuthenticated: true,
  },
  expensesFixture: { list: [] as Expense[] },
  // Identidad ESTABLE: el efecto de multi-store depende de `stores`, así que un
  // array nuevo por render lo dejaría re-ejecutándose sin fin.
  multiStoreState: { enabled: false, stores: [] as { id: string; name: string }[] },
}));

vi.mock('~/shared/lib/stores/auth-store', () => ({
  useAuthStore: vi.fn((selector?: (s: typeof authStoreState) => unknown) =>
    typeof selector === 'function' ? selector(authStoreState) : authStoreState,
  ),
}));

vi.mock('~/shared/lib/hooks/use-multi-store', () => ({
  useMultiStore: () => multiStoreState,
}));

vi.mock('~/expenses/lib/services/expense-offline-service', () => ({
  ExpenseOfflineService: vi.fn().mockImplementation(() => ({
    filterExpensesObservable: vi.fn(() =>
      Promise.resolve({
        data: expensesFixture.list,
        succeeded: true,
        message: '',
        actionCode: 200,
        errors: [],
      }),
    ),
  })),
}));

import { ExpensesHistoryPage } from '../expenses-history';

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

function makeExpense(id: string, type: ExpenseType, overrides: Partial<Expense> = {}): Expense {
  return {
    id,
    type,
    total: 10,
    date: new Date(),
    paymentType: PaymentType.Efectivo,
    note: '',
    isActive: true,
    createdDate: new Date(),
    createdByName: 'test',
    ...overrides,
  };
}

function dayToggle(): HTMLElement {
  return screen.getByTestId(`expense-day-panel-toggle-${toLocalDayKey(new Date())}`);
}

async function renderAndExpand(): Promise<void> {
  await act(async () => {
    render(
      <Wrapper>
        <ExpensesHistoryPage />
      </Wrapper>,
    );
  });
  fireEvent.click(dayToggle());
}

function originRadio(name: 'Caja' | 'Externo' | 'Todos los orígenes'): HTMLInputElement {
  return screen.getByRole('radio', { name }) as HTMLInputElement;
}

beforeEach(() => {
  expensesFixture.list = [
    makeExpense('caja', ExpenseType.Salario, { fundSource: ExpenseFundSource.Caja }),
    makeExpense('externo', ExpenseType.Transporte, {
      fundSource: ExpenseFundSource.Externo,
    }),
    makeExpense('legacy', ExpenseType.Comida),
  ];
});

describe('ExpensesHistoryPage — filtro por origen del gasto', () => {
  it('lists all three by default and treats the legacy row as Externo', async () => {
    await renderAndExpand();

    expect(screen.getByText('Salario')).toBeInTheDocument();
    expect(screen.getByText('Transporte')).toBeInTheDocument();
    expect(screen.getByText('Comida')).toBeInTheDocument();
    expect(originRadio('Todos los orígenes').checked).toBe(true);
  });

  it('Caja leaves only the Caja row', async () => {
    await renderAndExpand();

    fireEvent.click(originRadio('Caja'));

    expect(screen.getByText('Salario')).toBeInTheDocument();
    expect(screen.queryByText('Transporte')).toBeNull();
    expect(screen.queryByText('Comida')).toBeNull();
  });

  it('Externo leaves the explicit Externo row AND the legacy row', async () => {
    await renderAndExpand();

    fireEvent.click(originRadio('Externo'));

    expect(screen.queryByText('Salario')).toBeNull();
    expect(screen.getByText('Transporte')).toBeInTheDocument();
    expect(screen.getByText('Comida')).toBeInTheDocument();
  });

  it('going back to all origins restores every row', async () => {
    await renderAndExpand();

    fireEvent.click(originRadio('Caja'));
    expect(screen.queryByText('Transporte')).toBeNull();

    fireEvent.click(originRadio('Todos los orígenes'));

    expect(screen.getByText('Salario')).toBeInTheDocument();
    expect(screen.getByText('Transporte')).toBeInTheDocument();
    expect(screen.getByText('Comida')).toBeInTheDocument();
  });
});
