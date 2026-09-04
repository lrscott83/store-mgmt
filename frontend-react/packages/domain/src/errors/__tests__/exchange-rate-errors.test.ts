import { describe, expect, it } from 'vitest';
import { ExchangeRateErrors } from '../exchange-rate-errors';

describe('ExchangeRateErrors', () => {
  it('NotExists carries the ExchangeRate.NotExists code', () => {
    expect(ExchangeRateErrors.NotExists).toEqual({
      code: 'ExchangeRate.NotExists',
      description: 'El registro de cambio no existe.',
    });
  });
});
