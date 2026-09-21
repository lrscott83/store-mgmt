import { beforeEach, describe, expect, it } from 'vitest';
import { Result } from '@store-mgmt/domain';
import type { WarehouseStockLevel, WarehouseStockMovement } from '@store-mgmt/domain';
import { ProductCategoryRepository } from '~/sales/lib/repositories/product-category-repository';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';
import { InventoryOfflineService } from '~/inventory/lib/services/inventory-offline-service';
import { WarehouseOfflineService } from '~/inventory/lib/services/warehouse-offline-service';
import { DataSynchronizerService } from '../data-synchronizer-service';
import type { ParsedData } from '../data-serializer-service';
import type {
  CategoryImportRepo,
  InventoryImportService,
  OrderImportService,
  ExpenseImportService,
  ProductImportRepo,
  SaleCreditImportService,
} from '../data-synchronizer-service';

/**
 * Fase 4 — sync/import de almacenes con el servicio REAL (plan 2026-09-16):
 * A9a (contador de importación), I-4 (export→import con reversa + niveles
 * last-writer-wins), I-4c (movimiento local entre la reversa y el import → el
 * nivel adopta el del origen) e I-4e (los reversos no cruzan tiendas).
 *
 * Los 6 seams obligatorios del constructor se stubean como no-ops: el foco es la
 * costura de almacenes (`warehouseService` real).
 */

const STORE_A = 'store-sync-a';
const STORE_B = 'store-sync-b';

const noop = () => Result.Success();

function stubRepos() {
  const categoryRepo = {
    getStorageCategoriesMap: () => new Map(),
    addImportedProductCategory: noop,
    updateImportedProductCategory: noop,
    updateCategories: () => {},
  } as unknown as CategoryImportRepo;
  const productRepo = {
    getStorageProductsMap: () => new Map(),
    addImportedProduct: noop,
    updateImportedProduct: noop,
    updateProducts: () => {},
  } as unknown as ProductImportRepo;
  const inventoryService = {
    getStorageInventoriesMap: () => new Map(),
    addImportedEntries: noop,
    updateImportedEntries: noop,
  } as unknown as InventoryImportService;
  const orderService = {
    getStorageOrders: () => [],
    addImportedOrder: noop,
    updateImportedOrder: noop,
  } as unknown as OrderImportService;
  const expenseService = {
    getStorageExpenses: () => [],
    addImportedExpense: noop,
    updateImportedExpense: noop,
  } as unknown as ExpenseImportService;
  const saleCreditService = {
    getStorageSaleCredits: () => [],
    addImportedSaleCredit: noop,
    updateImportedSaleCredit: noop,
  } as unknown as SaleCreditImportService;
  return { categoryRepo, productRepo, inventoryService, orderService, expenseService, saleCreditService };
}

function makeWarehouseService(storeId: string): WarehouseOfflineService {
  const categoryRepo = new ProductCategoryRepository(storeId);
  const productRepo = new ProductRepository(storeId, categoryRepo);
  const inventoryService = new InventoryOfflineService(storeId, productRepo);
  return new WarehouseOfflineService(storeId, productRepo, inventoryService);
}

function makeSynchronizer(warehouseService: WarehouseOfflineService): DataSynchronizerService {
  const s = stubRepos();
  return new DataSynchronizerService(
    STORE_A,
    s.categoryRepo,
    s.productRepo,
    s.inventoryService,
    s.orderService,
    s.expenseService,
    s.saleCreditService,
    undefined, // exchangeRateService
    warehouseService,
  );
}

function emptyData(): ParsedData {
  return {
    categories: [],
    products: [],
    inventoryEntries: [],
    orders: [],
    expenses: [],
    saleCredits: [],
    exchangeRates: [],
    warehouses: [],
    warehouseStockLevels: [],
    warehouseStockMovements: [],
    channelRates: [],
  };
}

function movement(over: Partial<WarehouseStockMovement>): WarehouseStockMovement {
  return {
    id: 'm1',
    warehouseId: 'wh-1',
    productId: 'prod-1',
    type: 'purchase_in',
    quantity: 10,
    costPrice: 5,
    reason: null,
    createdDate: new Date(),
    createdByName: 'x',
    ...over,
  };
}

describe('DataSynchronizerService — warehouse Fase 4', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // ─── A9a ────────────────────────────────────────────────────────────────
  describe('A9a — el contador no cuenta los saltos silenciosos', () => {
    it('un reverso duplicado (distinto id, mismo original) NO se cuenta como insertado', async () => {
      const wh = makeWarehouseService(STORE_A);
      // Local: compra + su reversa ya aplicada.
      wh.addImportedMovement(movement({ id: 'mv-1' }));
      wh.addImportedMovement(
        movement({ id: 'rev-local', type: 'reversal', reversalOfMovementId: 'mv-1' }),
      );
      const svc = makeSynchronizer(wh);

      // Importa OTRA reversa del mismo original (el otro dispositivo revirtió lo mismo).
      const data: ParsedData = {
        ...emptyData(),
        warehouseStockMovements: [
          movement({
            id: 'rev-dup',
            type: 'reversal',
            quantity: 10,
            reversalOfMovementId: 'mv-1',
          }),
        ],
      };
      const result = await svc.sync(data);

      const merge = result.merges.find((m) => m.entity === 'warehouseStockMovements');
      expect(merge).toEqual({ entity: 'warehouseStockMovements', inserted: 0, updated: 0 });
      // Y el duplicado realmente NO entró.
      expect(wh.getStorageMovements().some((m) => m.id === 'rev-dup')).toBe(false);
      expect(wh.getStorageMovements()).toHaveLength(2);
    });

    it('una fila nueva sí se cuenta como insertada', async () => {
      const wh = makeWarehouseService(STORE_A);
      wh.addImportedMovement(movement({ id: 'mv-1' }));
      const svc = makeSynchronizer(wh);

      const data: ParsedData = {
        ...emptyData(),
        warehouseStockMovements: [movement({ id: 'mv-2' })],
      };
      const result = await svc.sync(data);

      expect(result.merges.find((m) => m.entity === 'warehouseStockMovements')).toEqual({
        entity: 'warehouseStockMovements',
        inserted: 1,
        updated: 0,
      });
      expect(wh.getStorageMovements().some((m) => m.id === 'mv-2')).toBe(true);
    });

    it('una fila con id ya presente no se cuenta ni se duplica', async () => {
      const wh = makeWarehouseService(STORE_A);
      wh.addImportedMovement(movement({ id: 'mv-1' }));
      const svc = makeSynchronizer(wh);

      const data: ParsedData = { ...emptyData(), warehouseStockMovements: [movement({ id: 'mv-1' })] };
      const result = await svc.sync(data);

      expect(result.merges.find((m) => m.entity === 'warehouseStockMovements')?.inserted).toBe(0);
      expect(wh.getStorageMovements()).toHaveLength(1);
    });
  });

  // ─── I-4 ────────────────────────────────────────────────────────────────
  describe('I-4 — export→import con reversa: id-presencia + niveles last-writer-wins', () => {
    it('inserta el reverso y el nivel adopta el del origen; re-importar es idempotente', async () => {
      const wh = makeWarehouseService(STORE_A);
      wh.addImportedWarehouse({
        id: 'wh-1',
        name: 'Central',
        isActive: true,
        createdDate: new Date(),
        createdByName: 'x',
      });
      wh.addImportedStockLevel({
        id: 'sl-1',
        warehouseId: 'wh-1',
        productId: 'prod-1',
        onHand: 10,
        costPrice: 5,
        createdDate: new Date(),
      });

      const importedLevel: WarehouseStockLevel = {
        id: 'sl-1',
        warehouseId: 'wh-1',
        productId: 'prod-1',
        onHand: 15,
        costPrice: 6,
        createdDate: new Date(),
      };
      const reversal = movement({ id: 'rev-1', type: 'reversal', reversalOfMovementId: 'mv-x' });

      const data: ParsedData = {
        ...emptyData(),
        warehouseStockLevels: [importedLevel],
        warehouseStockMovements: [reversal],
      };

      const first = await makeSynchronizer(wh).sync(data);
      expect(first.merges.find((m) => m.entity === 'warehouseStockMovements')?.inserted).toBe(1);
      expect(first.merges.find((m) => m.entity === 'warehouseStockLevels')?.updated).toBe(1);
      // El nivel adoptó el del origen (last-writer-wins).
      const level = wh.getStockLevel('wh-1', 'prod-1')!;
      expect(level.onHand).toBe(15);
      expect(level.costPrice).toBe(6);
      // Id-presencia: el reverso quedó una sola vez.
      expect(wh.getStorageMovements().filter((m) => m.id === 'rev-1')).toHaveLength(1);

      // Re-import del mismo archivo → 0 insertados (id presente).
      const second = await makeSynchronizer(wh).sync(data);
      expect(second.merges.find((m) => m.entity === 'warehouseStockMovements')?.inserted).toBe(0);
      expect(wh.getStorageMovements().filter((m) => m.id === 'rev-1')).toHaveLength(1);
    });
  });

  // ─── I-4c ───────────────────────────────────────────────────────────────
  describe('I-4c — movimiento local entre la reversa y el import', () => {
    it('el nivel adopta el valor del origen aunque el destino haya cambiado después', async () => {
      const wh = makeWarehouseService(STORE_A);
      wh.addImportedWarehouse({
        id: 'wh-1',
        name: 'Central',
        isActive: true,
        createdDate: new Date(),
        createdByName: 'x',
      });
      // Estado local del destino DESPUÉS de la reversa: un movimiento nuevo lo dejó en 12.
      wh.addImportedStockLevel({
        id: 'sl-1',
        warehouseId: 'wh-1',
        productId: 'prod-1',
        onHand: 12,
        costPrice: 5,
        createdDate: new Date(),
      });

      const data: ParsedData = {
        ...emptyData(),
        warehouseStockLevels: [
          {
            id: 'sl-1',
            warehouseId: 'wh-1',
            productId: 'prod-1',
            onHand: 15,
            costPrice: 6,
            createdDate: new Date(),
          },
        ],
      };
      await makeSynchronizer(wh).sync(data);

      // El import (origen) pisa el cambio local (last-writer-wins).
      expect(wh.getStockLevel('wh-1', 'prod-1')!.onHand).toBe(15);
    });
  });

  // ─── I-4e ───────────────────────────────────────────────────────────────
  describe('I-4e — los reversos no cruzan tiendas', () => {
    it('importar en la tienda B no toca los movimientos de la tienda A', async () => {
      const whA = makeWarehouseService(STORE_A);
      const whB = makeWarehouseService(STORE_B);
      whA.addImportedMovement(movement({ id: 'mv-a' }));

      const reversal = movement({ id: 'rev-b', type: 'reversal', reversalOfMovementId: 'mv-b' });
      const data: ParsedData = { ...emptyData(), warehouseStockMovements: [reversal] };
      await makeSynchronizer(whB).sync(data);

      // B recibió el reverso; A quedó intacto.
      expect(whB.getStorageMovements().map((m) => m.id)).toEqual(['rev-b']);
      expect(whA.getStorageMovements().map((m) => m.id)).toEqual(['mv-a']);
    });
  });

  it('sin warehouseService inyectado, el merge de movimientos no aparece (contrato legacy de 6 entidades)', async () => {
    const s = stubRepos();
    const svc = new DataSynchronizerService(
      STORE_A,
      s.categoryRepo,
      s.productRepo,
      s.inventoryService,
      s.orderService,
      s.expenseService,
      s.saleCreditService,
    );
    const result = await svc.sync({ ...emptyData(), warehouseStockMovements: [movement({ id: 'm1' })] });
    expect(result.merges.find((m) => m.entity === 'warehouseStockMovements')).toBeUndefined();
  });
});
