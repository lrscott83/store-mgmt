import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { SaleCredit } from '@store-mgmt/domain';
import { PaymentType } from '@store-mgmt/domain';
import { SaleCreditList } from '../sale-credit-list';

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

function makeSaleCredit(overrides: Partial<SaleCredit> = {}): SaleCredit {
  return {
    id: 'credit-1',
    orderId: 'order-1',
    client: 'Jane Doe',
    total: 2000,
    date: new Date('2025-01-01'),
    paid: 0,
    isPaid: true,
    paidDate: new Date('2025-01-02'),
    paidType: PaymentType.Efectivo,
    note: '',
    isActive: true,
    createdDate: new Date('2025-01-01'),
    createdByName: 'test',
    ...overrides,
  };
}

describe('SaleCreditList — list/table parity sweep (WU5)', () => {
  it('renders rows without a per-row border', () => {
    const { container } = render(
      <Wrapper>
        <SaleCreditList saleCredits={[makeSaleCredit()]} readOnly />
      </Wrapper>,
    );
    const row = container.querySelector('tr') as HTMLElement;
    expect(row.className).not.toMatch(/border-b/);
  });

  it('renders the paid date as plain text, not a chip', () => {
    render(
      <Wrapper>
        <SaleCreditList saleCredits={[makeSaleCredit({ isPaid: true })]} readOnly />
      </Wrapper>,
    );
    const paidDate = screen.getByText('02/01/2025');
    expect(paidDate.className).not.toMatch(/rounded-full/);
    expect(paidDate.className).toMatch(/text-success/);
  });

  it('renders the total using formatCurrency (thousands separator)', () => {
    render(
      <Wrapper>
        <SaleCreditList saleCredits={[makeSaleCredit({ total: 2000 })]} readOnly />
      </Wrapper>,
    );
    expect(screen.getByText('$2,000.00')).toBeInTheDocument();
  });
});
