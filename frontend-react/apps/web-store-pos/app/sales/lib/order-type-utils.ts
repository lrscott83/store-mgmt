import { OrderType } from '@store-mgmt/domain';

/**
 * 1:1 port of Angular's `OrderTypeUtils.getOrderTypeText` (domain/entities/orders/order.model.ts).
 * Angular derives the label from the enum member NAME via a reverse lookup over
 * `Object.keys(OrderType)`, so the label is literally the enum identifier
 * ('Normal', 'Mayorista', 'Merma', 'Ajuste', 'Otro') — not an i18n key, matching
 * Angular's own template which renders this value with no `[translate]` pipe.
 */
export function getOrderTypeText(orderType: OrderType): string | undefined {
  return Object.keys(OrderType)
    .filter((key) => Number.isNaN(Number(key)))
    .find((key) => OrderType[key as keyof typeof OrderType] === orderType);
}
