import { describe, expect, it } from 'vitest';
import { WarehouseErrors } from '@store-mgmt/domain';
import {
  applyMovement,
  attributePurchaseOutflow,
  computeWeightedCost,
  displayCost,
  movementDirection,
  reversalDirection,
  splitByFifoLots,
  summarizeOrderImpact,
  synthesizeLotFromLevel,
  validateMovementQuantity,
  validateReversalQuantity,
} from '../warehouse';
import { remainingPurchaseUnits } from '../warehouse';

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
      expect(validateMovementQuantity(0.001).succeeded).toBe(true);
    });

    it('rejects zero, negative and NaN', () => {
      expect(validateMovementQuantity(0).succeeded).toBe(false);
      expect(validateMovementQuantity(-1).succeeded).toBe(false);
      expect(validateMovementQuantity(-3).succeeded).toBe(false);
      expect(validateMovementQuantity(Number.NaN).succeeded).toBe(false);
    });

    it('rejects Infinity and -Infinity (Number.isFinite boundary)', () => {
      expect(validateMovementQuantity(Number.POSITIVE_INFINITY).succeeded).toBe(false);
      expect(validateMovementQuantity(Number.NEGATIVE_INFINITY).succeeded).toBe(false);
    });

    it('fails with QuantityInvalid error', () => {
      const result = validateMovementQuantity(0);
      expect(result.errors[0]).toEqual(WarehouseErrors.QuantityInvalid);
    });
  });

  // ─── Plan 2026-09-09: lotes FIFO exactos + reversa (D8-D12) ──────────────

  describe('reversalDirection (U-D1)', () => {
    it('reversing a purchase subtracts from onHand', () => {
      expect(reversalDirection('purchase_in')).toBe(-1);
    });

    it('reversing a sale_out re-acredits onHand', () => {
      expect(reversalDirection('sale_out')).toBe(1);
    });

    it('reversing a transfer_out: +1 origin, -1 destination', () => {
      expect(reversalDirection('transfer_out')).toBe(1);
    });

    it('reversing a transfer_in: -1 (its warehouseId is the destination)', () => {
      expect(reversalDirection('transfer_in')).toBe(-1);
    });
  });

  describe('splitByFifoLots (U-D4)', () => {
    it('splits a quantity across lots oldest-first (10@$5 + 10@$10, take 15)', () => {
      const lots = [
        { costPrice: 5, quantity: 10 },
        { costPrice: 10, quantity: 10 },
      ];
      expect(splitByFifoLots(lots, 15)).toEqual([
        { costPrice: 5, quantity: 10 },
        { costPrice: 10, quantity: 5 },
      ]);
    });

    it('single slice when the quantity matches one lot exactly (15 over 15@$5)', () => {
      expect(splitByFifoLots([{ costPrice: 5, quantity: 15 }], 15)).toEqual([
        { costPrice: 5, quantity: 15 },
      ]);
    });

    it('single slice when the quantity stays inside the oldest lot', () => {
      expect(splitByFifoLots([{ costPrice: 5, quantity: 10 }, { costPrice: 10, quantity: 10 }], 7)).toEqual([
        { costPrice: 5, quantity: 7 },
      ]);
    });

    it('returns [] when the quantity is 0', () => {
      expect(splitByFifoLots([{ costPrice: 5, quantity: 10 }], 0)).toEqual([]);
    });

    it('rounds each slice to 2 decimals (1.555 over a 1-unit lot crosses into the next)', () => {
      const lots = [{ costPrice: 3.333, quantity: 1 }, { costPrice: 7, quantity: 1 }];
      expect(splitByFifoLots(lots, 1.555)).toEqual([
        { costPrice: 3.333, quantity: 1 },
        { costPrice: 7, quantity: 0.56 }, // round2(1.555) - 1 = 0.56 (redondeo por tramo)
      ]);
    });

    it('rounds a within-lot slice to 2 decimals', () => {
      expect(splitByFifoLots([{ costPrice: 3.333, quantity: 2 }], 1.555)).toEqual([
        { costPrice: 3.333, quantity: 1.56 },
      ]);
    });

    it('throws InsufficientStock when the lots cannot cover the quantity', () => {
      expect(() => splitByFifoLots([{ costPrice: 5, quantity: 3 }], 4)).toThrowError(
        WarehouseErrors.InsufficientStock.description,
      );
    });

    it('treats empty lots as zero stock', () => {
      expect(() => splitByFifoLots([], 1)).toThrowError(WarehouseErrors.InsufficientStock.description);
    });
  });

  describe('displayCost (U-D5)', () => {
    it('single lot displays its exact cost', () => {
      expect(displayCost([{ costPrice: 660, quantity: 24 }])).toBe(660);
    });

    it('weighted average of remaining lots (10@$10 + 10@$30 → $20)', () => {
      expect(
        displayCost([
          { costPrice: 10, quantity: 10 },
          { costPrice: 30, quantity: 10 },
        ]),
      ).toBe(20);
    });

    it('GAP-3 numbers hold: 10@$6 + 5@$10 → $7.33', () => {
      expect(
        displayCost([
          { costPrice: 6, quantity: 10 },
          { costPrice: 10, quantity: 5 },
        ]),
      ).toBe(7.33);
    });

    it('returns 0 when no lots remain', () => {
      expect(displayCost([])).toBe(0);
    });
  });

  describe('validateReversalQuantity (U-D3)', () => {
    it('accepts positive quantities (integer and decimal)', () => {
      expect(validateReversalQuantity(5).succeeded).toBe(true);
      expect(validateReversalQuantity(2.5).succeeded).toBe(true);
    });

    it('rejects zero, negative and NaN with QuantityInvalid', () => {
      expect(validateReversalQuantity(0).succeeded).toBe(false);
      expect(validateReversalQuantity(-2).succeeded).toBe(false);
      expect(validateReversalQuantity(Number.NaN).succeeded).toBe(false);
      expect(validateReversalQuantity(0).errors[0]).toEqual(WarehouseErrors.QuantityInvalid);
    });
  });

  describe('legacy levels → synthetic lot (U-D6)', () => {
    it('synthesizeLotFromLevel treats a level without lots as one lot at its average cost', () => {
      expect(synthesizeLotFromLevel({ onHand: 10, costPrice: 7.5 })).toEqual([
        { costPrice: 7.5, quantity: 10 },
      ]);
    });

    it('synthesizeLotFromLevel with zero onHand returns an empty lot list', () => {
      expect(synthesizeLotFromLevel({ onHand: 0, costPrice: 7.5 })).toEqual([]);
    });
  });

  // Plan 2026-09-16 (A1): el tope editable de una compra es lo que QUEDA, y debe
  // salir de la MISMA regla que usa la reversa (una sola fuente de verdad).
  describe('remainingPurchaseUnits — tope editable de una compra (A1)', () => {
    const level = (over: Record<string, unknown> = {}) => ({
      warehouseId: 'wh-1',
      productId: 'p-1',
      onHand: 10,
      costPrice: 5,
      ...over,
    }) as never;

    it('U-A1-6: cuenta solo las tandas con la MISMA referencia de origen', () => {
      const lots = [
        { costPrice: 5, quantity: 4, lotOriginMovementId: 'mv-1' },
        { costPrice: 9, quantity: 6, lotOriginMovementId: 'mv-2' },
      ];
      expect(remainingPurchaseUnits(level({ lots }), { id: 'mv-1', quantity: 10, costPrice: 5 })).toBe(4);
      expect(remainingPurchaseUnits(level({ lots }), { id: 'mv-2', quantity: 10, costPrice: 9 })).toBe(6);
    });

    it('U-A1-7: nunca supera la cantidad de la fila original', () => {
      const lots = [{ costPrice: 5, quantity: 40, lotOriginMovementId: 'mv-1' }];
      expect(remainingPurchaseUnits(level({ lots }), { id: 'mv-1', quantity: 10, costPrice: 5 })).toBe(10);
    });

    it('U-A1-8: datos viejos SIN referencias → coincidencia exacta por costo', () => {
      const lots = [
        { costPrice: 5, quantity: 3 },
        { costPrice: 7, quantity: 9 },
      ];
      expect(remainingPurchaseUnits(level({ lots }), { id: 'mv-old', quantity: 10, costPrice: 5 })).toBe(3);
    });

    it('U-A1-9: fila sin costo → FIFO hasta el onHand', () => {
      expect(remainingPurchaseUnits(level({ onHand: 4 }), { id: 'mv-1', quantity: 10 })).toBe(4);
      expect(remainingPurchaseUnits(level({ onHand: 50 }), { id: 'mv-1', quantity: 10 })).toBe(10);
    });

    it('U-A1-10: compra ya consumida o nivel inexistente → 0 (tope agotado)', () => {
      const lots = [{ costPrice: 5, quantity: 0, lotOriginMovementId: 'mv-1' }];
      expect(remainingPurchaseUnits(level({ lots }), { id: 'mv-1', quantity: 10, costPrice: 5 })).toBe(0);
      expect(remainingPurchaseUnits(undefined, { id: 'mv-1', quantity: 10, costPrice: 5 })).toBe(0);
      expect(remainingPurchaseUnits(level({ onHand: 0 }), { id: 'mv-1', quantity: 10, costPrice: 5 })).toBe(0);
    });

    it('U-A1-11: nivel sin lots cae al lote sintético (legacy) por costo', () => {
      expect(remainingPurchaseUnits(level({ onHand: 8 }), { id: 'mv-1', quantity: 10, costPrice: 5 })).toBe(8);
    });
  });

  // ─── Fase 3: atribución compra → salida + impacto en órdenes ───────────────
  describe('attributePurchaseOutflow', () => {
    const notReversed = () => false;

    function saleOut(over: Record<string, unknown> = {}) {
      return {
        id: 's1',
        warehouseId: 'wh-1',
        productId: 'p-1',
        type: 'sale_out',
        quantity: 4,
        costPrice: 5,
        reason: null,
        createdDate: new Date(),
        createdByName: 'x',
        ...over,
      } as never;
    }
    function purchase(over: Record<string, unknown> = {}) {
      return {
        id: 'mv-1',
        warehouseId: 'wh-1',
        productId: 'p-1',
        type: 'purchase_in',
        quantity: 10,
        costPrice: 5,
        reason: null,
        createdDate: new Date(),
        createdByName: 'x',
        ...over,
      } as never;
    }

    it('U-P1: usa la referencia determinista lotOriginMovementId', () => {
      const result = attributePurchaseOutflow(
        purchase(),
        [saleOut({ id: 's1', lotOriginMovementId: 'mv-1' }), saleOut({ id: 's2', lotOriginMovementId: 'mv-2' })],
        notReversed,
      );
      expect(result.succeeded).toBe(true);
      expect(result.saleOutMovements.map((m) => m.id)).toEqual(['s1']);
    });

    it('U-P2: fallback por costo EXACTO cuando no hay referencias (datos viejos)', () => {
      const result = attributePurchaseOutflow(
        purchase(),
        [saleOut({ id: 's1' }), saleOut({ id: 's2', costPrice: 9 })],
        notReversed,
      );
      expect(result.succeeded).toBe(true);
      expect(result.saleOutMovements.map((m) => m.id)).toEqual(['s1']);
    });

    it('U-P3: dos compras vivas al mismo costo sin referencias → ambiguo', () => {
      const result = attributePurchaseOutflow(
        purchase(),
        [purchase({ id: 'mv-1' }), purchase({ id: 'mv-2' }), saleOut({ id: 's1' })],
        notReversed,
      );
      expect(result.succeeded).toBe(false);
      expect(result.ambiguous).toBe(true);
    });

    it('U-P4: una compra revertida no cuenta para la ambigüedad', () => {
      const result = attributePurchaseOutflow(
        purchase(),
        [purchase({ id: 'mv-1' }), purchase({ id: 'mv-2' }), saleOut({ id: 's1' })],
        (id) => id === 'mv-2',
      );
      expect(result.succeeded).toBe(true);
      expect(result.saleOutMovements.map((m) => m.id)).toEqual(['s1']);
    });

    it('U-P5: filas revertidas se excluyen del conjunto', () => {
      const result = attributePurchaseOutflow(
        purchase(),
        [saleOut({ id: 's1', lotOriginMovementId: 'mv-1' })],
        (id) => id === 's1',
      );
      expect(result.succeeded).toBe(true);
      expect(result.saleOutMovements).toEqual([]);
    });

    it('U-P6 (R3-2): mezcla referencia + legacy → atribuye la UNION (sin descartar)', () => {
      const result = attributePurchaseOutflow(
        purchase(),
        [
          saleOut({ id: 's-ref', lotOriginMovementId: 'mv-1' }),
          saleOut({ id: 's-legacy' }), // sin referencia, mismo costo 5
        ],
        notReversed,
      );
      expect(result.succeeded).toBe(true);
      expect(result.saleOutMovements.map((m) => m.id).sort()).toEqual(['s-legacy', 's-ref']);
    });

    it('U-P7 (R3-2): una fila que reclama OTRA compra no entra por costo', () => {
      const result = attributePurchaseOutflow(
        purchase(),
        [
          saleOut({ id: 's-ref', lotOriginMovementId: 'mv-1' }),
          saleOut({ id: 's-other', lotOriginMovementId: 'mv-2' }), // mismo costo, otra compra
          saleOut({ id: 's-legacy' }),
        ],
        notReversed,
      );
      expect(result.succeeded).toBe(true);
      expect(result.saleOutMovements.map((m) => m.id).sort()).toEqual(['s-legacy', 's-ref']);
    });

    it('U-P8 (R3-2): con filas legacy y dos compras vivas al mismo costo → ambiguo', () => {
      const result = attributePurchaseOutflow(
        purchase(),
        [
          purchase({ id: 'mv-1' }),
          purchase({ id: 'mv-2' }),
          saleOut({ id: 's-ref', lotOriginMovementId: 'mv-1' }),
          saleOut({ id: 's-legacy' }),
        ],
        notReversed,
      );
      expect(result.succeeded).toBe(false);
      expect(result.ambiguous).toBe(true);
    });
  });

  describe('summarizeOrderImpact', () => {
    function order(id: string, isActive: boolean, costs: Array<{ inventoryId: string; quantity: number }>) {
      return {
        id,
        isActive,
        orderItems: [
          {
            productId: 'p-1',
            productName: 'X',
            categoryId: 'c',
            categoryName: 'C',
            name: 'X',
            quantity: 1,
            price: 5,
            productBusinessId: 'b',
            productCosts: costs.map((c) => ({ ...c, costPrice: 5 })),
            order: 0,
          },
        ],
      } as never;
    }

    it('U-O1: cuenta órdenes activas/unidades y separa las desactivadas', () => {
      const impact = summarizeOrderImpact(
        [
          order('o1', true, [{ inventoryId: 'e1', quantity: 2 }]),
          order('o2', true, [{ inventoryId: 'e2', quantity: 5 }]),
          order('o3', false, [{ inventoryId: 'e1', quantity: 3 }]),
        ] as never,
        new Set(['e1']),
      );
      expect(impact).toEqual({ activeOrders: 1, deactivatedOrders: 1, soldUnits: 2 });
    });
  });
});
