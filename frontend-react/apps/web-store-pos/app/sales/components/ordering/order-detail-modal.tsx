import { useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import { Modal } from '~/shared/components/ui/modal';
import { Spinner } from '~/shared/components/ui/spinner';
import { showBlockingError } from '~/shared/lib/blocking-alert';
import { formatCurrency } from '~/shared/lib/format-currency';
import { httpErrorKey } from '~/shared/lib/http/http-error';
import { paymentLabel, statusLabel } from '../../lib/ordering-labels';
import {
  orderingHttpService,
  OnlineOrderDeliveryType,
  type OnlineOrderDetail,
} from '../../lib/services/ordering-http-service';

interface OrderDetailModalProps {
  orderId: string | null;
  onClose: () => void;
}

export function OrderDetailModal({ orderId, onClose }: OrderDetailModalProps) {
  const intl = useIntl();
  const [order, setOrder] = useState<OnlineOrderDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    if (orderId === null) return;

    const request = ++requestId.current;
    setOrder(null);
    setLoading(true);

    void (async () => {
      try {
        const result = await orderingHttpService.getOrder(orderId);
        if (request !== requestId.current) return;
        if (result.succeeded) setOrder(result.data);
        else {
          showBlockingError(
            intl.formatMessage({ id: 'GENERAL.ERROR' }),
            intl.formatMessage({ id: 'ORDERING_ORDERS.LOAD_FAILED' }),
          );
        }
      } catch (err) {
        if (request !== requestId.current) return;
        showBlockingError(
          intl.formatMessage({ id: 'GENERAL.ERROR' }),
          intl.formatMessage({ id: httpErrorKey(err, 'ORDERING_ORDERS.LOAD_FAILED') }),
        );
      } finally {
        if (request === requestId.current) setLoading(false);
      }
    })();
  }, [intl, orderId]);

  return (
    <Modal
      open={orderId !== null}
      onClose={onClose}
      title={intl.formatMessage({ id: 'ORDERING_ORDERS.DETAILS' })}
      testId="order-detail-modal"
    >
      {loading && (
        <div className="flex justify-center py-6">
          <Spinner label={intl.formatMessage({ id: 'GENERAL.LOADING' })} />
        </div>
      )}

      {order && (
        <div className="flex flex-col gap-3 text-sm">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
            <dt className="text-text-muted">
              {intl.formatMessage({ id: 'ORDERING_ORDERS.COL_CODE' })}
            </dt>
            <dd>{order.code ?? intl.formatMessage({ id: 'ORDERING_ORDERS.NO_CODE' })}</dd>

            <dt className="text-text-muted">
              {intl.formatMessage({ id: 'ORDERING_ORDERS.COL_CUSTOMER' })}
            </dt>
            <dd>{order.customerName ?? intl.formatMessage({ id: 'ORDERING_ORDERS.NO_CUSTOMER' })}</dd>

            {order.customerPhone && (
              <>
                <dt className="text-text-muted">
                  {intl.formatMessage({ id: 'ORDERING_ORDERS.COL_PHONE' })}
                </dt>
                <dd>{order.customerPhone}</dd>
              </>
            )}

            <dt className="text-text-muted">
              {intl.formatMessage({ id: 'ORDERING_ORDERS.COL_STATUS' })}
            </dt>
            <dd>{statusLabel(intl, order.status)}</dd>

            <dt className="text-text-muted">
              {intl.formatMessage({ id: 'ORDERING_ORDERS.COL_PAYMENT' })}
            </dt>
            <dd>{paymentLabel(intl, order.paymentStatus)}</dd>

            <dt className="text-text-muted">
              {intl.formatMessage({ id: 'ORDERING_ORDERS.COL_DELIVERY_TYPE' })}
            </dt>
            <dd>
              {order.deliveryType === OnlineOrderDeliveryType.Delivery
                ? intl.formatMessage({ id: 'ORDERING_ORDERS.DELIVERY_HOME' })
                : intl.formatMessage({ id: 'ORDERING_ORDERS.DELIVERY_PICKUP' })}
            </dd>

            <dt className="text-text-muted">
              {intl.formatMessage({ id: 'ORDERING_ORDERS.COL_DATE' })}
            </dt>
            <dd>{formatOrderDate(order.date)}</dd>

            <dt className="text-text-muted">
              {intl.formatMessage({ id: 'ORDERING_ORDERS.COL_TOTAL' })}
            </dt>
            <dd className="font-semibold">{formatCurrency(order.total)}</dd>
          </dl>

          {order.deliveryAddress && (
            <p>
              <span className="text-text-muted">
                {intl.formatMessage({ id: 'ORDERING_ORDERS.DELIVERY_HOME' })}:{' '}
              </span>
              {order.deliveryAddress}
            </p>
          )}

          {order.notes && <p className="whitespace-pre-line">{order.notes}</p>}

          <ul className="flex flex-col divide-y divide-border">
            {order.lines.map((line) => (
              <li key={`${line.productId}-${line.name}`} className="flex justify-between gap-2 py-1">
                <span>
                  {line.quantity} × {line.name}
                </span>
                <span className="font-medium">{formatCurrency(line.lineTotal)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}

export function formatOrderDate(value: string): string {
  const hasZone = /[zZ]$|[+-]\d{2}:\d{2}$/.test(value);
  return new Date(hasZone ? value : `${value}Z`).toLocaleString('es-ES');
}
