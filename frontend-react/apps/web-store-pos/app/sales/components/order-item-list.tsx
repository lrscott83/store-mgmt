import { useIntl } from 'react-intl';
import type { OrderItem } from '@store-mgmt/domain';

interface OrderItemListProps {
  items: OrderItem[];
}

export function OrderItemList({ items }: OrderItemListProps) {
  const intl = useIntl();

  if (items.length === 0) {
    return (
      <p className="text-sm text-gray-400">{intl.formatMessage({ id: 'ORDERS.EMPTY_STATE' })}</p>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left text-gray-500">
          <th className="pb-1">{intl.formatMessage({ id: 'GENERAL.NAME' })}</th>
          <th className="pb-1 text-right">{intl.formatMessage({ id: 'GENERAL.QUANTITY' })}</th>
          <th className="pb-1 text-right">{intl.formatMessage({ id: 'GENERAL.PRICE' })}</th>
          <th className="pb-1 text-right">{intl.formatMessage({ id: 'GENERAL.TOTAL' })}</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item, idx) => (
          <tr key={idx} className="border-b last:border-0">
            <td className="py-1">{item.productName}</td>
            <td className="py-1 text-right">{item.quantity}</td>
            <td className="py-1 text-right">${item.price.toFixed(2)}</td>
            <td className="py-1 text-right">${(item.price * item.quantity).toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
