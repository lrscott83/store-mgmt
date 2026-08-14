import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { SaleCredit } from '@store-mgmt/domain';
import { PaymentType } from '@store-mgmt/domain';

// Angular's sale-credit-payment-modal.component.ts:52-78 uses SweetAlert2 for BOTH the
// payment confirm step AND the failure error dialog — mock the shared wrapper module so
// tests control resolution deterministically (not window.confirm/alert or raw Swal).
const confirmDialogMock = vi.fn();
const showBlockingErrorMock = vi.fn();
vi.mock('~/shared/lib/blocking-alert', () => ({
  confirmDialog: (...args: unknown[]) => confirmDialogMock(...args),
  showBlockingError: (...args: unknown[]) => showBlockingErrorMock(...args),
}));

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
      makeCredit({ id: 'c1', isPaid: true, paidDate: new Date(2025, 2, 5) }),
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

  it('S-GM-SALE-CREDIT-1: unpaid credit shows Editar (text-primary) and Pagar por (text-success)', () => {
    const credits = [makeCredit({ id: 'c1', paid: 0 })];
    render(
      <Wrapper>
        <SaleCreditList saleCredits={credits} readOnly={false} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId('sale-credit-actions-toggle-c1'));
    expect(screen.getByRole('menuitem', { name: 'Editar' })).toHaveClass('text-primary');
    expect(screen.getByRole('menuitem', { name: 'Pagar' })).toHaveClass('text-success');
  });

  it('S-GM-SALE-CREDIT-2: paid credit hides Pagar por', () => {
    const credits = [makeCredit({ id: 'c1', paid: 200, total: 200 })];
    render(
      <Wrapper>
        <SaleCreditList saleCredits={credits} readOnly={false} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId('sale-credit-actions-toggle-c1'));
    expect(screen.getByRole('menuitem', { name: 'Editar' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Pagar' })).not.toBeInTheDocument();
  });

  it('S-GM-SALE-CREDIT-3: opening row A does not open row B', () => {
    const credits = [
      makeCredit({ id: 'c1', client: 'Row A' }),
      makeCredit({ id: 'c2', client: 'Row B' }),
    ];
    render(
      <Wrapper>
        <SaleCreditList saleCredits={credits} readOnly={false} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId('sale-credit-actions-toggle-c1'));
    expect(screen.getAllByRole('menu')).toHaveLength(1);
  });
});

// --- EditSaleCreditModal (matches Angular's edit-sale-credit-modal.component: client + note only) ---
import { EditSaleCreditModal } from '../edit-sale-credit-modal';

describe('EditSaleCreditModal', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

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
    const onSave = vi.fn().mockReturnValue(true);
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

  // Angular: edit-sale-credit-modal.component.ts:60-71 — on `updateSaleCredit` failure,
  // Swal.fire({ icon: 'error', title: GENERAL.ERROR, text: dataEntry.errors[0].description });
  // modal stays open (no closeModal() call in the else branch).
  it('shows a blocking error and does NOT close when onSave reports failure', () => {
    const onSave = vi.fn().mockReturnValue(false);
    const onClose = vi.fn();
    const credit = makeCredit({ id: 'c1', client: 'Ana' });
    render(
      <Wrapper>
        <EditSaleCreditModal saleCredit={credit} isOpen={true} onClose={onClose} onSave={onSave} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId('edit-sale-credit-submit'));
    expect(onClose).not.toHaveBeenCalled();
    expect(showBlockingErrorMock).toHaveBeenCalledWith('Error', 'El gasto no existe.');
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

  // Angular: edit-sale-credit-modal.component.html:43-49 — mat-fab extended
  // Cerrar/Pagar buttons carry `close`/`payment` mat-icons; header close is a
  // glyph button (not a literal "✕" text character).
  describe('CloseIcon/PaymentIcon parity (edit-sale-credit-modal.component.html:43-49)', () => {
    it('renders a CloseIcon svg in the header close control, not a literal "✕" character', () => {
      const credit = makeCredit();
      render(
        <Wrapper>
          <EditSaleCreditModal saleCredit={credit} isOpen={true} onClose={vi.fn()} onSave={vi.fn()} />
        </Wrapper>,
      );
      const headerClose = screen.getByTestId('edit-sale-credit-close-x');
      expect(headerClose).not.toHaveTextContent('✕');
      expect(headerClose.querySelector('svg')).not.toBeNull();
    });

    it('renders a CloseIcon svg inside the footer close button', () => {
      const credit = makeCredit();
      render(
        <Wrapper>
          <EditSaleCreditModal saleCredit={credit} isOpen={true} onClose={vi.fn()} onSave={vi.fn()} />
        </Wrapper>,
      );
      expect(screen.getByTestId('edit-sale-credit-close').querySelector('svg')).not.toBeNull();
    });

    it('renders a PaymentIcon (card glyph) svg (not SaveIcon) inside the footer submit button', () => {
      const credit = makeCredit();
      render(
        <Wrapper>
          <EditSaleCreditModal saleCredit={credit} isOpen={true} onClose={vi.fn()} onSave={vi.fn()} />
        </Wrapper>,
      );
      const path = screen
        .getByTestId('edit-sale-credit-submit')
        .querySelector('svg path')
        ?.getAttribute('d');
      // Angular renders <mat-icon>payment</mat-icon> (credit-card glyph) — PaymentIcon's
      // distinctive card path, not the `payments`/cash glyph ("3 6h18M3 6v12") nor SaveIcon.
      expect(path).toContain('M2 10h20M6 15h4');
    });
  });
});

// --- SaleCreditPaymentModal (matches Angular's sale-credit-payment-modal.component) ---
import { SaleCreditPaymentModal } from '../sale-credit-payment-modal';

describe('SaleCreditPaymentModal', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

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

  // Angular: Swal.fire({ title: SALE_CREDIT.PAYMENT_CONFIRM_TITLE, text:
  // SALE_CREDIT.PAYMENT_CONFIRM_MESSAGE, icon: 'question', showCancelButton: true,
  // confirmButtonColor: '#3456ff', cancelButtonColor: '#dc3545', confirmButtonText: YES,
  // cancelButtonText: NO }) — onConfirm only runs when `result.isConfirmed`
  // (sale-credit-payment-modal.component.ts:52-78).
  it('shows a SweetAlert2 confirm dialog and only pays when confirmed', async () => {
    const onConfirm = vi.fn().mockReturnValue(true);
    const credit = makeCredit({ id: 'c1' });
    confirmDialogMock.mockResolvedValue(true);
    render(
      <Wrapper>
        <SaleCreditPaymentModal saleCredit={credit} isOpen={true} onClose={vi.fn()} onConfirm={onConfirm} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId('sale-credit-payment-submit'));
    expect(confirmDialogMock).toHaveBeenCalledWith({
      title: 'Confirmación de Pago',
      message: 'Usted está segura(o) que desea pagar este crédito por venta?',
      confirmButtonText: 'Si',
      cancelButtonText: 'No',
    });
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('c1', PaymentType.Efectivo, ''));
  });

  it('does not pay when the SweetAlert2 confirm dialog is cancelled', async () => {
    const onConfirm = vi.fn();
    const credit = makeCredit({ id: 'c1' });
    confirmDialogMock.mockResolvedValue(false);
    render(
      <Wrapper>
        <SaleCreditPaymentModal saleCredit={credit} isOpen={true} onClose={vi.fn()} onConfirm={onConfirm} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId('sale-credit-payment-submit'));
    await waitFor(() => expect(confirmDialogMock).toHaveBeenCalled());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  // Angular: sale-credit-payment-modal.component.ts:70-76 — on `paidSaleCredit` failure,
  // Swal.fire({ icon: 'error', title: GENERAL.ERROR, text: dataEntry.errors[0].description });
  // modal stays open (no closeModal() call in the else branch).
  it('shows a blocking error and does NOT close when onConfirm reports failure', async () => {
    const onConfirm = vi.fn().mockReturnValue(false);
    const onClose = vi.fn();
    const credit = makeCredit({ id: 'c1' });
    confirmDialogMock.mockResolvedValue(true);
    render(
      <Wrapper>
        <SaleCreditPaymentModal saleCredit={credit} isOpen={true} onClose={onClose} onConfirm={onConfirm} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId('sale-credit-payment-submit'));
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
    expect(showBlockingErrorMock).toHaveBeenCalledWith('Error', 'El gasto no existe.');
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

  // Angular: sale-credit-payment-modal.component.html:33-39 — mat-fab extended
  // Cerrar/Pagar buttons carry `close`/`payment` mat-icons; header close is a
  // glyph button (not a literal "✕" text character).
  describe('CloseIcon/PaymentIcon parity (sale-credit-payment-modal.component.html:33-39)', () => {
    it('renders a CloseIcon svg in the header close control, not a literal "✕" character', () => {
      const credit = makeCredit();
      render(
        <Wrapper>
          <SaleCreditPaymentModal saleCredit={credit} isOpen={true} onClose={vi.fn()} onConfirm={vi.fn()} />
        </Wrapper>,
      );
      const headerClose = screen.getByTestId('sale-credit-payment-close-x');
      expect(headerClose).not.toHaveTextContent('✕');
      expect(headerClose.querySelector('svg')).not.toBeNull();
    });

    it('renders a CloseIcon svg inside the footer close button', () => {
      const credit = makeCredit();
      render(
        <Wrapper>
          <SaleCreditPaymentModal saleCredit={credit} isOpen={true} onClose={vi.fn()} onConfirm={vi.fn()} />
        </Wrapper>,
      );
      expect(screen.getByTestId('sale-credit-payment-close').querySelector('svg')).not.toBeNull();
    });

    it('renders a PaymentIcon (card glyph) svg (not SaveIcon) inside the footer submit button', () => {
      const credit = makeCredit();
      render(
        <Wrapper>
          <SaleCreditPaymentModal saleCredit={credit} isOpen={true} onClose={vi.fn()} onConfirm={vi.fn()} />
        </Wrapper>,
      );
      const path = screen
        .getByTestId('sale-credit-payment-submit')
        .querySelector('svg path')
        ?.getAttribute('d');
      // Angular renders <mat-icon>payment</mat-icon> (credit-card glyph) — PaymentIcon's
      // distinctive card path, not the `payments`/cash glyph ("3 6h18M3 6v12") nor SaveIcon.
      expect(path).toContain('M2 10h20M6 15h4');
    });
  });
});
