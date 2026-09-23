import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Currency } from '@store-mgmt/domain';
import { CurrencyTotalAmount } from '../currency-total-amount';

describe('CurrencyTotalAmount', () => {
  it('with the gate OFF renders exactly the legacy single formatCurrency(total)', () => {
    render(
      <CurrencyTotalAmount
        legacyTotal={35}
        entries={[
          { amount: 30, currency: Currency.USD },
          { amount: 5, currency: Currency.EUR },
        ]}
        multiMonedas={false}
      />,
    );
    expect(screen.getByText('35 CUP')).toBeInTheDocument();
    expect(screen.queryByText('30 USD')).toBeNull();
  });

  it('with the gate ON shows the primary amount + one chip per remaining currency', () => {
    render(
      <CurrencyTotalAmount
        legacyTotal={35}
        entries={[
          { amount: 30, currency: Currency.EUR },
          { amount: 5, currency: Currency.USD },
        ]}
        multiMonedas
      />,
    );
    // Order is USD → EUR → CUP, so USD is the primary and EUR the chip.
    expect(screen.getByText('5 USD')).toBeInTheDocument();
    expect(screen.getByText('30 EUR')).toBeInTheDocument();
    expect(screen.queryByText('35 CUP')).toBeNull();
  });

  it('with the gate ON and a single currency shows the currency code, no chips', () => {
    render(
      <CurrencyTotalAmount
        legacyTotal={2000}
        entries={[{ amount: 2000 }]}
        multiMonedas
      />,
    );
    expect(screen.getByText('2 000 CUP')).toBeInTheDocument();
  });

  it('with the gate ON and no entries falls back to the legacy total', () => {
    render(<CurrencyTotalAmount legacyTotal={0} entries={[]} multiMonedas />);
    expect(screen.getByText('0 CUP')).toBeInTheDocument();
  });

  it('never renders the mixed sum when the gate is ON (USD → EUR → CUP ordering)', () => {
    render(
      <CurrencyTotalAmount
        legacyTotal={1005}
        entries={[
          { amount: 1000 },
          { amount: 10, currency: Currency.USD },
          { amount: 5, currency: Currency.EUR },
        ]}
        multiMonedas
      />,
    );
    expect(screen.getByText('10 USD')).toBeInTheDocument();
    expect(screen.getByText('5 EUR')).toBeInTheDocument();
    expect(screen.getByText('1 000 CUP')).toBeInTheDocument();
    expect(screen.queryByText('1 005 CUP')).toBeNull();
  });
});
