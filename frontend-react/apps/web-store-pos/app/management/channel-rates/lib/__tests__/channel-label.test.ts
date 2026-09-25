import { describe, expect, it } from 'vitest';
import { Currency, SalePaymentMethod } from '@store-mgmt/domain';
import { channelLabel } from '../channel-label';

const methodLabels: Record<string, string> = {
  'CHANNEL_RATES.METHOD_EFECTIVO': 'Efectivo',
  'CHANNEL_RATES.METHOD_ZELLE': 'Zelle',
  'CHANNEL_RATES.METHOD_TRANSFERENCIA': 'Transferencia',
};

function formatMessage(id: string): string {
  return methodLabels[id] ?? id;
}

describe('channelLabel (channel-rates page, T19a)', () => {
  it('always appends the currency, even for Efectivo and Zelle', () => {
    expect(channelLabel(SalePaymentMethod.Efectivo, Currency.CUP, formatMessage)).toBe(
      'Efectivo (CUP)',
    );
    expect(channelLabel(SalePaymentMethod.Efectivo, Currency.USD, formatMessage)).toBe(
      'Efectivo (USD)',
    );
    expect(channelLabel(SalePaymentMethod.Zelle, Currency.USD, formatMessage)).toBe('Zelle (USD)');
  });

  it('renders Transferencia with its currency', () => {
    expect(channelLabel(SalePaymentMethod.Transferencia, Currency.MLC, formatMessage)).toBe(
      'Transferencia (MLC)',
    );
  });

  it('makes two Efectivo rows of different currencies distinguishable', () => {
    expect(channelLabel(SalePaymentMethod.Efectivo, Currency.CUP, formatMessage)).not.toBe(
      channelLabel(SalePaymentMethod.Efectivo, Currency.USD, formatMessage),
    );
  });
});
