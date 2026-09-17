import { beforeEach, describe, expect, it } from 'vitest';
import { ProductCategoryRepository } from '~/sales/lib/repositories/product-category-repository';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';
import { InventoryOfflineService } from '../inventory-offline-service';
import { WarehouseOfflineService } from '../warehouse-offline-service';
import { WarehouseErrors } from '@store-mgmt/domain';

const storeId = 'test-store-fase1';

function seedProduct(
  productRepo: ProductRepository,
  categoryRepo: ProductCategoryRepository,
  id: string,
  name: string,
) {
  categoryRepo.addImportedProductCategory({
    id: 'cat-1',
    name: 'Cerveza',
    order: 1,
    isActive: true,
  });
  productRepo.addImportedProduct({
    id,
    name,
    categoryId: 'cat-1',
    categoryName: 'Cerveza',
    price: 700,
    order: 1,
    availableToSale: true,
    discountFromInvantory: true,
    businessId: storeId,
    isActive: true,
    createdDate: new Date(),
    createdByName: 'test',
  });
}

describe('WarehouseOfflineService — Fase 1 (plan 2026-09-16)', () => {
  let productRepo: ProductRepository;
  let inventorySvc: InventoryOfflineService;
  let service: WarehouseOfflineService;

  beforeEach(() => {
    localStorage.clear();
    const categoryRepo = new ProductCategoryRepository(storeId);
    productRepo = new ProductRepository(storeId, categoryRepo);
    inventorySvc = new InventoryOfflineService(storeId, productRepo);
    service = new WarehouseOfflineService(storeId, productRepo, inventorySvc);
    seedProduct(productRepo, categoryRepo, 'prod-1', 'Cerveza X');
  });

  function makeWarehouses() {
    const whA = service.createWarehouse('A').data!;
    const whB = service.createWarehouse('B').data!;
    const whC = service.createWarehouse('C').data!;
    return { whA, whB, whC };
  }

  it('A2-fallo-a-mitad: la reversa de transferencia que falla restaura el estado en memoria y no toca el storage', () => {
    const { whA, whB, whC } = makeWarehouses();
    // A compra 10@$5 y las transfiere a B.
    service.recordMovement({
      type: 'purchase_in',
      warehouseId: whA.id,
      productId: 'prod-1',
      quantity: 10,
      costPrice: 5,
    });
    const transfer = service
      .recordMovement({
        type: 'transfer_out',
        warehouseId: whA.id,
        productId: 'prod-1',
        quantity: 10,
        toWarehouseId: whB.id,
      })
      .data!.find((r) => r.type === 'transfer_out')!;
    // B compra 10@$10 y luego saca 6@$5 hacia C → B queda 4@$5 + 10@$10.
    service.recordMovement({
      type: 'purchase_in',
      warehouseId: whB.id,
      productId: 'prod-1',
      quantity: 10,
      costPrice: 10,
    });
    service.recordMovement({
      type: 'transfer_out',
      warehouseId: whB.id,
      productId: 'prod-1',
      quantity: 6,
      toWarehouseId: whC.id,
    });
    const beforeB = JSON.stringify(service.getStockLevel(whB.id, 'prod-1'));
    const beforeA = JSON.stringify(service.getStockLevel(whA.id, 'prod-1'));
    const storageBefore = localStorage.getItem(
      `test-store-fase1:warehouse-stock-levels`,
    );

    // Revertir la transferencia original: B tiene 14 pero solo 4 a $5 → falla a mitad.
    const result = service.reverseMovement(transfer.id);
    expect(result.succeeded).toBe(false);
    expect(result.errors[0]).toEqual(WarehouseErrors.InsufficientStock);

    // Estado en memoria intacto y storage intacto.
    expect(JSON.stringify(service.getStockLevel(whB.id, 'prod-1'))).toBe(beforeB);
    expect(JSON.stringify(service.getStockLevel(whA.id, 'prod-1'))).toBe(beforeA);
    expect(localStorage.getItem(`test-store-fase1:warehouse-stock-levels`)).toBe(
      storageBefore,
    );
    // Sin fila de reversa huérfana.
    expect(service.isReversed(transfer.id)).toBe(false);
  });

  it('A2-fallo-simple: destino sin stock → error sin mutar niveles', () => {
    const { whA, whB } = makeWarehouses();
    service.recordMovement({
      type: 'purchase_in',
      warehouseId: whA.id,
      productId: 'prod-1',
      quantity: 10,
      costPrice: 5,
    });
    const transfer = service
      .recordMovement({
        type: 'transfer_out',
        warehouseId: whA.id,
        productId: 'prod-1',
        quantity: 10,
        toWarehouseId: whB.id,
      })
      .data!.find((r) => r.type === 'transfer_out')!;
    // B saca todo a tienda → destino vacío.
    service.recordMovement({
      type: 'sale_out',
      warehouseId: whB.id,
      productId: 'prod-1',
      quantity: 10,
    });
    const beforeA = service.getStockLevel(whA.id, 'prod-1')!.onHand;
    const result = service.reverseMovement(transfer.id);
    expect(result.succeeded).toBe(false);
    expect(service.getStockLevel(whA.id, 'prod-1')!.onHand).toBe(beforeA);
    expect(service.isReversed(transfer.id)).toBe(false);
  });

  it('A3: la tanda restaurada vuelve al inicio (sigue FIFO, no al final)', () => {
    const { whA } = makeWarehouses();
    service.recordMovement({
      type: 'purchase_in',
      warehouseId: whA.id,
      productId: 'prod-1',
      quantity: 10,
      costPrice: 5,
    });
    service.recordMovement({
      type: 'purchase_in',
      warehouseId: whA.id,
      productId: 'prod-1',
      quantity: 10,
      costPrice: 10,
    });
    const sale = service.recordMovement({
      type: 'sale_out',
      warehouseId: whA.id,
      productId: 'prod-1',
      quantity: 10,
    }).data![0];
    // Se consumió el lote $5; queda solo $10.
    expect(service.getStockLevel(whA.id, 'prod-1')!.lots).toMatchObject([
      { costPrice: 10, quantity: 10 },
    ]);
    const reversed = service.reverseMovement(sale.id);
    expect(reversed.succeeded).toBe(true);
    // La tanda $5 restaurada queda ANTES (índice 0), no al final.
    const lots = service.getStockLevel(whA.id, 'prod-1')!.lots!;
    expect(lots[0]).toMatchObject({ costPrice: 5, quantity: 10 });
    expect(lots[1]).toMatchObject({ costPrice: 10, quantity: 10 });
  });

  it('A4: dos compras al mismo costo — revertir la consumida se bloquea y no toca la otra', () => {
    const { whA } = makeWarehouses();
    const buy1 = service.recordMovement({
      type: 'purchase_in',
      warehouseId: whA.id,
      productId: 'prod-1',
      quantity: 10,
      costPrice: 5,
    }).data![0];
    service.recordMovement({
      type: 'purchase_in',
      warehouseId: whA.id,
      productId: 'prod-1',
      quantity: 10,
      costPrice: 5,
    });
    // Salen 15: se consume buy1 entera + 5 de buy2.
    service.recordMovement({
      type: 'sale_out',
      warehouseId: whA.id,
      productId: 'prod-1',
      quantity: 15,
    });
    // buy1 ya no tiene nada → bloquea (el código viejo descontaba de buy2).
    const result = service.reverseMovement(buy1.id);
    expect(result.succeeded).toBe(false);
    expect(result.errors[0]).toEqual(WarehouseErrors.PurchaseLotConsumed);
    expect(service.getStockLevel(whA.id, 'prod-1')!.onHand).toBe(5);
  });

  it('A4-referencia: revertir la compra correcta restaura su propia tanda', () => {
    const { whA } = makeWarehouses();
    const buy1 = service.recordMovement({
      type: 'purchase_in',
      warehouseId: whA.id,
      productId: 'prod-1',
      quantity: 10,
      costPrice: 5,
    }).data![0];
    service.recordMovement({
      type: 'purchase_in',
      warehouseId: whA.id,
      productId: 'prod-1',
      quantity: 10,
      costPrice: 7,
    });
    service.recordMovement({
      type: 'sale_out',
      warehouseId: whA.id,
      productId: 'prod-1',
      quantity: 5,
    });
    // Revertir buy1 retira sus 5 restantes (la compra se compensa):
    // buy1 desaparece y buy2 queda intacta.
    const result = service.reverseMovement(buy1.id);
    expect(result.succeeded).toBe(true);
    expect(result.data!.quantity).toBe(5);
    const level = service.getStockLevel(whA.id, 'prod-1')!;
    expect(level.onHand).toBe(10);
    expect(level.lots!.some((l) => l.lotOriginMovementId === buy1.id)).toBe(
      false,
    );
    expect(level.lots).toMatchObject([{ costPrice: 7, quantity: 10 }]);
  });

  it('A5: updateImportedStockLevel copia los lotes (onHand == Σ lotes)', () => {
    const { whA } = makeWarehouses();
    service.addImportedStockLevel({
      id: 'sl-1',
      warehouseId: whA.id,
      productId: 'prod-1',
      onHand: 0,
      costPrice: 0,
      createdDate: new Date(),
    });
    service.updateImportedStockLevel({
      id: 'sl-1',
      warehouseId: whA.id,
      productId: 'prod-1',
      onHand: 15,
      costPrice: 6.67,
      lots: [
        { costPrice: 5, quantity: 10 },
        { costPrice: 10, quantity: 5 },
      ],
      createdDate: new Date(),
    });
    const level = service.getStockLevel(whA.id, 'prod-1')!;
    expect(level.lots).toMatchObject([
      { costPrice: 5, quantity: 10 },
      { costPrice: 10, quantity: 5 },
    ]);
    const sum = level.lots!.reduce((s, l) => s + l.quantity, 0);
    expect(level.onHand).toBe(sum);
  });

  it('A6: transfer_in multi-tanda persiste el costo ponderado exacto', () => {
    const { whA, whB } = makeWarehouses();
    service.recordMovement({
      type: 'purchase_in',
      warehouseId: whA.id,
      productId: 'prod-1',
      quantity: 10,
      costPrice: 5,
    });
    service.recordMovement({
      type: 'purchase_in',
      warehouseId: whA.id,
      productId: 'prod-1',
      quantity: 10,
      costPrice: 10,
    });
    const rows = service.recordMovement({
      type: 'transfer_in',
      warehouseId: whB.id,
      productId: 'prod-1',
      quantity: 15,
      fromWarehouseId: whA.id,
    }).data!;
    expect(rows).toHaveLength(1);
    // (10×5 + 5×10) / 15 = 6.67
    expect(rows[0].costPrice).toBe(6.67);
  });

  it('A9b: compra sin costo en fila revierte al promedio del nivel', () => {
    const { whA } = makeWarehouses();
    service.addImportedStockLevel({
      id: 'sl-1',
      warehouseId: whA.id,
      productId: 'prod-1',
      onHand: 20,
      costPrice: 7.5,
      lots: [
        { costPrice: 5, quantity: 10 },
        { costPrice: 10, quantity: 10 },
      ],
      createdDate: new Date(),
    });
    service.addImportedMovement({
      id: 'mv-old',
      warehouseId: whA.id,
      productId: 'prod-1',
      type: 'purchase_in',
      quantity: 5,
      reason: null,
      createdDate: new Date(),
      createdByName: 'old',
      // sin costPrice — dato viejo
    });
    const result = service.reverseMovement('mv-old');
    expect(result.succeeded).toBe(true);
    expect(result.data!.costPrice).toBe(7.5);
  });

  it('A9c: importar una reversa sin reversalOfMovementId se salta en silencio', () => {
    const { whA } = makeWarehouses();
    const result = service.addImportedMovement({
      id: 'rev-noref',
      warehouseId: whA.id,
      productId: 'prod-1',
      type: 'reversal',
      quantity: 5,
      reason: null,
      createdDate: new Date(),
      createdByName: 'x',
    });
    expect(result.succeeded).toBe(true);
    expect(
      service.getStorageMovements().some((m) => m.id === 'rev-noref'),
    ).toBe(false);
  });

  it('A8-bloqueo: la entrada espejo de una salida no se puede editar por CRUD', () => {
    const { whA } = makeWarehouses();
    service.recordMovement({
      type: 'purchase_in',
      warehouseId: whA.id,
      productId: 'prod-1',
      quantity: 10,
      costPrice: 5,
    });
    const sale = service.recordMovement({
      type: 'sale_out',
      warehouseId: whA.id,
      productId: 'prod-1',
      quantity: 10,
    }).data![0];
    // La entrada espejo queda sellada con la salida.
    const mirror = inventorySvc
      .getProductInventoriesByProductId('prod-1')
      .find((e) => e.id === sale.inventoryEntryId)!;
    expect(mirror.warehouseSaleOutMovementId).toBe(sale.id);
    // Edición directa bloqueada…
    const edit = inventorySvc.update(sale.inventoryEntryId!, 'prod-1', 12, 5);
    expect(edit.succeeded).toBe(false);
    // …y traslado entre productos también.
    const move = inventorySvc.updateInventoryEntry(
      'prod-1',
      sale.inventoryEntryId!,
      'prod-1',
      12,
      5,
    );
    expect(move.succeeded).toBe(false);
    // Una entrada manual sigue editable.
    const manual = inventorySvc.createInventoryEntry('prod-1', 3, 5)!;
    expect(manual.succeeded).toBe(true);
    const editManual = inventorySvc.update(manual.data!.id, 'prod-1', 4, 5);
    expect(editManual.succeeded).toBe(true);
    // La reversa de la salida sigue funcionando (el borrado interno no se bloquea).
    const reversal = service.reverseMovement(sale.id);
    expect(reversal.succeeded).toBe(true);
  });

  it('A8: salida cuya entrada fue editada (cantidad difiere) → SaleOutEntryModified', () => {
    // Dato anterior al sello (entrada sin warehouseSaleOutMovementId, editable):
    // la edición por CRUD sube 10 → 12 y la reversa debe bloquear en vez de
    // acreditar solo 10 y hacer desaparecer el excedente.
    const { whA } = makeWarehouses();
    const manual = inventorySvc.createInventoryEntry('prod-1', 10, 5)!;
    expect(manual.succeeded).toBe(true);
    service.addImportedMovement({
      id: 'sale-legacy',
      warehouseId: whA.id,
      productId: 'prod-1',
      type: 'sale_out',
      quantity: 10,
      reason: null,
      createdDate: new Date(),
      createdByName: 'old',
      costPrice: 5,
      inventoryEntryId: manual.data!.id,
    });
    const edit = inventorySvc.update(manual.data!.id, 'prod-1', 12, 5);
    expect(edit.succeeded).toBe(true);
    const result = service.reverseMovement('sale-legacy');
    expect(result.succeeded).toBe(false);
    expect(result.errors[0]).toEqual(WarehouseErrors.SaleOutEntryModified);
  });
});
