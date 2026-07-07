import type { BaseError } from '../models/base';

/**
 * 1:1 port of Angular's `ExpenseErrors`
 * (frontend/src/app/domain/entities/expenses/expense.errors.ts). Angular hardcodes the
 * Spanish description literal directly in this class (not routed through i18n) — ported
 * verbatim, byte-identical.
 */
export const ExpenseErrors = {
  NotExists: {
    code: 'Expense.NotExists',
    description: 'El gasto no existe.',
  },
} as const satisfies Record<string, BaseError>;
