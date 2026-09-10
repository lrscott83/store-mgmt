import type {
  BaseError,
  DataResult,
  Warehouse,
  WarehouseMovementType,
  WarehouseStockLevel,
  WarehouseStockLot,
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
import {
  displayCost,
  splitByFifoLots,
  synthesizeLotFromLevel,
  validateMovementQuantity,
} from '../warehouse';

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
 * - `onHand` SOLO muta vía `recordMovement`/`reverseMovement` — no hay "set
 *   onHand" directo.
 * - Cantidades con round2 (#7); `reason` opcional (#6); desactivación bloqueada
 *   con stock o movimientos vivos (#5, recuento D12).
 *
 * Plan 2026-09-09 (lotes FIFO exactos + reversa, D8-D12):
 * - Cada Entrada crea un lote con su costo exacto; `sale_out`/`transfer_out`
 *   consumen lotes FIFO del más viejo al más nuevo y se dividen en N filas de
 *   movimiento por lote tocado, cada una con su costo exacto (D8).
 * - El costo que llega a la tienda es el costo del lote (nunca un promedio);
 *   una fila de salida enlaza 1:1 su entrada de tienda (`inventoryEntryId`, D11).
 * - `costPrice` del nivel es el display: promedio ponderado de los lotes
 *   restantes (F1b) — los números pineados por los E2E no cambian.
 * - Niveles legacy sin `lots` equivalen a un único lote sintético al costo
 *   promedio vigente (D8).
 * - `reverseMovement` compensa una fila con su lote exacto (D1/D9); la fila
 *   original nunca se muta.
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
      this.warehouses = this.getFromLocalStorage<Warehouse>('warehouses', [
        'createdDate',
        'updatedDate',
      ]);
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

    // Guardia D5/D12 (plan 2026-09-09): cuentan solo los movimientos VIVOS —
    // las reversas y las filas ya revertidas no bloquean la desactivación.
    const hasStock = this.getStockLevels(id).some((level) => level.onHand > 0);
    const hasLiveMovements = this.getLiveMovements(id).length > 0;
    if (hasStock || hasLiveMovements) {
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
      this.stockLevels = this.getFromLocalStorage<WarehouseStockLevel>('warehouse-stock-levels', [
        'createdDate',
        'updatedDate',
      ]);
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

  /**
   * Registra un movimiento consumiendo lotes FIFO con costo exacto (D8).
   * Una operación que cruza lotes genera VARIAS filas — el resultado es un
   * array (una fila por lote tocado). La dirección de cada fila la da su tipo.
   */
  recordMovement(params: RecordWarehouseMovementParams): DataResult<WarehouseStockMovement[]> {
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
    if (
      params.type === 'transfer_in' &&
      (!params.fromWarehouseId || params.fromWarehouseId === params.warehouseId)
    ) {
      errors.push(WarehouseErrors.SameWarehouseTransfer);
    }

    if (errors.length > 0) {
      return new DataResultImpl<WarehouseStockMovement[]>(undefined, false, errors);
    }

    const quantity = round2(params.quantity);

    try {
      switch (params.type) {
        case 'purchase_in': {
          const costPrice = round2(params.costPrice ?? 0);
          if (!(costPrice > 0)) {
            return new DataResultImpl<WarehouseStockMovement[]>(undefined, false, [
              WarehouseErrors.QuantityInvalid,
            ]);
          }
          // Cada compra crea un lote NUEVO con su costo exacto (D8) — nunca se
          // fusionan lotes.
          const level = this.getOrCreateStockLevel(params.warehouseId, params.productId);
          this.ensureLots(level);
          level.lots!.push({ costPrice, quantity });
          this.refreshLevelTotals(level);
          this.setLocalStorage('warehouse-stock-levels', this.stockLevels!);
          return new DataResultImpl<WarehouseStockMovement[]>(
            [
              this.appendMovement({
                warehouseId: params.warehouseId,
                productId: params.productId,
                type: 'purchase_in',
                quantity,
                reason: params.reason ?? null,
                costPrice,
              }),
            ],
            true,
            [],
          );
        }
        case 'sale_out': {
          const level = this.getStockLevel(params.warehouseId, params.productId);
          if (!level || level.onHand < quantity) {
            return new DataResultImpl<WarehouseStockMovement[]>(undefined, false, [
              WarehouseErrors.InsufficientStock,
            ]);
          }

          // Divide FIFO antes de mutar (D8) — sin mutación parcial.
          const slices = splitByFifoLots(this.ensureLots(level), quantity);

          // Snapshot for rollback: the store entries are created and confirmed
          // BEFORE the warehouse debit is persisted (plan 2026-09-08 BUG-2).
          const prevOnHand = level.onHand;
          const prevCostPrice = level.costPrice;
          const prevLots = level.lots!.map((l) => ({ ...l }));
          const prevUpdatedDate = level.updatedDate;

          // Una entrada de tienda POR LOTE tocado, al costo exacto del lote —
          // el costo que llega a la tienda nunca es un promedio (D8/D11).
          const created: { slice: WarehouseStockLot; entryId: string }[] = [];
          for (const slice of slices) {
            const entry = this.inventoryService.createInventoryEntry(
              params.productId,
              slice.quantity,
              slice.costPrice,
            );
            if (!entry || !entry.succeeded) {
              // Rollback: entradas ya creadas + nivel intacto en memoria.
              for (const done of created) {
                this.inventoryService.deleteInventoryEntry(params.productId, done.entryId);
              }
              level.onHand = prevOnHand;
              level.costPrice = prevCostPrice;
              level.lots = prevLots;
              level.updatedDate = prevUpdatedDate;
              return new DataResultImpl<WarehouseStockMovement[]>(undefined, false, [
                WarehouseErrors.ProductNotExists,
              ]);
            }
            created.push({ slice, entryId: entry.data!.id });
          }

          this.consumeLots(level, slices);
          this.refreshLevelTotals(level);
          this.setLocalStorage('warehouse-stock-levels', this.stockLevels!);

          const rows = created.map(({ slice, entryId }) =>
            this.appendMovement({
              warehouseId: params.warehouseId,
              productId: params.productId,
              type: 'sale_out',
              quantity: slice.quantity,
              reason: params.reason ?? null,
              costPrice: slice.costPrice,
              inventoryEntryId: entryId,
            }),
          );
          return new DataResultImpl<WarehouseStockMovement[]>(rows, true, []);
        }
        case 'transfer_out': {
          const level = this.getStockLevel(params.warehouseId, params.productId);
          if (!level || level.onHand < quantity) {
            return new DataResultImpl<WarehouseStockMovement[]>(undefined, false, [
              WarehouseErrors.InsufficientStock,
            ]);
          }
          // Divide FIFO antes de mutar (D8).
          const slices = splitByFifoLots(this.ensureLots(level), quantity);
          this.consumeLots(level, slices);
          this.refreshLevelTotals(level);

          // El destino acredita CADA lote a su costo exacto — sin mezcla
          // ponderada (D8; el GAP-3 mezcla-interna desaparece, el display no).
          const target = this.getOrCreateStockLevel(params.toWarehouseId!, params.productId);
          this.ensureLots(target);
          for (const slice of slices) target.lots!.push({ ...slice });
          this.refreshLevelTotals(target);
          this.setLocalStorage('warehouse-stock-levels', this.stockLevels!);

          const rows = slices.map((slice) =>
            this.appendMovement({
              warehouseId: params.warehouseId,
              productId: params.productId,
              type: 'transfer_out',
              quantity: slice.quantity,
              reason: params.reason ?? null,
              toWarehouseId: params.toWarehouseId,
              costPrice: slice.costPrice,
            }),
          );
          return new DataResultImpl<WarehouseStockMovement[]>(rows, true, []);
        }
        case 'transfer_in': {
          const from = this.getStockLevel(params.fromWarehouseId!, params.productId);
          if (!from || from.onHand < quantity) {
            return new DataResultImpl<WarehouseStockMovement[]>(undefined, false, [
              WarehouseErrors.InsufficientStock,
            ]);
          }
          // La transferencia inversa (sync/import) consume FIFO del origen y
          // acredita por lote en el destino — mismos lotes exactos (D8).
          const slices = splitByFifoLots(this.ensureLots(from), quantity);
          this.consumeLots(from, slices);
          this.refreshLevelTotals(from);

          const target = this.getOrCreateStockLevel(params.warehouseId, params.productId);
          this.ensureLots(target);
          for (const slice of slices) target.lots!.push({ ...slice });
          this.refreshLevelTotals(target);
          this.setLocalStorage('warehouse-stock-levels', this.stockLevels!);

          return new DataResultImpl<WarehouseStockMovement[]>(
            [
              this.appendMovement({
                warehouseId: params.warehouseId,
                productId: params.productId,
                type: 'transfer_in',
                quantity,
                reason: params.reason ?? null,
                fromWarehouseId: params.fromWarehouseId,
                costPrice: slices.length === 1 ? slices[0].costPrice : undefined,
              }),
            ],
            true,
            [],
          );
        }
        default:
          return new DataResultImpl<WarehouseStockMovement[]>(undefined, false, [
            WarehouseErrors.QuantityInvalid,
          ]);
      }
    } catch (err) {
      if (err instanceof Error && err.message === WarehouseErrors.InsufficientStock.description) {
        return new DataResultImpl<WarehouseStockMovement[]>(undefined, false, [
          WarehouseErrors.InsufficientStock,
        ]);
      }
      throw err;
    }
  }

  // ─── reverseMovement — compensación por lote exacto (plan 2026-09-09) ────

  /** true si la fila ya tiene una reversa emparejada (badge F5 + guardia D12). */
  isReversed(movementId: string): boolean {
    return this.getStorageMovements().some(
      (m) => m.type === 'reversal' && m.reversalOfMovementId === movementId,
    );
  }

  /**
   * Reversa de una fila de movimiento: compensa su lote al costo EXACTO y
   * agrega una fila `reversal` (la original nunca se muta, D1). Validaciones
   * en orden — la primera falla corta (plan F2).
   */
  reverseMovement(movementId: string, reason?: string): DataResult<WarehouseStockMovement> {
    const movement = this.getStorageMovements().find((m) => m.id === movementId);
    if (!movement) {
      return new DataResultImpl<WarehouseStockMovement>(undefined, false, [
        WarehouseErrors.MovementNotFound,
      ]);
    }
    if (movement.type === 'reversal') {
      return new DataResultImpl<WarehouseStockMovement>(undefined, false, [
        WarehouseErrors.ReversalNotReversible,
      ]);
    }
    if (this.isReversed(movementId)) {
      return new DataResultImpl<WarehouseStockMovement>(undefined, false, [
        WarehouseErrors.ReversalAlreadyExists,
      ]);
    }
    if (movement.type === 'transfer_in') {
      return new DataResultImpl<WarehouseStockMovement>(undefined, false, [
        WarehouseErrors.TransferInNotReversible,
      ]);
    }

    // Almacenes involucrados activos (validación 6).
    const origin = this.getWarehouseById(movement.warehouseId);
    if (!origin || !origin.isActive) {
      return new DataResultImpl<WarehouseStockMovement>(undefined, false, [
        WarehouseErrors.WarehouseNotActive,
      ]);
    }
    if (movement.type === 'transfer_out') {
      const target = movement.toWarehouseId ? this.getWarehouseById(movement.toWarehouseId) : undefined;
      if (!target || !target.isActive) {
        return new DataResultImpl<WarehouseStockMovement>(undefined, false, [
          WarehouseErrors.WarehouseNotActive,
        ]);
      }
    }

    try {
      switch (movement.type) {
        case 'purchase_in':
          return this.reversePurchase(movement, reason ?? null);
        case 'sale_out':
          return this.reverseSaleOut(movement, reason ?? null);
        case 'transfer_out':
          return this.reverseTransferOut(movement, reason ?? null);
        default:
          return new DataResultImpl<WarehouseStockMovement>(undefined, false, [
            WarehouseErrors.TransferInNotReversible,
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

  private reversePurchase(
    movement: WarehouseStockMovement,
    reason: string | null,
  ): DataResult<WarehouseStockMovement> {
    const level = this.getStockLevel(movement.warehouseId, movement.productId);
    if (!level || level.onHand <= 0) {
      return new DataResultImpl<WarehouseStockMovement>(undefined, false, [
        WarehouseErrors.PurchaseLotConsumed,
      ]);
    }
    this.ensureLots(level);

    if (movement.costPrice === undefined) {
      // Compra legacy sin costo en fila: revierte del lote sintético/único
      // vigente al costo display actual (mejor esfuerzo D8-legacy).
      const remaining = Math.min(movement.quantity, level.onHand);
      const cost = level.lots![0]?.costPrice ?? level.costPrice;
      this.removeLotUnits(level, cost, remaining);
      this.refreshLevelTotals(level);
      this.setLocalStorage('warehouse-stock-levels', this.stockLevels!);
      return new DataResultImpl<WarehouseStockMovement>(
        this.appendMovement({
          warehouseId: movement.warehouseId,
          productId: movement.productId,
          type: 'reversal',
          quantity: round2(remaining),
          reason,
          reversalOfMovementId: movement.id,
          costPrice: cost,
        }),
        true,
        [],
      );
    }

    // Unidades restantes del lote a este costo exacto (D9).
    const remainingInLot = level.lots!
      .filter((l) => l.costPrice === movement.costPrice)
      .reduce((sum, l) => round2(sum + l.quantity), 0);
    if (remainingInLot <= 0) {
      return new DataResultImpl<WarehouseStockMovement>(undefined, false, [
        WarehouseErrors.PurchaseLotConsumed,
      ]);
    }
    const toRevert = Math.min(movement.quantity, remainingInLot);
    this.removeLotUnits(level, movement.costPrice, toRevert);
    this.refreshLevelTotals(level);
    this.setLocalStorage('warehouse-stock-levels', this.stockLevels!);
    return new DataResultImpl<WarehouseStockMovement>(
      this.appendMovement({
        warehouseId: movement.warehouseId,
        productId: movement.productId,
        type: 'reversal',
        quantity: round2(toRevert),
        reason,
        reversalOfMovementId: movement.id,
        costPrice: movement.costPrice,
      }),
      true,
      [],
    );
  }

  private reverseSaleOut(
    movement: WarehouseStockMovement,
    reason: string | null,
  ): DataResult<WarehouseStockMovement> {
    // Localiza la entrada de tienda (D11): enlace exacto primero.
    let entryId: string | undefined;
    if (movement.inventoryEntryId) {
      entryId = movement.inventoryEntryId;
    } else {
      // Huella legacy: producto + cantidad + costo + mismo día local.
      const day = new Date(movement.createdDate).toDateString();
      const candidates = this.inventoryService
        .getProductInventoriesByProductId(movement.productId)
        .filter(
          (e) =>
            e.isActive &&
            e.quantity === movement.quantity &&
            round2(e.costPrice) === round2(movement.costPrice ?? e.costPrice) &&
            new Date(e.createdDate).toDateString() === day,
        );
      if (movement.costPrice === undefined) {
        // Legacy puro: cualquier entrada activa del producto con la cantidad exacta ese día.
        const byQtyDay = candidates.filter((e) => e.quantity === movement.quantity);
        if (byQtyDay.length === 0) {
          return new DataResultImpl<WarehouseStockMovement>(undefined, false, [
            WarehouseErrors.SaleOutEntryNotFound,
          ]);
        }
        if (byQtyDay.length > 1) {
          return new DataResultImpl<WarehouseStockMovement>(undefined, false, [
            WarehouseErrors.SaleOutAmbiguousEntry,
          ]);
        }
        entryId = byQtyDay[0].id;
      } else {
        if (candidates.length === 0) {
          return new DataResultImpl<WarehouseStockMovement>(undefined, false, [
            WarehouseErrors.SaleOutEntryNotFound,
          ]);
        }
        if (candidates.length > 1) {
          return new DataResultImpl<WarehouseStockMovement>(undefined, false, [
            WarehouseErrors.SaleOutAmbiguousEntry,
          ]);
        }
        entryId = candidates[0].id;
      }
    }

    // La entrada debe existir, estar activa e íntegra (D3).
    const entry = this.inventoryService
      .getProductInventoriesByProductId(movement.productId)
      .find((e) => e.id === entryId);
    if (!entry || !entry.isActive) {
      return new DataResultImpl<WarehouseStockMovement>(undefined, false, [
        WarehouseErrors.SaleOutEntryNotFound,
      ]);
    }
    if (entry.available < movement.quantity) {
      return new DataResultImpl<WarehouseStockMovement>(undefined, false, [
        WarehouseErrors.SaleOutAlreadyConsumed,
      ]);
    }

    // Elimina la entrada (soft-delete) y re-acredita el lote al costo exacto.
    const deleteResult = this.inventoryService.deleteInventoryEntry(
      movement.productId,
      entry.id,
    );
    if (!deleteResult.succeeded) {
      return new DataResultImpl<WarehouseStockMovement>(undefined, false, deleteResult.errors);
    }

    const cost = movement.costPrice ?? entry.costPrice;
    const level = this.getOrCreateStockLevel(movement.warehouseId, movement.productId);
    this.creditLotUnits(level, cost, movement.quantity);
    this.refreshLevelTotals(level);
    this.setLocalStorage('warehouse-stock-levels', this.stockLevels!);

    return new DataResultImpl<WarehouseStockMovement>(
      this.appendMovement({
        warehouseId: movement.warehouseId,
        productId: movement.productId,
        type: 'reversal',
        quantity: movement.quantity,
        reason,
        reversalOfMovementId: movement.id,
        costPrice: cost,
        reversalInventoryEntryId: entry.id,
      }),
      true,
      [],
    );
  }

  private reverseTransferOut(
    movement: WarehouseStockMovement,
    reason: string | null,
  ): DataResult<WarehouseStockMovement> {
    const cost = movement.costPrice;
    const target = this.getStockLevel(movement.toWarehouseId!, movement.productId);
    if (!target || target.onHand < movement.quantity) {
      return new DataResultImpl<WarehouseStockMovement>(undefined, false, [
        WarehouseErrors.InsufficientStock,
      ]);
    }
    this.ensureLots(target);

    // Resta del destino: exactamente las unidades de este lote.
    if (cost === undefined) {
      // Legacy sin costo: descuenta FIFO del destino (mejor esfuerzo).
      const slices = splitByFifoLots(target.lots!, movement.quantity);
      this.consumeLots(target, slices);
    } else {
      this.removeLotUnits(target, cost, movement.quantity);
    }
    this.refreshLevelTotals(target);

    // Re-acredita el lote en el origen al costo exacto.
    const origin = this.getOrCreateStockLevel(movement.warehouseId, movement.productId);
    this.creditLotUnits(origin, cost ?? target.costPrice, movement.quantity);
    this.refreshLevelTotals(origin);
    this.setLocalStorage('warehouse-stock-levels', this.stockLevels!);

    return new DataResultImpl<WarehouseStockMovement>(
      this.appendMovement({
        warehouseId: movement.warehouseId,
        productId: movement.productId,
        type: 'reversal',
        quantity: movement.quantity,
        reason,
        reversalOfMovementId: movement.id,
        costPrice: cost ?? target.costPrice,
      }),
      true,
      [],
    );
  }

  // ─── lotes — helpers internos (D8) ────────────────────────────────────────

  /** Nivel legacy sin lots → un único lote sintético al costo promedio vigente (D8). */
  private ensureLots(level: WarehouseStockLevel): WarehouseStockLot[] {
    if (!level.lots) {
      level.lots = synthesizeLotFromLevel(level);
    }
    return level.lots;
  }

  /** Consume los tramos FIFO de los lotes del nivel (mutación validada antes). */
  private consumeLots(level: WarehouseStockLevel, slices: WarehouseStockLot[]): void {
    for (const slice of slices) {
      this.removeLotUnits(level, slice.costPrice, slice.quantity);
    }
  }

  /** Quita `quantity` unidades del(los) lote(s) a `costPrice`, FIFO dentro del mismo costo. */
  private removeLotUnits(level: WarehouseStockLevel, costPrice: number, quantity: number): void {
    let remaining = round2(quantity);
    const lots = level.lots!;
    for (let i = 0; i < lots.length && remaining > 0; i++) {
      const lot = lots[i];
      if (round2(lot.costPrice) !== round2(costPrice)) continue;
      const take = round2(Math.min(remaining, lot.quantity));
      lot.quantity = round2(lot.quantity - take);
      remaining = round2(remaining - take);
      if (lot.quantity <= 0) {
        lots.splice(i, 1);
        i--;
      }
    }
    if (remaining > 0) {
      throw new Error(WarehouseErrors.InsufficientStock.description);
    }
  }

  /**
   * Re-acredita unidades de una reversa al costo exacto del lote original:
   * fusiona con un lote existente al mismo costo (restaurando su posición
   * FIFO) o inserta uno nuevo al final (D8 — la reversa es exacta, no promedia).
   */
  private creditLotUnits(level: WarehouseStockLevel, costPrice: number, quantity: number): void {
    const lots = this.ensureLots(level);
    const exact = lots.find((l) => round2(l.costPrice) === round2(costPrice));
    if (exact) {
      exact.quantity = round2(exact.quantity + quantity);
    } else {
      lots.push({ costPrice, quantity: round2(quantity) });
    }
  }

  /** Recalcula onHand (Σ lotes) y costPrice (display ponderado, F1b). */
  private refreshLevelTotals(level: WarehouseStockLevel): void {
    let total = 0;
    for (const lot of level.lots ?? []) total = round2(total + lot.quantity);
    level.onHand = total;
    level.costPrice = displayCost(level.lots ?? []);
    level.updatedDate = new Date();
  }

  /** Movimientos vivos del almacén: ni reversas ni filas ya revertidas (D12). */
  private getLiveMovements(warehouseId: string): WarehouseStockMovement[] {
    return this.getMovements(warehouseId).filter(
      (m) => m.type !== 'reversal' && !this.isReversed(m.id),
    );
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

  /**
   * Movimientos append-only: agrega si el id no existe (no duplica). Una
   * reversa cuyo original ya tiene reversa local se salta en silencio
   * (plan 2026-09-09, F7.3 — el otro dispositivo revirtió lo mismo).
   */
  addImportedMovement(movement: WarehouseStockMovement): Result {
    const exists = this.getStorageMovements().some((m) => m.id === movement.id);
    const duplicateReversal =
      movement.type === 'reversal' &&
      movement.reversalOfMovementId !== undefined &&
      this.isReversed(movement.reversalOfMovementId);
    if (!exists && !duplicateReversal) {
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
    /** Costo exacto del lote (D8). */
    costPrice?: number;
    /** sale_out → entrada de tienda creada (enlace 1:1, D11). */
    inventoryEntryId?: string;
    /** reversal → fila original compensada (D7a). */
    reversalOfMovementId?: string;
    /** reversal de sale_out → entrada restaurada/eliminada (D11). */
    reversalInventoryEntryId?: string;
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
      costPrice: input.costPrice,
      inventoryEntryId: input.inventoryEntryId,
      reversalOfMovementId: input.reversalOfMovementId,
      reversalInventoryEntryId: input.reversalInventoryEntryId,
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
