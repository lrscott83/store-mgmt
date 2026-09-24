import { describe, expect, it } from 'vitest';
import {
  ChannelRateErrors,
  Currency,
  SalePaymentMethod,
  convertLineAmount,
} from '@store-mgmt/domain';
import type { ChannelRate } from '@store-mgmt/domain';
import type { CartItem } from '~/shared/lib/stores/cart-store';
import { convertCartLines } from '../cart-line-conversion';

/**
 * T18 diagnosis (payment-channels-and-multipayment).
 *
 * Reported: with a channel registered as Efectivo on CUP with value 720
 * (1 USD = 720 CUP) the cart refuses to change the sale currency and shows
 * `cart-currency-change-error`. These tests pin what the cascade actually does
 * for that exact scenario, and for the two plausible data misconfigurations.
 *
 * `value` semantics (models/channel-rate.ts): units of `currency` per 1 USD.
 * A USD row is a synthetic pivot (1e6) when no persisted USD row exists.
 */

const NOW = new Date('2026-09-24T12:00:00.000Z');
const TODAY = new Date('2026-09-24T00:00:00.000Z');
const TOMORROW = new Date('2026-09-25T00:00:00.000Z');

/** Correct row for the reported scenario: 720 CUP per 1 USD. */
function cupEfectivo720(effectiveFrom: Date = TODAY): ChannelRate {
  return {
    method: SalePaymentMethod.Efectivo,
    currency: Currency.CUP,
    value: 720,
    effectiveFrom,
  };
}

/** The same 720 entered on the wrong currency (USD instead of CUP). */
function usdEfectivo720(): ChannelRate {
  return {
    method: SalePaymentMethod.Efectivo,
    currency: Currency.USD,
    value: 720,
    effectiveFrom: TODAY,
  };
}

function item(currency: Currency, price: number): CartItem {
  return {
    product: { id: 'p1', name: 'Reported product', price, currency } as CartItem['product'],
    quantity: 1,
  };
}

describe('T18 diagnosis — tasa Efectivo/CUP 720 (1 USD = 720 CUP)', () => {
  it('CUP line → USD sale with a correct CUP row converts: amount_usd = amount_cup / 720', () => {
    const line = convertLineAmount(72_000, Currency.CUP, Currency.USD, [cupEfectivo720()], NOW);
    expect(line.succeeded).toBe(true);
    // 720 CUP = 72 000 cents → 100 cents = 1 USD.
    expect(line.data).toBe(100);

    const cart = convertCartLines(
      [item(Currency.CUP, 720)],
      Currency.USD,
      [cupEfectivo720()],
      NOW,
    );
    expect(cart.firstError).toBeNull();
    expect(cart.lines[0].convertedUnitPrice).toBe(1);
    expect(cart.total).toBe(1);
  });

  it('a non-exact CUP amount divides by 720 (HALF-UP)', () => {
    // 1000 CUP = 100 000 cents → 100000/720 = 138.88… → 139 cents.
    const line = convertLineAmount(100_000, Currency.CUP, Currency.USD, [cupEfectivo720()], NOW);
    expect(line.succeeded).toBe(true);
    expect(line.data).toBe(139);
  });

  it('inverse: USD line → CUP sale with a correct CUP row converts: amount_cup = amount_usd * 720', () => {
    const line = convertLineAmount(100, Currency.USD, Currency.CUP, [cupEfectivo720()], NOW);
    expect(line.succeeded).toBe(true);
    expect(line.data).toBe(72_000);

    const cart = convertCartLines([item(Currency.USD, 1)], Currency.CUP, [cupEfectivo720()], NOW);
    expect(cart.firstError).toBeNull();
    expect(cart.lines[0].convertedUnitPrice).toBe(720);
    expect(cart.total).toBe(720);
  });

  it('data cause: a row stored for USD instead of CUP fails BOTH directions', () => {
    const cupToUsd = convertLineAmount(72_000, Currency.CUP, Currency.USD, [usdEfectivo720()], NOW);
    expect(cupToUsd.succeeded).toBe(false);
    expect(cupToUsd.data).toBeUndefined();
    expect(cupToUsd.errors).toEqual([ChannelRateErrors.RateNotFound]);

    const usdToCup = convertLineAmount(100, Currency.USD, Currency.CUP, [usdEfectivo720()], NOW);
    expect(usdToCup.succeeded).toBe(false);
    expect(usdToCup.errors).toEqual([ChannelRateErrors.RateNotFound]);

    const cart = convertCartLines(
      [item(Currency.CUP, 720)],
      Currency.USD,
      [usdEfectivo720()],
      NOW,
    );
    expect(cart.lines[0].error).toEqual(ChannelRateErrors.RateNotFound);
  });

  it('data cause: a future effectiveFrom is not yet in force at `now`', () => {
    const future = cupEfectivo720(TOMORROW);
    const line = convertLineAmount(72_000, Currency.CUP, Currency.USD, [future], NOW);
    expect(line.succeeded).toBe(false);
    expect(line.errors).toEqual([ChannelRateErrors.RateNotFound]);
  });
});
