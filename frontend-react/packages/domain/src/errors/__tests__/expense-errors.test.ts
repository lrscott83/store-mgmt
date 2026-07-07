import { describe, expect, it } from 'vitest';
import { ExpenseErrors } from '../expense-errors';

// 1:1 port of Angular's frontend/src/app/domain/entities/expenses/expense.errors.ts —
// hardcoded Spanish literal there (not an i18n key), byte-identical here.
describe('ExpenseErrors — 1:1 port of Angular expense.errors.ts', () => {
  it('NotExists', () => {
    expect(ExpenseErrors.NotExists).toEqual({
      code: 'Expense.NotExists',
      description: 'El gasto no existe.',
    });
  });
});
