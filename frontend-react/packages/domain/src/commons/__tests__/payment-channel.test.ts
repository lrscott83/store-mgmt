import { describe, expect, it } from 'vitest';
import { Currency, SalePaymentMethod } from '../../enums';
import { paymentMethodOptionsForCurrency } from '../payment-pricing';
import { channelKey, isValidChannel, PAYMENT_CHANNELS } from '../payment-channel';

// The exact table from the plan's "Design → Catálogo de canales".
const EXPECTED_BY_CURRENCY: Record<number, SalePaymentMethod[]> = {
  [Currency.CUP]: [SalePaymentMethod.Efectivo, SalePaymentMethod.Transferencia],
  [Currency.USD]: [
    SalePaymentMethod.Efectivo,
    SalePaymentMethod.Zelle,
    SalePaymentMethod.Transferencia,
  ],
  [Currency.MLC]: [SalePaymentMethod.Transferencia],
  [Currency.CLA]: [SalePaymentMethod.Transferencia],
  [Currency.EUR]: [SalePaymentMethod.Efectivo],
  [Currency.CAD]: [SalePaymentMethod.Efectivo],
  [Currency.MXN]: [SalePaymentMethod.Efectivo],
};

const currencies = Object.values(Currency).filter((v): v is Currency => typeof v === 'number');
const methods = Object.values(SalePaymentMethod).filter(
  (v): v is SalePaymentMethod => typeof v === 'number',
);

describe('PAYMENT_CHANNELS (catálogo canónico)', () => {
  it('enumerates exactly the plan table, currency by currency', () => {
    for (const [currency, expected] of Object.entries(EXPECTED_BY_CURRENCY)) {
      const actual = PAYMENT_CHANNELS.filter(
        (channel) => Number(channel.currency) === Number(currency),
      ).map((channel) => channel.method);
      expect(actual).toEqual(expected);
    }
  });

  it('covers every Currency member and matches paymentMethodOptionsForCurrency', () => {
    for (const currency of currencies) {
      const actual = PAYMENT_CHANNELS.filter((channel) => channel.currency === currency).map(
        (channel) => channel.method,
      );
      expect(actual).toEqual(paymentMethodOptionsForCurrency(currency));
    }
  });

  it('has no duplicate channels (10 valid pairs)', () => {
    const keys = PAYMENT_CHANNELS.map((channel) => channelKey(channel.method, channel.currency));
    expect(new Set(keys).size).toBe(PAYMENT_CHANNELS.length);
    expect(PAYMENT_CHANNELS).toHaveLength(10);
  });
});

describe('channelKey', () => {
  it('is stable for the same channel', () => {
    expect(channelKey(SalePaymentMethod.Zelle, Currency.USD)).toBe(
      channelKey(SalePaymentMethod.Zelle, Currency.USD),
    );
  });

  it('is collision-free across every valid channel', () => {
    const keys = PAYMENT_CHANNELS.map((channel) => channelKey(channel.method, channel.currency));
    expect(new Set(keys).size).toBe(PAYMENT_CHANNELS.length);
  });

  it('distinguishes the same method in different currencies', () => {
    expect(channelKey(SalePaymentMethod.Transferencia, Currency.CUP)).not.toBe(
      channelKey(SalePaymentMethod.Transferencia, Currency.USD),
    );
  });
});

describe('isValidChannel', () => {
  it('accepts every catalogue channel', () => {
    for (const channel of PAYMENT_CHANNELS) {
      expect(isValidChannel(channel.method, channel.currency)).toBe(true);
    }
  });

  it('rejects the invalid combinations named in the plan', () => {
    expect(isValidChannel(SalePaymentMethod.Zelle, Currency.CUP)).toBe(false);
    expect(isValidChannel(SalePaymentMethod.Efectivo, Currency.MLC)).toBe(false);
  });

  it('rejects every (method, currency) pair outside the catalogue', () => {
    let valid = 0;
    let invalid = 0;
    for (const currency of currencies) {
      for (const method of methods) {
        if (isValidChannel(method, currency)) valid += 1;
        else invalid += 1;
      }
    }
    expect(valid).toBe(PAYMENT_CHANNELS.length);
    expect(valid + invalid).toBe(currencies.length * methods.length);
    expect(invalid).toBe(11);
  });
});
