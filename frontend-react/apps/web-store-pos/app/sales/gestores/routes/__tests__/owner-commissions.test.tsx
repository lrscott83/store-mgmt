import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  pay: vi.fn(),
  getManagers: vi.fn(),
  confirmDialog: vi.fn(),
  showBlockingError: vi.fn(),
  showToastSuccess: vi.fn(),
}));

vi.mock('~/auth/routes/loaders', () => ({ featureLoader: () => null }));
vi.mock('~/sales/gestores/lib/owner-commissions-http-service', () => ({
  ownerCommissionsHttpService: {
    list: mocks.list,
    pay: mocks.pay,
    getManagers: mocks.getManagers,
  },
}));
vi.mock('~/shared/lib/blocking-alert', () => ({
  confirmDialog: mocks.confirmDialog,
  showBlockingError: mocks.showBlockingError,
}));
vi.mock('~/shared/lib/toast', () => ({
  showToastSuccess: mocks.showToastSuccess,
}));

import OwnerCommissionsPage from '../owner-commissions';

const commission = {
  id: 'c1',
  salesManagerId: 'm1',
  salesManagerName: 'Gestor Uno',
  salesManagerLogin: 'gestor@test.com',
  orderId: 'o1',
  orderCode: 'PED-1',
  orderDate: '2026-10-20T09:00:00Z',
  storeId: 's1',
  storeName: 'Tienda',
  productName: 'Camisa',
  quantity: 2,
  type: 2,
  value: 5,
  unitPrice: 50,
  amount: 10,
  currency: 0,
  status: 0,
  paidAt: null,
  paymentNote: null,
};

function renderPage() {
  return render(
    <IntlProvider locale="es" defaultLocale="es" messages={esMessages}>
      <OwnerCommissionsPage />
    </IntlProvider>,
  );
}

describe('OwnerCommissionsPage — lista y pago completo (T10)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.list.mockResolvedValue({ succeeded: true, data: [commission] });
    mocks.getManagers.mockResolvedValue({
      succeeded: true,
      data: [{ id: 'm1', userId: 'u1', login: 'gestor@test.com', fullName: 'Gestor Uno', isActive: true }],
    });
    mocks.pay.mockResolvedValue({ succeeded: true, data: true });
    mocks.confirmDialog.mockResolvedValue(true);
  });

  it('muestra la comisión pendiente con su gestor y pedido', async () => {
    renderPage();

    expect(await screen.findByText('PED-1')).toBeInTheDocument();
    const table = screen.getByTestId('owner-commissions');
    expect(within(table).getByText('Gestor Uno')).toBeInTheDocument();
    expect(
      within(table).getByText(esMessages['OWNER_COMMISSIONS.PENDING']),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole('button', { name: esMessages['OWNER_COMMISSIONS.PAY'] }),
    ).toBeInTheDocument();
  });

  it('confirma, paga y recarga la lista', async () => {
    renderPage();
    await screen.findByText('PED-1');

    fireEvent.click(
      screen.getByRole('button', { name: esMessages['OWNER_COMMISSIONS.PAY'] }),
    );

    await waitFor(() => expect(mocks.pay).toHaveBeenCalledWith('c1'));
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(2));
    expect(mocks.showToastSuccess).toHaveBeenCalled();
  });

  it('si el Owner cancela, no paga', async () => {
    mocks.confirmDialog.mockResolvedValue(false);
    renderPage();
    await screen.findByText('PED-1');

    fireEvent.click(
      screen.getByRole('button', { name: esMessages['OWNER_COMMISSIONS.PAY'] }),
    );

    await waitFor(() => expect(mocks.confirmDialog).toHaveBeenCalled());
    expect(mocks.pay).not.toHaveBeenCalled();
  });

  it('muestra el error de carga sin tumbar la pantalla', async () => {
    mocks.list.mockRejectedValue(new Error('offline'));
    renderPage();

    expect(await screen.findByTestId('owner-commissions-error')).toBeInTheDocument();
  });
});
