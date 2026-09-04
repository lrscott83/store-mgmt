import type {
  BaseError,
  DataResult,
  Warehouse,
  WarehouseMovementType,
  WarehouseStockLevel,
  WarehouseStockMovement,
} from '@store-mgmt/domain';
import { DataResult as DataResultImpl, Result, WarehouseErrors } from '@store-mgmt/domain';
import { StorageKeys } from '~/shared/lib/storage/storage-keys';
import { encryptEntity } from '~/shared/lib/storage/entity-crypto';
import { readEntityOrThrow } from '~/shared/lib/storage/read-entity-or-throw';
import { getCurrentUserLogin } from '~/shared/lib/auth/current-user';
import { round2 } from '~/shared/lib/money';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';
import { InventoryOfflineService } from './inventory-offline-service';
import { applyMovement, computeWeightedCost, validateMovementQuantity } from '../warehouse';

function generateId(): string {
  return crypto.randomUUID();
}

function reviveDate<T>(value: T, fields: (keyof T & string)[]): T {
  const revived = { ...value } as Record<string, unknown>;
  for (const field of fields) {
    const v = revived[field];
    if (typeof v === 'string') revived[field] = new Date(v);
  }
  return revived as unknown as T;
}

/**
 * Entrada a `recordMovement` — la única puerta de mutación de `onHand`
 * (invariante del modelo de referencia). `costPrice` es obligatorio solo en
 * `purchase_in`; `sale_out` usa el costo promedio del almacén; las
 * transferencias propagan el costo del origen (decisión #4).
 */
export interface RecordWarehouseMovementParams {
  type: WarehouseMovementType;
  /** Almacén origen (sale_out/transfer_out) o destino (purchase_in/transfer_in). */
  warehouseId: string;
  productId: string;
  quantity: number;
  /** Obligatorio en purchase_in (costo de compra por unidad). */
  costPrice?: number;
  /** Opcional en todos los tipos (decisión #6). */
  reason?: string | null;
  /** transfer_out → destino. */
  toWarehouseId?: string;
  /** transfer_in → origen. */
  fromWarehouseId?: string;
}

/**
 * WarehouseOfflineService — gestión de almacenes offline-first (localStorage por
 * tienda, patrón de ExchangeRateOfflineService/InventoryOfflineService).
 *
 * Reglas de negocio (decisiones del plan 2026-09-04-warehouses-plan.md):
 * - `onHand` SOLO muta vía `recordMovement` — no hay "set onHand" directo.
 * - `purchase_in`: suma stock y recalcula el costo promedio ponderado (#1).
 * - `sale_out`: valida stock, debita el almacén y crea una `InventoryEntry` en
 *   la tienda con el costo promedio del almacén (llamada a
 *   `InventoryOfflineService.createInventoryEntry`).
 * - `transfer_out`/`transfer_in`: mueven stock entre almacenes y propagan el
 *   costo tal cual (#4).
 * - Cantidades con round2 (#7); `reason` opcional (#6); movimientos
 *   append-only; desactivación bloqueada con stock o movimientos (#5).
 */
export class WarehouseOfflineService {
  private warehouses: Warehouse[] | null = null;
  private lastWarehousesKey: string | undefined;
  private stockLevels: WarehouseStockLevel[] | null = null;
  private lastStockLevelsKey: string | undefined;
  private movements: WarehouseStockMovement[] | null = null;
  private lastMovementsKey: string | undefined;

  constructor(
    private readonly storeId: string,
    private readonly productRepository: ProductRepository,
    private readonly inventoryService: InventoryOfflineService,
  ) {}

  // ─── warehouses ──────────────────────────────────────────────────────────

  getStorageWarehouses(): Warehouse[] {
    if (
      !this.warehouses ||
      this.warehouses.length === 0 ||
      this.getCurrentStorageKey('warehouses') !== this.lastWarehousesKey
    ) {
      this.warehouses = this.getFromLocalStorage<Warehouse>(
        'warehouses',
        ['createdDate', 'updatedDate'],
      );
    }
    return this.warehouses;
  }

  getWarehouseById(id: string): Warehouse | undefined {
    return this.getStorageWarehouses().find((w) => w.id === id);
  }

  createWarehouse(name: string): DataResult<Warehouse> {
    if (!name || name.trim().length === 0) {
      return new DataResultImpl<Warehouse>(undefined, false, [WarehouseErrors.InvalidName]);
    }
    const now = new Date();
    const warehouse: Warehouse = {
      id: generateId(),
      name: name.trim(),
      isActive: true,
      createdDate: now,
      createdByName: getCurrentUserLogin(),
    };
    this.getStorageWarehouses().push(warehouse);
    this.setLocalStorage('warehouses', this.warehouses!);
    return new DataResultImpl<Warehouse>(warehouse, true, []);
  }

  updateWarehouse(id: string, name: string): DataResult<Warehouse> {
    const existing = this.getWarehouseById(id);
    if (!existing) {
      return new DataResultImpl<Warehouse>(undefined, false, [WarehouseErrors.NotExists]);
    }
    if (!name || name.trim().length === 0) {
      return new DataResultImpl<Warehouse>(undefined, false, [WarehouseErrors.InvalidName]);
    }
    existing.name = name.trim();
    existing.updatedDate = new Date();
    existing.updatedByName = getCurrentUserLogin();
    this.setLocalStorage('warehouses', this.warehouses!);
    return new DataResultImpl<Warehouse>(existing, true, []);
  }

  deactivateWarehouse(id: string): Result {
    const existing = this.getWarehouseById(id);
    if (!existing) return Result.Failure([WarehouseErrors.NotExists]);

    const hasStock = this.getStockLevels(id).some((level) => level.onHand > 0);
    const hasMovements = this.getMovements(id).length > 0;
    if (hasStock || hasMovements) {
      return Result.Failure([WarehouseErrors.CannotDeactivate]);
    }

    existing.isActive = false;
    existing.updatedDate = new Date();
    existing.updatedByName = getCurrentUserLogin();
    this.setLocalStorage('warehouses', this.warehouses!);
    return Result.Success();
  }

  // ─── stock levels ────────────────────────────────────────────────────────

  getStorageStockLevels(): WarehouseStockLevel[] {
    if (
      !this.stockLevels ||
      this.stockLevels.length === 0 ||
      this.getCurrentStorageKey('warehouse-stock-levels') !== this.lastStockLevelsKey
    ) {
      this.stockLevels = this.getFromLocalStorage<WarehouseStockLevel>(
        'warehouse-stock-levels',
        ['createdDate', 'updatedDate'],
      );
    }
    return this.stockLevels;
  }

  getStockLevels(warehouseId?: string): WarehouseStockLevel[] {
    return warehouseId
      ? this.getStorageStockLevels().filter((level) => level.warehouseId === warehouseId)
      : this.getStorageStockLevels();
  }

  getStockLevel(warehouseId: string, productId: string): WarehouseStockLevel | undefined {
    return this.getStorageStockLevels().find(
      (level) => level.warehouseId === warehouseId && level.productId === productId,
    );
  }

  // ─── movements ───────────────────────────────────────────────────────────

  getStorageMovements(): WarehouseStockMovement[] {
    if (
      !this.movements ||
      this.movements.length === 0 ||
      this.getCurrentStorageKey('warehouse-stock-movements') !== this.lastMovementsKey
    ) {
      this.movements = this.getFromLocalStorage<WarehouseStockMovement>(
        'warehouse-stock-movements',
        ['createdDate'],
      );
    }
    return this.movements;
  }

  getMovements(warehouseId?: string, productId?: string): WarehouseStockMovement[] {
    return this.getStorageMovements().filter(
      (movement) =>
        (!warehouseId || movement.warehouseId === warehouseId) &&
        (!productId || movement.productId === productId),
    );
  }

  // ─── recordMovement — única puerta de mutación de onHand ────────────────

  recordMovement(params: RecordWarehouseMovementParams): DataResult<WarehouseStockMovement> {
    const errors: BaseError[] = [];

    const quantityOk = validateMovementQuantity(params.quantity);
    if (!quantityOk.succeeded) errors.push(...quantityOk.errors);

    const warehouse = this.getWarehouseById(params.warehouseId);
    if (!warehouse) errors.push(WarehouseErrors.NotExists);
    else if (!warehouse.isActive) errors.push(WarehouseErrors.Inactive);

    const product = this.productRepository.getProductById(params.productId);
    if (!product) errors.push(WarehouseErrors.ProductNotExists);
    else if (!product.isActive) errors.push(WarehouseErrors.ProductNotActive);

    if (params.type === 'transfer_out') {
      if (!params.toWarehouseId || params.toWarehouseId === params.warehouseId) {
        errors.push(WarehouseErrors.SameWarehouseTransfer);
      } else if (params.toWarehouseId !== params.warehouseId) {
        const target = this.getWarehouseById(params.toWarehouseId);
        if (!target) errors.push(WarehouseErrors.NotExists);
        else if (!target.isActive) errors.push(WarehouseErrors.Inactive);
      }
    }
    if (params.type === 'transfer_in' && (!params.fromWarehouseId || params.fromWarehouseId === params.warehouseId)) {
      errors.push(WarehouseErrors.SameWarehouseTransfer);
    }

    if (errors.length > 0) {
      return new DataResultImpl<WarehouseStockMovement>(undefined, false, errors);
    }

    const quantity = round2(params.quantity);

    try {
      switch (params.type) {
        case 'purchase_in': {
          const costPrice = round2(params.costPrice ?? 0);
          if (!(costPrice > 0)) {
            return new DataResultImpl<WarehouseStockMovement>(undefined, false, [
              WarehouseErrors.QuantityInvalid,
            ]);
          }
          const level = this.getOrCreateStockLevel(params.warehouseId, params.productId);
          const next = applyMovement(level, 'purchase_in', quantity);
          level.onHand = next.onHand;
          level.costPrice = computeWeightedCost(
            { onHand: next.onHand - quantity, costPrice: level.costPrice },
            quantity,
            costPrice,
          );
          level.updatedDate = new Date();
          return new DataResultImpl<WarehouseStockMovement>(
            this.appendMovement({
              warehouseId: params.warehouseId,
              productId: params.productId,
              type: 'purchase_in',
              quantity,
              reason: params.reason ?? null,
            }),
            true,
            [],
          );
        }
        case 'sale_out': {
          const level = this.getStockLevel(params.warehouseId, params.productId);
          if (!level || level.onHand < quantity) {
            return new DataResultImpl<WarehouseStockMovement>(undefined, false, [
              WarehouseErrors.InsufficientStock,
            ]);
          }
          const next = applyMovement(level, 'sale_out', quantity);
          level.onHand = next.onHand;
          level.updatedDate = new Date();
          this.setLocalStorage('warehouse-stock-levels', this.stockLevels!);

          // Entrada a la tienda con el costo promedio del almacén.
          this.inventoryService.createInventoryEntry(params.productId, quantity, level.costPrice);

          return new DataResultImpl<WarehouseStockMovement>(
            this.appendMovement({
              warehouseId: params.warehouseId,
              productId: params.productId,
              type: 'sale_out',
              quantity,
              reason: params.reason ?? null,
            }),
            true,
            [],
          );
        }
        case 'transfer_out': {
          const level = this.getStockLevel(params.warehouseId, params.productId);
          if (!level || level.onHand < quantity) {
            return new DataResultImpl<WarehouseStockMovement>(undefined, false, [
              WarehouseErrors.InsufficientStock,
            ]);
          }
          const next = applyMovement(level, 'transfer_out', quantity);
          level.onHand = next.onHand;
          level.updatedDate = new Date();
          this.setLocalStorage('warehouse-stock-levels', this.stockLevels!);

          // Propaga el costo tal cual al destino (#4).
          const target = this.getOrCreateStockLevel(params.toWarehouseId!, params.productId);
          target.onHand = applyMovement(target, 'purchase_in', quantity).onHand;
          target.costPrice =
            target.onHand === quantity
              ? level.costPrice
              : computeWeightedCost(
                  { onHand: target.onHand - quantity, costPrice: target.costPrice },
                  quantity,
                  level.costPrice,
                );
          target.updatedDate = new Date();
          this.setLocalStorage('warehouse-stock-levels', this.stockLevels!);

          return new DataResultImpl<WarehouseStockMovement>(
            this.appendMovement({
              warehouseId: params.warehouseId,
              productId: params.productId,
              type: 'transfer_out',
              quantity,
              reason: params.reason ?? null,
              toWarehouseId: params.toWarehouseId,
            }),
            true,
            [],
          );
        }
        case 'transfer_in': {
          const from = this.getStockLevel(params.fromWarehouseId!, params.productId);
          if (!from || from.onHand < quantity) {
            return new DataResultImpl<WarehouseStockMovement>(undefined, false, [
              WarehouseErrors.InsufficientStock,
            ]);
          }
          const nextFrom = applyMovement(from, 'transfer_out', quantity);
          from.onHand = nextFrom.onHand;
          from.updatedDate = new Date();
          this.setLocalStorage('warehouse-stock-levels', this.stockLevels!);

          const target = this.getOrCreateStockLevel(params.warehouseId, params.productId);
          target.onHand = applyMovement(target, 'purchase_in', quantity).onHand;
          target.costPrice =
            target.onHand === quantity
              ? from.costPrice
              : computeWeightedCost(
                  { onHand: target.onHand - quantity, costPrice: target.costPrice },
                  quantity,
                  from.costPrice,
                );
          target.updatedDate = new Date();
          this.setLocalStorage('warehouse-stock-levels', this.stockLevels!);

          return new DataResultImpl<WarehouseStockMovement>(
            this.appendMovement({
              warehouseId: params.warehouseId,
              productId: params.productId,
              type: 'transfer_in',
              quantity,
              reason: params.reason ?? null,
              fromWarehouseId: params.fromWarehouseId,
            }),
            true,
            [],
          );
        }
        default:
          return new DataResultImpl<WarehouseStockMovement>(undefined, false, [
            WarehouseErrors.QuantityInvalid,
          ]);
      }
    } catch (err) {
      if (err instanceof Error && err.message === WarehouseErrors.InsufficientStock.description) {
        return new DataResultImpl<WarehouseStockMovement>(undefined, false, [
          WarehouseErrors.InsufficientStock,
        ]);
      }
      throw err;
    }
  }

  // ─── import seams (sync) ────────────────────────────────────────────────

  addImportedWarehouse(warehouse: Warehouse): Result {
    const revived = reviveDate(warehouse, ['createdDate', 'updatedDate']);
    this.getStorageWarehouses().push(revived);
    this.setLocalStorage('warehouses', this.warehouses!);
    return Result.Success();
  }

  updateImportedWarehouse(warehouse: Warehouse): Result {
    const existing = this.getWarehouseById(warehouse.id);
    if (existing) {
      const revived = reviveDate(warehouse, ['createdDate', 'updatedDate']);
      existing.name = revived.name;
      existing.isActive = revived.isActive;
      existing.updatedDate = revived.updatedDate;
      existing.updatedByName = revived.updatedByName;
      this.setLocalStorage('warehouses', this.warehouses!);
    }
    return Result.Success();
  }

  addImportedStockLevel(level: WarehouseStockLevel): Result {
    const revived = reviveDate(level, ['createdDate', 'updatedDate']);
    this.getStorageStockLevels().push(revived);
    this.setLocalStorage('warehouse-stock-levels', this.stockLevels!);
    return Result.Success();
  }

  updateImportedStockLevel(level: WarehouseStockLevel): Result {
    const existing = this.getStorageStockLevels().find(
      (l) => l.warehouseId === level.warehouseId && l.productId === level.productId,
    );
    if (existing) {
      const revived = reviveDate(level, ['createdDate', 'updatedDate']);
      existing.onHand = revived.onHand;
      existing.costPrice = revived.costPrice;
      existing.updatedDate = revived.updatedDate;
      this.setLocalStorage('warehouse-stock-levels', this.stockLevels!);
    }
    return Result.Success();
  }

  /** Movimientos append-only: agrega si el id no existe (no duplica). */
  addImportedMovement(movement: WarehouseStockMovement): Result {
    const exists = this.getStorageMovements().some((m) => m.id === movement.id);
    if (!exists) {
      const revived = reviveDate(movement, ['createdDate']);
      this.getStorageMovements().push(revived);
      this.setLocalStorage('warehouse-stock-movements', this.movements!);
    }
    return Result.Success();
  }

  // ─── json readers (export) ──────────────────────────────────────────────

  getWarehousesJson(): string {
    return JSON.stringify(this.getStorageWarehouses());
  }

  getStockLevelsJson(): string {
    return JSON.stringify(this.getStorageStockLevels());
  }

  getMovementsJson(): string {
    return JSON.stringify(this.getStorageMovements());
  }

  // ─── persistence helpers ────────────────────────────────────────────────

  private getOrCreateStockLevel(warehouseId: string, productId: string): WarehouseStockLevel {
    const existing = this.getStockLevel(warehouseId, productId);
    if (existing) return existing;
    const level: WarehouseStockLevel = {
      id: generateId(),
      warehouseId,
      productId,
      onHand: 0,
      costPrice: 0,
      createdDate: new Date(),
    };
    this.getStorageStockLevels().push(level);
    return level;
  }

  private appendMovement(input: {
    warehouseId: string;
    productId: string;
    type: WarehouseMovementType;
    quantity: number;
    reason: string | null;
    toWarehouseId?: string;
    fromWarehouseId?: string;
  }): WarehouseStockMovement {
    const movement: WarehouseStockMovement = {
      id: generateId(),
      warehouseId: input.warehouseId,
      productId: input.productId,
      type: input.type,
      quantity: input.quantity,
      reason: input.reason,
      createdDate: new Date(),
      createdByName: getCurrentUserLogin(),
      toWarehouseId: input.toWarehouseId,
      fromWarehouseId: input.fromWarehouseId,
    };
    this.getStorageMovements().push(movement);
    this.setLocalStorage('warehouse-stock-movements', this.movements!);
    return movement;
  }

  private getCurrentStorageKey(entity: string): string {
    return StorageKeys.entityKey(entity, this.storeId);
  }

  private getStorageKey(entity: string): string {
    if (entity === 'warehouses') this.lastWarehousesKey = this.getCurrentStorageKey(entity);
    else if (entity === 'warehouse-stock-levels') {
      this.lastStockLevelsKey = this.getCurrentStorageKey(entity);
    } else {
      this.lastMovementsKey = this.getCurrentStorageKey(entity);
    }
    return this.getCurrentStorageKey(entity);
  }

  private getFromLocalStorage<T>(entity: string, dateFields: string[]): T[] {
    const stored = readEntityOrThrow(this.getStorageKey(entity), (json) => {
      if (!json) return null;
      const parsed = JSON.parse(json) as T[];
      return parsed.map((item) => reviveDate(item, dateFields as (keyof T & string)[]));
    });
    if (stored) return stored;
    const empty: T[] = [];
    this.setLocalStorage(entity, empty);
    return empty;
  }

  private setLocalStorage(entity: string, value: unknown): void {
    localStorage.setItem(this.getStorageKey(entity), encryptEntity(JSON.stringify(value)));
  }
}