import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import { OrderDetailModal } from '../ordering/order-detail-modal';
import {
  OnlineOrderDeliveryType,
  OnlineOrderPaymentStatus,
  OnlineOrderStatus,
  orderingHttpService,
  type OnlineOrderDetail,
} from '../../lib/services/ordering-http-service';

vi.mock('../../lib/services/ordering-http-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/services/ordering-http-service')>();
  return {
    ...actual,
    orderingHttpService: { getOrder: vi.fn() },
  };
});

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

function makeDetail(overrides: Partial<OnlineOrderDetail> = {}): OnlineOrderDetail {
  return {
    id: 'o1',
    code: 'PED-1',
    customerName: 'Marta',
    customerPhone: '555',
    deliveryType: OnlineOrderDeliveryType.Pickup,
    total: 10,
    currency: 0,
    status: OnlineOrderStatus.Entregado,
    paymentStatus: OnlineOrderPaymentStatus.Paid,
    paidAt: '2026-10-26T15:05:00Z',
    driverId: null,
    driverName: null,
    date: '2026-10-26T14:00:00Z',
    deliveryAddress: null,
    notes: null,
    lines: [],
    ...overrides,
  };
}

function respondWith(order: OnlineOrderDetail): void {
  vi.mocked(orderingHttpService.getOrder).mockResolvedValue({
    data: order,
    succeeded: true,
    message: null,
    actionCode: null,
    errors: [],
  });
}

describe('OrderDetailModal — paid date', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the paid date of a paid order', async () => {
    respondWith(makeDetail());

    render(
      <Wrapper>
        <OrderDetailModal orderId="o1" onClose={() => {}} />
      </Wrapper>,
    );

    await waitFor(() => expect(screen.getByText('PED-1')).toBeTruthy());
    const label = screen.getByText('Fecha de pago');
    expect(label.nextElementSibling?.textContent).toBe(
      new Date('2026-10-26T15:05:00Z').toLocaleString('es-ES'),
    );
  });

  it('shows no paid date while the order is pending', async () => {
    respondWith(
      makeDetail({ paymentStatus: OnlineOrderPaymentStatus.Pending, paidAt: null }),
    );

    render(
      <Wrapper>
        <OrderDetailModal orderId="o1" onClose={() => {}} />
      </Wrapper>,
    );

    await waitFor(() => expect(screen.getByText('PED-1')).toBeTruthy());
    expect(screen.queryByText('Fecha de pago')).toBeNull();
  });
});
