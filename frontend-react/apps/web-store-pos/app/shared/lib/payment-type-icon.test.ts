import { describe, it, expect } from 'vitest';
import { PaymentType } from '@store-mgmt/domain';
import { getPaymentTypeIconKind } from './payment-type-icon';

// 1:1 semantic port of Angular's PaymentTypeUtils.getPaymentTypeIcon (bi-cash-stack /
// bi-credit-card / bi-phone / bi-currency-dollar default). React renders inline SVGs
// instead of bootstrap-icon classes, so this pure function returns a discriminant key
// consumed by the component to pick the matching inline SVG.
describe('getPaymentTypeIconKind', () => {
  it('returns "cash" for PaymentType.Efectivo', () => {
    expect(getPaymentTypeIconKind(PaymentType.Efectivo)).toBe('cash');
  });

  it('returns "card" for PaymentType.Tarjeta', () => {
    expect(getPaymentTypeIconKind(PaymentType.Tarjeta)).toBe('card');
  });

  it('returns "phone" for PaymentType.Zelle', () => {
    expect(getPaymentTypeIconKind(PaymentType.Zelle)).toBe('phone');
  });

  it('returns "dollar" as the default for an unrecognized value', () => {
    expect(getPaymentTypeIconKind(999 as PaymentType)).toBe('dollar');
  });
});
