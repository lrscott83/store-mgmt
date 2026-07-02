import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
    paidDate: new Date('2025-01-02T10:00:00Z'),
    paidType: PaymentType.Efectivo,
    note: '',
    isActive: true,
    createdDate: new Date(),
    createdByName: 'test',
    ...overrides,
  };
}

// --- SaleCreditList (table, matches Angular's sale-credit-list.component) ---
import { SaleCreditList } from '../sale-credit-list';

describe('SaleCreditList', () => {
  it('renders one row per credit with client and total', () => {
    const credits = [makeCredit({ client: 'María García', total: 150 })];
    render(
      <Wrapper>
        <SaleCreditList saleCredits={credits} />
      </Wrapper>,
    );
    expect(screen.getByText('María García')).toBeInTheDocument();
    expect(screen.getByText('$150.00')).toBeInTheDocument();
  });

  it('shows paid date label only when the credit is paid', () => {
    const credits = [
      makeCredit({ id: 'c1', isPaid: true, paidDate: new Date('2025-03-05T00:00:00Z') }),
    ];
    render(
      <Wrapper>
        <SaleCreditList saleCredits={credits} />
      </Wrapper>,
    );
    expect(screen.getByText('05/03/2025')).toBeInTheDocument();
  });

  it('does not show an actions menu when readOnly (default)', () => {
    const credits = [makeCredit({ id: 'c1' })];
    render(
      <Wrapper>
        <SaleCreditList saleCredits={credits} />
      </Wrapper>,
    );
    expect(screen.queryByTestId('sale-credit-actions-toggle-c1')).toBeNull();
  });

  it('shows an actions menu when readOnly is false', () => {
    const credits = [makeCredit({ id: 'c1' })];
    render(
      <Wrapper>
        <SaleCreditList saleCredits={credits} readOnly={false} />
      </Wrapper>,
    );
    expect(screen.getByTestId('sale-credit-actions-toggle-c1')).toBeInTheDocument();
  });

  it('opens the edit modal from the actions menu (Editar)', () => {
    const credits = [makeCredit({ id: 'c1', client: 'Ana Ruiz' })];
    render(
      <Wrapper>
        <SaleCreditList saleCredits={credits} readOnly={false} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId('sale-credit-actions-toggle-c1'));
    fireEvent.click(screen.getByText('Editar'));
    expect(screen.getByDisplayValue('Ana Ruiz')).toBeInTheDocument();
  });

  it('shows the Pagar action only when the credit has not been paid at all (saleCredit.paid falsy)', () => {
    const unpaid = [makeCredit({ id: 'c1', paid: 0 })];
    const { rerender } = render(
      <Wrapper>
        <SaleCreditList saleCredits={unpaid} readOnly={false} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId('sale-credit-actions-toggle-c1'));
    expect(screen.getByText('Pagar')).toBeInTheDocument();

    const partiallyPaid = [makeCredit({ id: 'c1', paid: 50 })];
    rerender(
      <Wrapper>
        <SaleCreditList saleCredits={partiallyPaid} readOnly={false} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId('sale-credit-actions-toggle-c1'));
    expect(screen.queryByText('Pagar')).toBeNull();
  });

  it('opens the payment modal from the actions menu (Pagar)', () => {
    const credits = [makeCredit({ id: 'c1', paid: 0 })];
    render(
      <Wrapper>
        <SaleCreditList saleCredits={credits} readOnly={false} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId('sale-credit-actions-toggle-c1'));
    fireEvent.click(screen.getByText('Pagar'));
    expect(screen.getAllByText('Venta por Cobrar').length).toBeGreaterThan(0);
  });
});

// --- EditSaleCreditModal (matches Angular's edit-sale-credit-modal.component: client + note only) ---
import { EditSaleCreditModal } from '../edit-sale-credit-modal';

describe('EditSaleCreditModal', () => {
  it('renders the Angular literal title (SALE_CREDIT.PAYMENT_CREDIT) when open', () => {
    const credit = makeCredit();
    render(
      <Wrapper>
        <EditSaleCreditModal saleCredit={credit} isOpen={true} onClose={vi.fn()} onSave={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByText('Venta por Cobrar')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    const credit = makeCredit();
    render(
      <Wrapper>
        <EditSaleCreditModal saleCredit={credit} isOpen={false} onClose={vi.fn()} onSave={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('prefills client and note from the credit', () => {
    const credit = makeCredit({ client: 'Carlos López', note: 'Cliente frecuente' });
    render(
      <Wrapper>
        <EditSaleCreditModal saleCredit={credit} isOpen={true} onClose={vi.fn()} onSave={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByDisplayValue('Carlos López')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Cliente frecuente')).toBeInTheDocument();
  });

  it('requires client before saving', () => {
    const onSave = vi.fn();
    const credit = makeCredit({ client: '' });
    render(
      <Wrapper>
        <EditSaleCreditModal saleCredit={credit} isOpen={true} onClose={vi.fn()} onSave={onSave} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId('edit-sale-credit-submit'));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Cliente es requerido')).toBeInTheDocument();
  });

  it('calls onSave with client and note and closes on submit', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    const credit = makeCredit({ id: 'c1', client: 'Ana' });
    render(
      <Wrapper>
        <EditSaleCreditModal saleCredit={credit} isOpen={true} onClose={onClose} onSave={onSave} />
      </Wrapper>,
    );
    fireEvent.change(screen.getByDisplayValue('Ana'), { target: { value: 'Ana Actualizada' } });
    fireEvent.click(screen.getByTestId('edit-sale-credit-submit'));
    expect(onSave).toHaveBeenCalledWith('c1', 'Ana Actualizada', '');
    expect(onClose).toHaveBeenCalled();
  });

  it('closes without saving on Cerrar', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    const credit = makeCredit();
    render(
      <Wrapper>
        <EditSaleCreditModal saleCredit={credit} isOpen={true} onClose={onClose} onSave={onSave} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId('edit-sale-credit-close'));
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});

// --- SaleCreditPaymentModal (matches Angular's sale-credit-payment-modal.component) ---
import { SaleCreditPaymentModal } from '../sale-credit-payment-modal';

describe('SaleCreditPaymentModal', () => {
  it('renders the Angular literal title (SALE_CREDIT.PAYMENT_CREDIT) when open', () => {
    const credit = makeCredit();
    render(
      <Wrapper>
        <SaleCreditPaymentModal saleCredit={credit} isOpen={true} onClose={vi.fn()} onConfirm={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByText('Venta por Cobrar')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    const credit = makeCredit();
    render(
      <Wrapper>
        <SaleCreditPaymentModal saleCredit={credit} isOpen={false} onClose={vi.fn()} onConfirm={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows client name and amount to pay (saleCredit.total)', () => {
    const credit = makeCredit({ client: 'Pedro', total: 320 });
    render(
      <Wrapper>
        <SaleCreditPaymentModal saleCredit={credit} isOpen={true} onClose={vi.fn()} onConfirm={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByText(/Pedro/)).toBeInTheDocument();
    expect(screen.getByText(/\$320\.00/)).toBeInTheDocument();
  });

  it('defaults the payment-type select to Efectivo', () => {
    const credit = makeCredit();
    render(
      <Wrapper>
        <SaleCreditPaymentModal saleCredit={credit} isOpen={true} onClose={vi.fn()} onConfirm={vi.fn()} />
      </Wrapper>,
    );
    const select = screen.getByLabelText('Forma de Pago') as HTMLSelectElement;
    expect(select.value).toBe(String(PaymentType.Efectivo));
  });

  it('requires a second click (confirm gate) before calling onConfirm', () => {
    const onConfirm = vi.fn();
    const credit = makeCredit({ id: 'c1' });
    render(
      <Wrapper>
        <SaleCreditPaymentModal saleCredit={credit} isOpen={true} onClose={vi.fn()} onConfirm={onConfirm} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId('sale-credit-payment-submit'));
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('sale-credit-payment-submit'));
    expect(onConfirm).toHaveBeenCalledWith('c1', PaymentType.Efectivo, '');
  });

  it('closes without confirming on Cerrar', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    const credit = makeCredit();
    render(
      <Wrapper>
        <SaleCreditPaymentModal saleCredit={credit} isOpen={true} onClose={onClose} onConfirm={onConfirm} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId('sale-credit-payment-close'));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
