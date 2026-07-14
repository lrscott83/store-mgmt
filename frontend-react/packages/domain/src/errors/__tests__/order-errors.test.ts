import { describe, expect, it } from 'vitest';
import { OrderErrors } from '../order-errors';

// 1:1 port of Angular's frontend/src/app/domain/entities/orders/order.errors.ts —
// hardcoded Spanish literal there (not an i18n key), byte-identical here (NOTE: unlike
// SaleCreditErrors/ExpenseErrors, Angular's Order description has NO trailing period).
describe('OrderErrors — 1:1 port of Angular order.errors.ts', () => {
  it('NotExists', () => {
    expect(OrderErrors.NotExists).toEqual({
      code: 'Order.NotExists',
      description: 'La orden no existe',
    });
  });
});
