import { describe, expect, it } from 'vitest';
import { calculateOrderProfit } from '../profit-calculator';
import type { OrderItem } from '@store-mgmt/domain';

function makeOrderItem(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    productId: 'p1',
    productName: 'ProductA',
    categoryId: 'cat1',
    categoryName: 'Category',
    name: 'ProductA',
    quantity: 1,
    price: 5,
    productBusinessId: 'biz1',
    productCosts: [],
    order: 0,
    ...overrides,
  };
}

describe('calculateOrderProfit', () => {
  describe('PROFIT-01: S-I7 — basic profit calculation', () => {
    // S-I7: price=5, qty=2, productCosts=[{costPrice:2.5, qty:2}]
    // revenue=10, cost=5, profit=5, margin=50%
    it('calculates revenue as price * quantity', () => {
      const item = makeOrderItem({ price: 5, quantity: 2, productCosts: [] });
      const result = calculateOrderProfit(item);
      expect(result.revenue).toBe(10);
    });

    it('calculates cost as sum of productCosts', () => {
      const item = makeOrderItem({
        price: 5,
        quantity: 2,
        productCosts: [{ id: 'e1', costPrice: 2.5, quantity: 2 }],
      });
      const result = calculateOrderProfit(item);
      expect(result.cost).toBe(5);
    });

    it('calculates profit as revenue - cost (S-I7 exact values)', () => {
      const item = makeOrderItem({
        price: 5,
        quantity: 2,
        productCosts: [{ id: 'e1', costPrice: 2.5, quantity: 2 }],
      });
      const result = calculateOrderProfit(item);
      expect(result.profit).toBe(5);
    });

    it('calculates margin as profit/revenue * 100 (S-I7: 50%)', () => {
      const item = makeOrderItem({
        price: 5,
        quantity: 2,
        productCosts: [{ id: 'e1', costPrice: 2.5, quantity: 2 }],
      });
      const result = calculateOrderProfit(item);
      expect(result.margin).toBe(50);
    });
  });

  describe('PROFIT-02: S-I8 — multi-cost entries', () => {
    it('sums multiple productCosts entries correctly', () => {
      const item = makeOrderItem({
        price: 10,
        quantity: 3,
        productCosts: [
          { id: 'e1', costPrice: 2.0, quantity: 2 },
          { id: 'e2', costPrice: 3.0, quantity: 1 },
        ],
      });
      // revenue=30, cost=4+3=7, profit=23
      const result = calculateOrderProfit(item);
      expect(result.revenue).toBe(30);
      expect(result.cost).toBe(7);
      expect(result.profit).toBe(23);
    });
  });

  describe('PROFIT-03: divide-by-zero guard', () => {
    it('returns margin=0 when revenue is 0 (guard divide-by-zero)', () => {
      const item = makeOrderItem({ price: 0, quantity: 2, productCosts: [] });
      const result = calculateOrderProfit(item);
      expect(result.margin).toBe(0);
    });
  });

  describe('PROFIT-04: zero cost product', () => {
    it('returns profit=revenue when productCosts is empty', () => {
      const item = makeOrderItem({ price: 10, quantity: 2, productCosts: [] });
      const result = calculateOrderProfit(item);
      expect(result.cost).toBe(0);
      expect(result.profit).toBe(20);
      expect(result.margin).toBe(100);
    });
  });
});
