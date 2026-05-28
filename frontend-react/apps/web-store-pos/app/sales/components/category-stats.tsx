import { useIntl } from 'react-intl';
import type { Order } from '@store-mgmt/domain';

interface CategoryStat {
  categoryId: string;
  categoryName: string;
  revenue: number;
  itemsSold: number;
}

interface CategoryStatsProps {
  orders: Order[];
}

function computeCategoryStats(orders: Order[]): CategoryStat[] {
  const map = new Map<string, CategoryStat>();

  for (const order of orders) {
    if (!order.isActive) continue;
    for (const item of order.orderItems) {
      const existing = map.get(item.categoryId);
      if (existing) {
        existing.revenue += item.price * item.quantity;
        existing.itemsSold += item.quantity;
      } else {
        map.set(item.categoryId, {
          categoryId: item.categoryId,
          categoryName: item.categoryName,
          revenue: item.price * item.quantity,
          itemsSold: item.quantity,
        });
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
}

export function CategoryStats({ orders }: CategoryStatsProps) {
  const intl = useIntl();
  const stats = computeCategoryStats(orders);

  if (stats.length === 0) {
    return (
      <p className="text-sm text-gray-400">
        {intl.formatMessage({ id: 'ORDERS.EMPTY_STATE' })}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {stats.map((stat) => (
        <div key={stat.categoryId} className="flex items-center justify-between rounded border p-3">
          <div>
            <p className="font-medium text-gray-800">{stat.categoryName}</p>
            <p className="text-xs text-gray-500">
              {intl.formatMessage({ id: 'ORDERS.ITEMS_COUNT' })}: {stat.itemsSold}
            </p>
          </div>
          <p className="font-semibold text-gray-800">${stat.revenue.toFixed(2)}</p>
        </div>
      ))}
    </div>
  );
}
