import type { BaseError } from '../models/base';

/**
 * 1:1 port of Angular's `OrderErrors`
 * (frontend/src/app/domain/entities/orders/order.errors.ts). Unlike
 * `SaleCreditErrors`/`ExpenseErrors`, Angular's description literal here has NO trailing
 * period — preserved byte-identical.
 */
export const OrderErrors = {
  NotExists: {
    code: 'Order.NotExists',
    description: 'La orden no existe',
  },
} as const satisfies Record<string, BaseError>;
