import type { OrderItem } from '@store-mgmt/domain';

export interface OrderProfitResult {
  revenue: number;
  cost: number;
  profit: number;
  /** Gross margin as a percentage (0–100). Returns 0 when revenue is 0. */
  margin: number;
}

/**
 * Calculates profit for a single order item using Angular-parity formula:
 *   profit = price * quantity - sum(productCost.costPrice * productCost.quantity)
 *   margin = profit / revenue * 100  (guard: 0 when revenue = 0)
 *
 * Spec §6.5; Scenarios S-I7, S-I8.
 */
export function calculateOrderProfit(orderItem: OrderItem): OrderProfitResult {
  const revenue = orderItem.price * orderItem.quantity;
  const cost = orderItem.productCosts.reduce(
    (sum, pc) => sum + pc.costPrice * pc.quantity,
    0,
  );
  const profit = revenue - cost;
  const margin = revenue === 0 ? 0 : (profit / revenue) * 100;

  return { revenue, cost, profit, margin };
}
