import { describe, expect, it } from 'vitest';
import { WarehouseErrors } from '@store-mgmt/domain';
import {
  applyMovement,
  computeWeightedCost,
  movementDirection,
  validateMovementQuantity,
} from '../warehouse';

describe('warehouse helpers', () => {
  describe('movementDirection', () => {
    it('_in types add to onHand', () => {
      expect(movementDirection('purchase_in')).toBe(1);
      expect(movementDirection('transfer_in')).toBe(1);
    });

    it('_out types subtract from onHand', () => {
      expect(movementDirection('sale_out')).toBe(-1);
      expect(movementDirection('transfer_out')).toBe(-1);
    });
  });

  describe('applyMovement', () => {
    it('adds for _in types', () => {
      expect(applyMovement({ onHand: 10 }, 'purchase_in', 5).onHand).toBe(15);
    });

    it('subtracts for _out types', () => {
      expect(applyMovement({ onHand: 10 }, 'sale_out', 4).onHand).toBe(6);
    });

    it('accepts decimals with round2', () => {
      expect(applyMovement({ onHand: 10 }, 'purchase_in', 2.555).onHand).toBe(12.56);
      expect(applyMovement({ onHand: 10.5 }, 'sale_out', 0.25).onHand).toBe(10.25);
    });

    it('throws InsufficientStock when the result would go negative', () => {
      expect(() => applyMovement({ onHand: 10 }, 'sale_out', 10.01)).toThrowError(
        WarehouseErrors.InsufficientStock.description,
      );
    });

    it('allows exactly zero', () => {
      expect(applyMovement({ onHand: 10 }, 'sale_out', 10).onHand).toBe(0);
    });
  });

  describe('computeWeightedCost', () => {
    it('first entry uses the incoming cost', () => {
      expect(computeWeightedCost({ onHand: 0, costPrice: 0 }, 10, 700)).toBe(700);
    });

    it('recomputes weighted average across distinct costs', () => {
      // 10 @ 700 + 10 @ 500 = 20 @ 600
      expect(computeWeightedCost({ onHand: 10, costPrice: 700 }, 10, 500)).toBe(600);
    });

    it('rounds to 2 decimals', () => {
      // 3 @ 700 + 1 @ 500.555 = 4 @ 650.13875 -> 650.14
      expect(computeWeightedCost({ onHand: 3, costPrice: 700 }, 1, 500.555)).toBe(650.14);
    });
  });

  describe('validateMovementQuantity', () => {
    it('accepts positive quantities (integer and decimal)', () => {
      expect(validateMovementQuantity(1).succeeded).toBe(true);
      expect(validateMovementQuantity(2.5).succeeded).toBe(true);
    });

    it('rejects zero, negative and NaN', () => {
      expect(validateMovementQuantity(0).succeeded).toBe(false);
      expect(validateMovementQuantity(-3).succeeded).toBe(false);
      expect(validateMovementQuantity(Number.NaN).succeeded).toBe(false);
    });

    it('fails with QuantityInvalid error', () => {
      const result = validateMovementQuantity(0);
      expect(result.errors[0]).toEqual(WarehouseErrors.QuantityInvalid);
    });
  });
});