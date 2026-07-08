import type { BaseError } from '../models/base';

/**
 * 1:1 port of Angular's `SaleCreditErrors`
 * (frontend/src/app/domain/entities/sale-credits/sale-credit.errors.ts). Angular's
 * description literal is a copy-paste bug from `ExpenseErrors` ("El gasto no existe." —
 * says "expense", not "credit"). Preserved byte-identical (text-content artifact, not a
 * logic/behavior bug) per flagged mismatch #1.
 */
export const SaleCreditErrors = {
  NotExists: {
    code: 'SaleCredit.NotExists',
    description: 'El gasto no existe.',
  },
} as const satisfies Record<string, BaseError>;
