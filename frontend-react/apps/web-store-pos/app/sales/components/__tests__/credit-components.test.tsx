import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { SaleCredit } from '@store-mgmt/domain';
import { PaymentType } from '@store-mgmt/domain';

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

function makeCredit(overrides: Partial<SaleCredit> = {}): SaleCredit {
  return {
    id: 'credit-1',
    orderId: 'order-1',
    client: 'John Doe',
    total: 200,
    date: new Date('2025-01-01T10:00:00Z'),
    paid: 0,
    isPaid: false,
    paidDate: new Date(),
    paidType: PaymentType.Efectivo,
    note: '',
    isActive: true,
    createdDate: new Date(),
    createdByName: 'test',
    ...overrides,
  };
}

// --- SaleCreditList smoke tests ---
import { SaleCreditList } from '../sale-credit-list';

describe('SaleCreditList', () => {
  it('renders empty state when no credits', () => {
    render(
      <Wrapper>
        <SaleCreditList credits={[]} onCreditClick={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByText(/No hay créditos/i)).toBeInTheDocument();
  });

  it('renders credit rows with client name', () => {
    const credits = [makeCredit({ client: 'María García' })];
    render(
      <Wrapper>
        <SaleCreditList credits={credits} onCreditClick={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByText('María García')).toBeInTheDocument();
  });
});

// --- SaleCreditPaymentModal — submit disabled when isPaid ===true ---
import { SaleCreditPaymentModal } from '../sale-credit-payment-modal';

describe('SaleCreditPaymentModal', () => {
  it('disables confirm button when credit is already paid', () => {
    const credit = makeCredit({ isPaid: true, paid: 200, total: 200 });
    render(
      <Wrapper>
        <SaleCreditPaymentModal
          credit={credit}
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
        />
      </Wrapper>,
    );
    const confirmBtn = screen.getByRole('button', { name: /Confirmar pago/i });
    expect(confirmBtn).toBeDisabled();
  });

  it('enables confirm button when credit is not paid', () => {
    const credit = makeCredit({ isPaid: false, paid: 0, total: 200 });
    render(
      <Wrapper>
        <SaleCreditPaymentModal
          credit={credit}
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
        />
      </Wrapper>,
    );
    const confirmBtn = screen.getByRole('button', { name: /Confirmar pago/i });
    expect(confirmBtn).not.toBeDisabled();
  });

  it('does not render when closed', () => {
    const credit = makeCredit();
    render(
      <Wrapper>
        <SaleCreditPaymentModal
          credit={credit}
          isOpen={false}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
        />
      </Wrapper>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

// --- EditSaleCreditModal smoke test ---
import { EditSaleCreditModal } from '../edit-sale-credit-modal';

describe('EditSaleCreditModal', () => {
  it('renders client name when open', () => {
    const credit = makeCredit({ client: 'Carlos López' });
    render(
      <Wrapper>
        <EditSaleCreditModal
          credit={credit}
          isOpen={true}
          onClose={vi.fn()}
          onSave={vi.fn()}
          onPayment={vi.fn()}
        />
      </Wrapper>,
    );
    expect(screen.getByDisplayValue('Carlos López')).toBeInTheDocument();
  });

  it('disables pay button when credit is already paid', () => {
    const credit = makeCredit({ isPaid: true });
    render(
      <Wrapper>
        <EditSaleCreditModal
          credit={credit}
          isOpen={true}
          onClose={vi.fn()}
          onSave={vi.fn()}
          onPayment={vi.fn()}
        />
      </Wrapper>,
    );
    const payBtn = screen.getByRole('button', { name: /Registrar pago/i });
    expect(payBtn).toBeDisabled();
  });
});
