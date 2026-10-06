import { describe, expect, it } from 'vitest';
import { Currency, SalePaymentMethod } from '@store-mgmt/domain';
import type { ChannelRate } from '@store-mgmt/domain';
import { settleMultiPayments } from '../multi-payment-settlement';
import type { MultiPaymentRow } from '../multi-payment-list';

/**
 * multipayments + payment-snapshot-completeness (2026-10-06): the settlement now
 * freezes BOTH the source-channel rate and the order-currency (target) rate, plus
 * the id/effectiveFrom provenance of each, so a later rate row can never rewrite
 * what the sale actually used. A same-currency row is an exact identity: both rates
 * are 1 with no provenance.
 */

const AT = new Date('2026-09-18T12:00:00.000Z');
const EFFECTIVE_FROM = new Date('2026-09-01T00:00:00.000Z');

function rate(
  currency: Currency,
  id: string,
  value: number,
  method: SalePaymentMethod = SalePaymentMethod.Efectivo,
): ChannelRate {
  return { method, currency, id, buyValue: value, sellValue: value, effectiveFrom: EFFECTIVE_FROM };
}

function row(overrides: Partial<MultiPaymentRow> = {}): MultiPaymentRow {
  return {
    id: 'row-1',
    method: SalePaymentMethod.Efectivo,
    currency: Currency.CUP,
    amount: 5,
    ...overrides,
  };
}

describe('settleMultiPayments — frozen source + target rate snapshot', () => {
  it('a same-currency row is an identity: rate 1 on both sides with no provenance', () => {
    const settlement = settleMultiPayments([row({ amount: 5 })], Currency.CUP, 5, [], AT);

    expect(settlement.orderPayments).toHaveLength(1);
    expect(settlement.orderPayments[0]).toEqual({
      method: SalePaymentMethod.Efectivo,
      currency: Currency.CUP,
      amount: 5,
      rateApplied: 1,
      rateId: null,
      rateMethod: null,
      rateCurrency: null,
      rateEffectiveFrom: null,
      targetRateApplied: 1,
      targetRateId: null,
      targetRateEffectiveFrom: null,
      amountInOrderCurrency: 5,
    });
  });

  it('a cross-currency row freezes the source rate and the order-currency rate with their ids', () => {
    // Order currency CUP; the row pays in USD. USD row = source, CUP row = target.
    const rates = [
      rate(Currency.USD, 'usd-rate', 1),
      rate(Currency.CUP, 'cup-rate', 350),
    ];
    const settlement = settleMultiPayments(
      [row({ method: SalePaymentMethod.Efectivo, currency: Currency.USD, amount: 10 })],
      Currency.CUP,
      3500,
      rates,
      AT,
    );

    expect(settlement.firstError).toBeNull();
    expect(settlement.orderPayments).toHaveLength(1);
    expect(settlement.orderPayments[0]).toEqual({
      method: SalePaymentMethod.Efectivo,
      currency: Currency.USD,
      amount: 10,
      // Source: USD row used to buy the source currency (buyValue 1).
      rateApplied: 1,
      rateId: 'usd-rate',
      rateMethod: SalePaymentMethod.Efectivo,
      rateCurrency: Currency.USD,
      rateEffectiveFrom: EFFECTIVE_FROM,
      // Target: CUP row (buyValue 350 = moneda-por-USD of the sale currency).
      targetRateApplied: 350,
      targetRateId: 'cup-rate',
      targetRateEffectiveFrom: EFFECTIVE_FROM,
      // 10 USD × 350 CUP/USD = 3500 CUP.
      amountInOrderCurrency: 3500,
    });
  });
});
