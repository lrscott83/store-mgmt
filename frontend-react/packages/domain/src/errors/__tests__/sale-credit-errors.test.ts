import { describe, expect, it } from 'vitest';
import { SaleCreditErrors } from '../sale-credit-errors';

// 1:1 port of Angular's frontend/src/app/domain/entities/sale-credits/sale-credit.errors.ts —
// hardcoded Spanish literal there is a copy-paste bug from ExpenseErrors ("El gasto no
// existe." — says "expense", not "credit"). Ported byte-identical (text-content artifact,
// not a logic bug) per flagged mismatch #1.
describe('SaleCreditErrors — 1:1 port of Angular sale-credit.errors.ts', () => {
  it('NotExists', () => {
    expect(SaleCreditErrors.NotExists).toEqual({
      code: 'SaleCredit.NotExists',
      description: 'El gasto no existe.',
    });
  });
});
