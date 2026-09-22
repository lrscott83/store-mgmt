import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { Currency, EModules, SalePaymentMethod } from '@store-mgmt/domain';
import type { ChannelRate } from '@store-mgmt/domain';
import esMessages from '~/shared/lib/i18n/es';
import { StorePaymentMethodsConfigService } from '~/shared/lib/payment-methods/store-payment-methods-config-service';

let mockUser: unknown = null;
vi.mock('~/shared/lib/stores/auth-store', () => ({
  useAuthStore: (selector?: (s: { user: unknown }) => unknown) =>
    typeof selector === 'function' ? selector({ user: mockUser }) : { user: mockUser },
}));

let mockRates: ChannelRate[] = [];
vi.mock('~/management/channel-rates/lib/services/channel-rate-offline-service', () => ({
  ChannelRateOfflineService: class {
    constructor(_storeId: string) {
      void _storeId;
    }
    getStorageChannelRates(): ChannelRate[] {
      return mockRates;
    }
  },
}));

import { MultiPaymentList } from '../multi-payment-list';
import type { MultiPaymentRow } from '../multi-payment-list';

const STORE_ID = 'store-1';

function userWithStoreModules(storeModuleIds: number[]) {
  return { id: 'u1', selectedStoreId: STORE_ID, storeModuleIds };
}

function row(partial: Partial<MultiPaymentRow> & { id: string }): MultiPaymentRow {
  return {
    method: SalePaymentMethod.Efectivo,
    currency: Currency.USD,
    amount: 0,
    ...partial,
  };
}

/** Rate row expressed "units of currency per 1 USD" — 700 CUP per USD here. */
function cupRate(value: number): ChannelRate {
  return {
    id: `rate-cup-${value}`,
    method: SalePaymentMethod.Efectivo,
    currency: Currency.CUP,
    value,
    effectiveFrom: new Date('2020-01-01T00:00:00.000Z'),
    createdDate: new Date('2020-01-01T00:00:00.000Z'),
  };
}

function renderList(props: {
  payments: readonly MultiPaymentRow[];
  total: number;
  orderCurrency?: Currency;
  onChange?: (payments: MultiPaymentRow[]) => void;
}) {
  const onChange = props.onChange ?? vi.fn();
  render(
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      <MultiPaymentList
        payments={props.payments}
        onChange={onChange}
        orderCurrency={props.orderCurrency ?? Currency.USD}
        total={props.total}
        testId="multi-payment-list"
      />
    </IntlProvider>,
  );
  return onChange;
}

function settleButton() {
  return screen.getByTestId('multi-payment-settle');
}

describe('MultiPaymentList (module 16 gate)', () => {
  beforeEach(() => {
    localStorage.clear();
    mockUser = userWithStoreModules([EModules.MultiPayments]);
    mockRates = [];
  });

  it('renders nothing without the MultiPayments module', () => {
    mockUser = userWithStoreModules([2, 3]);
    renderList({ payments: [row({ id: 'p1', amount: 100 })], total: 120 });

    expect(screen.queryByTestId('multi-payment-list')).not.toBeInTheDocument();
  });

  it('renders nothing for a null user or a user without storeModuleIds', () => {
    mockUser = null;
    renderList({ payments: [row({ id: 'p1', amount: 100 })], total: 120 });
    expect(screen.queryByTestId('multi-payment-list')).not.toBeInTheDocument();

    mockUser = { id: 'u1', selectedStoreId: STORE_ID };
    renderList({ payments: [row({ id: 'p1', amount: 100 })], total: 120 });
    expect(screen.queryByTestId('multi-payment-list')).not.toBeInTheDocument();
  });
});

describe('MultiPaymentList — owner scenarios', () => {
  beforeEach(() => {
    localStorage.clear();
    mockUser = userWithStoreModules([EModules.MultiPayments]);
    mockRates = [];
  });

  it('covers a 120 USD order with 100 USD + 14.000 CUP at 700 CUP/USD', () => {
    mockRates = [cupRate(700)];
    renderList({
      payments: [
        row({ id: 'p1', currency: Currency.USD, amount: 100 }),
        row({ id: 'p2', currency: Currency.CUP, amount: 14000 }),
      ],
      orderCurrency: Currency.USD,
      total: 120,
    });

    expect(screen.getByTestId('multi-payment-paid')).toHaveTextContent('120');
    expect(screen.getByTestId('multi-payment-paid')).toHaveTextContent('USD');
    expect(screen.getByTestId('multi-payment-remaining')).toHaveTextContent('0');
    expect(screen.getByTestId('multi-payment-change')).toHaveTextContent('0');
    expect(screen.getByTestId('multi-payment-block-reason')).toHaveAttribute(
      'data-block-reason',
      'none',
    );
    expect(settleButton()).not.toBeDisabled();
  });

  it('covers a 120 CUP order with 100 CUP + 20 CUP (no rates needed)', () => {
    renderList({
      payments: [
        row({ id: 'p1', currency: Currency.CUP, amount: 100 }),
        row({ id: 'p2', currency: Currency.CUP, amount: 20 }),
      ],
      orderCurrency: Currency.CUP,
      total: 120,
    });

    expect(screen.getByTestId('multi-payment-paid')).toHaveTextContent('120');
    expect(screen.getByTestId('multi-payment-paid')).toHaveTextContent('CUP');
    expect(screen.getByTestId('multi-payment-remaining')).toHaveTextContent('0');
    expect(screen.getByTestId('multi-payment-change')).toHaveTextContent('0');
    expect(settleButton()).not.toBeDisabled();
  });
});

describe('MultiPaymentList — balance and conversion', () => {
  beforeEach(() => {
    localStorage.clear();
    mockUser = userWithStoreModules([EModules.MultiPayments]);
    mockRates = [];
  });

  it('shows the change when the payments exceed the total', () => {
    renderList({
      payments: [row({ id: 'p1', currency: Currency.USD, amount: 150 })],
      orderCurrency: Currency.USD,
      total: 100,
    });

    expect(screen.getByTestId('multi-payment-change')).toHaveTextContent('50');
    expect(screen.getByTestId('multi-payment-remaining')).toHaveTextContent('0');
    expect(settleButton()).not.toBeDisabled();
  });

  it('shows the remaining and blocks the settle action when underpaid', () => {
    renderList({
      payments: [row({ id: 'p1', currency: Currency.USD, amount: 100 })],
      orderCurrency: Currency.USD,
      total: 120,
    });

    expect(screen.getByTestId('multi-payment-remaining')).toHaveTextContent('20');
    expect(screen.getByTestId('multi-payment-change')).toHaveTextContent('0');
    expect(screen.getByTestId('multi-payment-block-reason')).toHaveAttribute(
      'data-block-reason',
      'underpaid',
    );
    expect(settleButton()).toBeDisabled();
    expect(settleButton()).toHaveAttribute('data-blocked', 'true');
  });

  it('filters non-positive rows before tallying (no throw)', () => {
    renderList({
      payments: [
        row({ id: 'p1', currency: Currency.USD, amount: 100 }),
        row({ id: 'p2', currency: Currency.USD, amount: 0 }),
        row({ id: 'p3', currency: Currency.USD, amount: -5 }),
      ],
      orderCurrency: Currency.USD,
      total: 100,
    });

    expect(screen.getByTestId('multi-payment-paid')).toHaveTextContent('100');
    expect(screen.getByTestId('multi-payment-remaining')).toHaveTextContent('0');
    expect(settleButton()).not.toBeDisabled();
  });

  it('surfaces a typed error and blocks when a payment cannot be converted', () => {
    // EUR → USD with no EUR rate resolves nowhere: a typed error, never 0.
    renderList({
      payments: [row({ id: 'p1', currency: Currency.EUR, amount: 500 })],
      orderCurrency: Currency.USD,
      total: 100,
    });

    const error = screen.getByTestId('multi-payment-row-error');
    expect(error).toHaveAttribute('data-error-code', 'ChannelRate.RateNotFound');
    expect(error).toHaveTextContent(/tasa de cambio/i);
    // The unconvertible payment is NOT silently counted as 0: the total is still owed.
    expect(screen.getByTestId('multi-payment-remaining')).toHaveTextContent('100');
    expect(screen.getByTestId('multi-payment-block-reason')).toHaveAttribute(
      'data-block-reason',
      'conversion_error',
    );
    expect(settleButton()).toBeDisabled();
  });
});

describe('MultiPaymentList — interactions', () => {
  beforeEach(() => {
    localStorage.clear();
    mockUser = userWithStoreModules([EModules.MultiPayments]);
    mockRates = [];
  });

  function Harness({ initial }: { initial: MultiPaymentRow[] }) {
    const [payments, setPayments] = useState<MultiPaymentRow[]>(initial);
    return (
      <MultiPaymentList
        payments={payments}
        onChange={setPayments}
        orderCurrency={Currency.USD}
        total={100}
        testId="multi-payment-list"
      />
    );
  }

  it('adds and removes payment rows', () => {
    render(
      <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
        <Harness initial={[]} />
      </IntlProvider>,
    );

    expect(screen.queryAllByTestId('multi-payment-row')).toHaveLength(0);

    fireEvent.click(screen.getByTestId('multi-payment-add'));
    expect(screen.getAllByTestId('multi-payment-row')).toHaveLength(1);

    fireEvent.click(screen.getByTestId('multi-payment-remove'));
    expect(screen.queryAllByTestId('multi-payment-row')).toHaveLength(0);
  });

  it('settles once an edited amount covers the total', () => {
    render(
      <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
        <Harness initial={[row({ id: 'p1', currency: Currency.USD, amount: 0 })]} />
      </IntlProvider>,
    );

    expect(settleButton()).toBeDisabled();
    expect(screen.getByTestId('multi-payment-remaining')).toHaveTextContent('100');

    fireEvent.change(screen.getByTestId('multi-payment-amount'), { target: { value: '100' } });

    expect(screen.getByTestId('multi-payment-remaining')).toHaveTextContent('0');
    expect(settleButton()).not.toBeDisabled();
  });
});

// ─── Config por-tienda (store-payment-methods-config, 2026-09-22): catálogo de
//     cada fila = moneda → gate MultiMonedas → config ──────────────────────────

describe('MultiPaymentList — métodos según config de tienda', () => {
  beforeEach(() => {
    localStorage.clear();
    mockUser = userWithStoreModules([EModules.MultiPayments]);
    mockRates = [];
  });

  function firstRowOptionLabels(): string[] {
    const first = screen.getAllByTestId('multi-payment-method')[0] as HTMLSelectElement;
    return [...first.options].map((o) => o.textContent ?? '');
  }

  it('USD + módulo 16 sin MultiMonedas: el gate de plan quita Zelle', () => {
    renderList({
      payments: [row({ id: 'p1', currency: Currency.USD, amount: 100 })],
      orderCurrency: Currency.USD,
      total: 100,
    });
    expect(firstRowOptionLabels()).toEqual(['Efectivo', 'Transferencia (USD)']);
  });

  it('USD + MultiMonedas sin config: catálogo completo con Zelle (default)', () => {
    mockUser = userWithStoreModules([EModules.MultiPayments, EModules.MultiMonedas]);
    renderList({
      payments: [row({ id: 'p1', currency: Currency.USD, amount: 100 })],
      orderCurrency: Currency.USD,
      total: 100,
    });
    expect(firstRowOptionLabels()).toEqual(['Efectivo', 'Zelle', 'Transferencia (USD)']);
  });

  it('USD + MultiMonedas + Zelle desactivado en config: la fila pierde Zelle', () => {
    new StorePaymentMethodsConfigService(STORE_ID).setMethodEnabled(
      STORE_ID,
      SalePaymentMethod.Zelle,
      false,
    );
    mockUser = userWithStoreModules([EModules.MultiPayments, EModules.MultiMonedas]);
    renderList({
      payments: [row({ id: 'p1', currency: Currency.USD, amount: 100 })],
      orderCurrency: Currency.USD,
      total: 100,
    });
    expect(firstRowOptionLabels()).toEqual(['Efectivo', 'Transferencia (USD)']);
  });

  it('MLC con Transferencia desactivada en config: fallback Efectivo (select válido)', () => {
    new StorePaymentMethodsConfigService(STORE_ID).setMethodEnabled(
      STORE_ID,
      SalePaymentMethod.Transferencia,
      false,
    );
    renderList({
      payments: [row({ id: 'p1', currency: Currency.MLC, amount: 100 })],
      orderCurrency: Currency.MLC,
      total: 100,
    });
    // Catálogo MLC = solo Transferencia → config lo desactiva → Efectivo siempre.
    expect(firstRowOptionLabels()).toEqual(['Efectivo']);
  });

  it('changeCurrency re-pinea al primer método del nuevo catálogo bajo config', () => {
    new StorePaymentMethodsConfigService(STORE_ID).setMethodEnabled(
      STORE_ID,
      SalePaymentMethod.Transferencia,
      false,
    );
    const onChange = vi.fn();
    renderList({
      payments: [row({ id: 'p1', currency: Currency.USD, amount: 0 })],
      orderCurrency: Currency.USD,
      total: 100,
      onChange,
    });
    fireEvent.change(screen.getAllByTestId('multi-payment-currency')[0], {
      target: { value: String(Currency.CUP) },
    });
    // CUP sin Transferencia (config) → Efectivo, no Transferencia.
    expect(onChange).toHaveBeenCalledWith([
      { id: 'p1', method: SalePaymentMethod.Efectivo, currency: Currency.CUP, amount: 0 },
    ]);
  });

  it('addRow re-pinea al primer método del catálogo del pedido bajo config', () => {
    new StorePaymentMethodsConfigService(STORE_ID).setMethodEnabled(
      STORE_ID,
      SalePaymentMethod.Transferencia,
      false,
    );
    function Harness() {
      const [payments, setPayments] = useState<MultiPaymentRow[]>([]);
      return (
        <MultiPaymentList
          payments={payments}
          onChange={setPayments}
          orderCurrency={Currency.CUP}
          total={100}
          testId="multi-payment-list"
        />
      );
    }
    render(
      <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
        <Harness />
      </IntlProvider>,
    );
    fireEvent.click(screen.getByTestId('multi-payment-add'));
    const added = screen.getAllByTestId('multi-payment-row')[0];
    const methodSelect = added.querySelector(
      '[data-testid="multi-payment-method"]',
    ) as HTMLSelectElement;
    // CUP + config sin Transferencia → la fila nueva cae a Efectivo.
    expect([...methodSelect.options].map((o) => o.textContent)).toEqual(['Efectivo']);
    expect(methodSelect.value).toBe(String(SalePaymentMethod.Efectivo));
  });
});
