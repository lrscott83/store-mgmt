import type { BaseError } from '../models/base';

/**
 * Errors for channel-rate resolution and channel-based conversion. Mirrors the
 * `ExchangeRateErrors`/`ExpenseErrors` pattern: hardcoded Spanish description.
 */
export const ChannelRateErrors = {
  RateNotFound: {
    code: 'ChannelRate.RateNotFound',
    description:
      'No existe una tasa de cambio vigente para el canal o la moneda solicitados.',
  },
} as const satisfies Record<string, BaseError>;
