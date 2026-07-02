import { describe, it, expect } from 'vitest';
import { OrderType } from '@store-mgmt/domain';
import { getOrderTypeText } from '../order-type-utils';

// 1:1 port of Angular's OrderTypeUtils.getOrderTypeText (order.model.ts). Angular derives
// the label from the enum member NAME via Object.keys reverse-lookup, so labels are the
// exact enum identifiers: 'Normal', 'Mayorista', 'Merma', 'Ajuste', 'Otro'.
describe('getOrderTypeText', () => {
  it('returns "Normal" for OrderType.Normal', () => {
    expect(getOrderTypeText(OrderType.Normal)).toBe('Normal');
  });

  it('returns "Mayorista" for OrderType.Mayorista', () => {
    expect(getOrderTypeText(OrderType.Mayorista)).toBe('Mayorista');
  });
});
