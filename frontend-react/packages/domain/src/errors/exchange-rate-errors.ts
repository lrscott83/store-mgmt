import type { BaseError } from '../models/base';

/**
 * Errors for the daily USD→MN exchange-rate register. Mirrors the
 * `ExpenseErrors`/`SaleCreditErrors` pattern: hardcoded Spanish description,
 * ported verbatim.
 */
export const ExchangeRateErrors = {
  NotExists: {
    code: 'ExchangeRate.NotExists',
    description: 'El registro de cambio no existe.',
  },
} as const satisfies Record<string, BaseError>;