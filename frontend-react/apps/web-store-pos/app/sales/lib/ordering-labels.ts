import type { useIntl } from 'react-intl';
import { OnlineOrderPaymentStatus, OnlineOrderStatus } from './services/ordering-http-service';

type Intl = ReturnType<typeof useIntl>;

const STATUS_MESSAGE_IDS: Record<OnlineOrderStatus, string> = {
  [OnlineOrderStatus.Creado]: 'ORDERING_ORDERS.STATUS_CREADO',
  [OnlineOrderStatus.Preparado]: 'ORDERING_ORDERS.STATUS_PREPARADO',
  [OnlineOrderStatus.Transportando]: 'ORDERING_ORDERS.STATUS_TRANSPORTANDO',
  [OnlineOrderStatus.Entregado]: 'ORDERING_ORDERS.STATUS_ENTREGADO',
  [OnlineOrderStatus.Cancelado]: 'ORDERING_ORDERS.STATUS_CANCELADO',
};

export function statusLabel(intl: Intl, status: OnlineOrderStatus): string {
  return intl.formatMessage({ id: STATUS_MESSAGE_IDS[status] });
}

export function paymentLabel(intl: Intl, status: OnlineOrderPaymentStatus): string {
  return intl.formatMessage({
    id:
      status === OnlineOrderPaymentStatus.Paid
        ? 'ORDERING_ORDERS.PAYMENT_PAID'
        : 'ORDERING_ORDERS.PAYMENT_PENDING',
  });
}
