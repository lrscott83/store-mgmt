import { beforeEach, describe, expect, it } from 'vitest';
import { WarehouseErrors } from '@store-mgmt/domain';
import { ProductCategoryRepository } from '~/sales/lib/repositories/product-category-repository';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';
import { setDek, clearDek } from '~/shared/lib/storage/data-key-store';
import { importRoster, clearRoster } from '~/shared/lib/offline/roster-store';
import type { OfflineRosterBundle } from '~/shared/lib/offline/roster-types';
import { InventoryOfflineService } from '../inventory-offline-service';
import { WarehouseOfflineService } from '../warehouse-offline-service';

/**
 * Fase 4 — almacenes: U-S14 (persistencia + cifrado intacto tras la reversa),
 * U-S19 (aislamiento por tienda) e I-5 (reversa de una salida cuya entrada fue
 * editada por el CRUD → huella sin coincidencia → entrada no encontrada).
 */

function seedProduct(storeId: string, id = 'prod-1') {
  const categoryRepo = new ProductCategoryRepository(storeId);
  const productRepo = new ProductRepository(storeId, categoryRepo);
  categoryRepo.addImportedProductCategory({
    id: 'cat-1',
    name: 'Cerveza',
    order: 1,
    isActive: true,
  });
  productRepo.addImportedProduct({
    id,
    name: 'Cerveza X',
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
  return { categoryRepo, productRepo };
}

function makeService(storeId: string) {
  const { categoryRepo, productRepo } = seedProduct(storeId);
  const inventoryService = new InventoryOfflineService(storeId, productRepo);
  return {
    service: new WarehouseOfflineService(storeId, productRepo, inventoryService),
    productRepo,
    inventoryService,
    categoryRepo,
  };
}

function v2Bundle(storeId: string): OfflineRosterBundle {
  return {
    bundleId: 'b1',
    issuedAt: 1000,
    expiresAt: 999_999_999_999,
    formatVersion: 2,
    storeId,
    users: [
      {
        id: 'u1',
        login: 'ana',
        fullName: 'Ana',
        isActive: true,
        roles: [],
        featureIds: [],
        storeModuleIds: [],
        isSuperAdmin: false,
        isOwnerAdmin: false,
        isReSeller: false,
        selectedStoreId: storeId,
        verifier: { hash: 'h', salt: 's', iterations: 210_000 },
        wrappedDek: 'ct',
        wrapSalt: 'salt',
        wrapIv: 'iv',
      },
    ],
  };
}

describe('WarehouseOfflineService — Fase 4', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDek();
    clearRoster();
  });

  // ─── U-S14 ──────────────────────────────────────────────────────────────
  it('U-S14: la reversa re-persiste niveles/lotes y el cifrado queda intacto', () => {
    const storeId = 'store-u-s14';
    importRoster(v2Bundle(storeId), 500);
    setDek(new Uint8Array(32).fill(0x07), storeId);

    const { service } = makeService(storeId);
    const wh = service.createWarehouse('A').data!;
    service.recordMovement({
      type: 'purchase_in',
      warehouseId: wh.id,
      productId: 'prod-1',
      quantity: 10,
      costPrice: 5,
    });
    service.recordMovement({
      type: 'sale_out',
      warehouseId: wh.id,
      productId: 'prod-1',
      quantity: 4,
    });

    const reversal = service.reverseMovement(service.getStorageMovements().find((m) => m.type === 'purchase_in')!.id);
    expect(reversal.succeeded).toBe(true);

    // El cifrado en reposo sigue siendo ciphertext (no quedó plaintext tras mutar).
    for (const entity of ['warehouse-stock-levels', 'warehouse-stock-movements']) {
      const raw = localStorage.getItem(`lizoft.store-${entity}-${storeId}`);
      expect(raw).not.toBeNull();
      expect(raw!.startsWith('enc:v1:')).toBe(true);
    }

    // Una instancia NUEVA (otra lectura) descifra y revive el estado correcto.
    const freshProductRepo = new ProductRepository(storeId, new ProductCategoryRepository(storeId));
    const freshInventory = new InventoryOfflineService(storeId, freshProductRepo);
    const fresh = new WarehouseOfflineService(storeId, freshProductRepo, freshInventory);
    const level = fresh.getStockLevel(wh.id, 'prod-1')!;
    expect(level.onHand).toBe(0);
    expect(level.lots).toEqual([]);
    expect(fresh.getStorageMovements().filter((m) => m.type === 'reversal')).toHaveLength(1);
  });

  // ─── U-S19 ──────────────────────────────────────────────────────────────
  it('U-S19: las reversas de una tienda no aparecen en otra', () => {
    const forStore = (storeId: string) => makeService(storeId).service;

    const serviceA = forStore('store-a');
    const serviceB = forStore('store-b');

    const whA = serviceA.createWarehouse('A').data!;
    serviceA.recordMovement({
      type: 'purchase_in',
      warehouseId: whA.id,
      productId: 'prod-1',
      quantity: 10,
      costPrice: 5,
    });
    const purchaseId = serviceA.getStorageMovements()[0].id;
    expect(serviceA.reverseMovement(purchaseId).succeeded).toBe(true);

    expect(serviceA.getStorageMovements().filter((m) => m.type === 'reversal')).toHaveLength(1);
    expect(serviceB.getStorageMovements()).toHaveLength(0);
    expect(serviceB.getStorageWarehouses()).toHaveLength(0);
  });

  // ─── I-5 ────────────────────────────────────────────────────────────────
  it('I-5: salida legacy cuya entrada fue editada por el CRUD → huella sin coincidencia → entrada no encontrada', () => {
    const storeId = 'store-i-5';
    const { service, inventoryService } = makeService(storeId);
    const wh = service.createWarehouse('A').data!;

    // Entrada manual (editable) y una salida legacy SIN enlace exacto ni costo.
    const manual = inventoryService.createInventoryEntry('prod-1', 10, 5)!;
    expect(manual.succeeded).toBe(true);
    service.addImportedMovement({
      id: 'sale-legacy',
      warehouseId: wh.id,
      productId: 'prod-1',
      type: 'sale_out',
      quantity: 10,
      reason: null,
      createdDate: new Date(),
      createdByName: 'old',
      // sin costPrice ni inventoryEntryId — huella pura por cantidad + día
    });

    // El CRUD edita la entrada (10 → 12): la huella por cantidad ya no coincide.
    expect(inventoryService.update(manual.data!.id, 'prod-1', 12, 5).succeeded).toBe(true);

    const result = service.reverseMovement('sale-legacy');
    expect(result.succeeded).toBe(false);
    expect(result.errors[0]).toEqual(WarehouseErrors.SaleOutEntryNotFound);
  });
});
