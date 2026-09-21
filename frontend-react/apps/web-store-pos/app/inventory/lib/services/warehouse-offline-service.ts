import type {
  BaseError,
  DataResult,
  InventoryEntry,
  Order,
  Warehouse,
  WarehouseMovementType,
  WarehouseStockLevel,
  WarehouseStockLot,
  WarehouseStockMovement,
} from '@store-mgmt/domain';
import {
  DataResult as DataResultImpl,
  DEFAULT_CURRENCY,
  Result,
  WarehouseErrors,
} from '@store-mgmt/domain';
import { StorageKeys } from '~/shared/lib/storage/storage-keys';
import { encryptEntity } from '~/shared/lib/storage/entity-crypto';
import { readEntityOrThrow } from '~/shared/lib/storage/read-entity-or-throw';
import { getCurrentUserLogin } from '~/shared/lib/auth/current-user';
import { round2 } from '~/shared/lib/money';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';
import { InventoryOfflineService } from './inventory-offline-service';
import {
  attributePurchaseOutflow,
  displayCost,
  remainingPurchaseUnits,
  splitByFifoLots,
  summarizeOrderImpact,
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
/** Resumen del impacto de una corrección de costo sobre las órdenes. */
export interface ProductCostCorrectionResult {
  activeOrders: number;
  deactivatedOrders: number;
  updatedLines: number;
}

/**
 * Puerto mínimo de órdenes que consume la propagación de costo (Fase 3). Lo
 * implementa estructuralmente `OrderOfflineService`. Es OPCIONAL en el
 * constructor para no romper las construcciones existentes (tests de almacén);
 * sin él, la propagación no toca ventas pero sí el stock en tienda.
 */
export interface PurchaseCostOrderPort {
  getStorageOrders(): Order[];
  updateProductCostsByInventoryIds(
    costsByInventoryId: ReadonlyMap<string, number>,
  ): ProductCostCorrectionResult;
  restoreOrdersSnapshot(orders: Order[]): void;
}

/** Vistazo previo (solo lectura) para la confirmación con detalle. */
export interface PurchasePropagationPreview {
  /** true = la compra tiene unidades fuera del almacén que corregir. */
  hasOutflow: boolean;
  saleOutMovements: number;
  storeEntries: number;
  activeOrders: number;
  deactivatedOrders: number;
  soldUnits: number;
  storeUnits: number;
  from: number;
  to: number;
}

/** Resultado de aplicar la edición de costo de una compra. */
export interface PurchaseCostEditOutcome {
  /** true = no había remanente en almacén; solo se corrigió el costo de lo vendido. */
  costOnly: boolean;
  storeEntries: number;
  activeOrders: number;
  deactivatedOrders: number;
  /** Id de la compra recreada (solo en la ruta con reversa). */
  createdMovementId?: string;
}

/** Salidas a tienda atribuidas a una compra + sus entradas espejo resueltas. */
interface ResolvedPurchaseOutflow {
  movements: WarehouseStockMovement[];
  entries: InventoryEntry[];
}

/** Snapshot en memoria para el rollback de la edición atómica. */
interface PurchaseEditSnapshot {
  levels: WarehouseStockLevel[];
  entriesByProduct: Map<string, InventoryEntry[]>;
  movements: WarehouseStockMovement[];
  orders: Order[] | undefined;
}

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
  /** sale_out → tienda destino (id). Opcional en otros tipos. */
  toStoreId?: string;
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
    private readonly orderPort?: PurchaseCostOrderPort,
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
// currency-in-costs-and-prices (plan 2026-09-16): the lot's exact cost currency.
          // A4: la tanda queda referenciada a su movimiento de compra.
          const purchaseMovementId = generateId();
          level.lots!.push({
            costPrice,
            quantity,
            currency: DEFAULT_CURRENCY,
            lotOriginMovementId: purchaseMovementId,
          });
          this.refreshLevelTotals(level);
          this.setLocalStorage('warehouse-stock-levels', this.stockLevels!);
          return new DataResultImpl<WarehouseStockMovement[]>(
            [
              this.appendMovement({
                id: purchaseMovementId,
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
          // A8: cada entrada queda sellada con su salida (no editable por CRUD).
          const created: { slice: WarehouseStockLot; entryId: string; movementId: string }[] = [];
          for (const slice of slices) {
            const entry = this.inventoryService.createInventoryEntry(
              params.productId,
              slice.quantity,
              slice.costPrice,
            );
            const movementId = generateId();
            const marked =
              entry &&
              entry.succeeded &&
              this.inventoryService.markEntryWarehouseOrigin(
                params.productId,
                entry.data!.id,
                movementId,
              );
            if (!entry || !entry.succeeded || !marked || !marked.succeeded) {
              // Rollback: entradas ya creadas + nivel intacto en memoria.
              if (entry && entry.succeeded) {
                this.inventoryService.deleteInventoryEntry(params.productId, entry.data!.id);
              }
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
            created.push({ slice, entryId: entry.data!.id, movementId });
          }

          this.consumeLots(level, slices);
          this.refreshLevelTotals(level);
          this.setLocalStorage('warehouse-stock-levels', this.stockLevels!);

          const rows = created.map(({ slice, entryId, movementId }) =>
            this.appendMovement({
              id: movementId,
              warehouseId: params.warehouseId,
              productId: params.productId,
              type: 'sale_out',
              quantity: slice.quantity,
              reason: params.reason ?? null,
              costPrice: slice.costPrice,
              inventoryEntryId: entryId,
              toStoreId: params.toStoreId,
              // Fase 3: referencia determinista compra → salida (si el lote la traía).
              lotOriginMovementId: slice.lotOriginMovementId,
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
          for (const slice of slices)
            target.lots!.push({ ...slice, currency: slice.currency ?? DEFAULT_CURRENCY });
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
          for (const slice of slices)
            target.lots!.push({ ...slice, currency: slice.currency ?? DEFAULT_CURRENCY });
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
                // A6: transfer_in multi-tanda persiste su costo ponderado exacto.
                costPrice: (() => {
                  let totalQty = 0;
                  let totalCost = 0;
                  for (const s of slices) {
                    totalQty = round2(totalQty + s.quantity);
                    totalCost = round2(totalCost + s.quantity * s.costPrice);
                  }
                  return totalQty > 0 ? round2(totalCost / totalQty) : undefined;
                })(),
              }),
            ],
            true,
            [],
          );
        }
        case 'consumption_out': {
          // Elaboración (plan 2026-09-04-elaboration-module.md): consumo de
          // insumos por una elaboración. Descuenta FIFO con costo exacto por
          // tramo (D8) como sale_out/transfer_out, pero NO crea entrada de
          // tienda — consumir no es vender.
          const level = this.getStockLevel(params.warehouseId, params.productId);
          if (!level || level.onHand < quantity) {
            return new DataResultImpl<WarehouseStockMovement[]>(undefined, false, [
              WarehouseErrors.InsufficientStock,
            ]);
          }
          const slices = splitByFifoLots(this.ensureLots(level), quantity);
          this.consumeLots(level, slices);
          this.refreshLevelTotals(level);
          this.setLocalStorage('warehouse-stock-levels', this.stockLevels!);

          const rows = slices.map((slice) =>
            this.appendMovement({
              warehouseId: params.warehouseId,
              productId: params.productId,
              type: 'consumption_out',
              quantity: slice.quantity,
              reason: params.reason ?? null,
              costPrice: slice.costPrice,
            }),
          );
          return new DataResultImpl<WarehouseStockMovement[]>(rows, true, []);
        }
        case 'elaboration_in': {
          // Elaboración (plan 2026-09-04-elaboration-module.md): alta del
          // producto terminado en el almacén, valorada al costo real por unidad
          // que calculó la elaboración (lote nuevo, mismo modelo que
          // purchase_in). La entrada de tienda vendible la crea
          // `ElaborationOfflineService` aparte.
          const costPrice = round2(params.costPrice ?? 0);
          const level = this.getOrCreateStockLevel(params.warehouseId, params.productId);
          this.ensureLots(level);
          level.lots!.push({ costPrice, quantity, currency: DEFAULT_CURRENCY });
          this.refreshLevelTotals(level);
          this.setLocalStorage('warehouse-stock-levels', this.stockLevels!);
          return new DataResultImpl<WarehouseStockMovement[]>(
            [
              this.appendMovement({
                warehouseId: params.warehouseId,
                productId: params.productId,
                type: 'elaboration_in',
                quantity,
                reason: params.reason ?? null,
                costPrice,
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
      const target = movement.toWarehouseId
        ? this.getWarehouseById(movement.toWarehouseId)
        : undefined;
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
      // Compra sin costo en fila: revierte al costo promedio del nivel
      // (plan 2026-09-16, A9b — no al costo de la tanda más vieja).
      // Descuenta FIFO (las tandas no tienen ese costo) y valora la reversa al promedio.
      const remaining = Math.min(movement.quantity, level.onHand);
      const cost = level.costPrice;
      const slices = splitByFifoLots(level.lots!, remaining);
      this.consumeLots(level, slices);
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

// Unidades restantes de ESTA compra (A4): por referencia de origen.
    // Fallback por costo SOLO para datos viejos (ninguna tanda con referencia).
    // La cuenta vive en `remainingPurchaseUnits` (plan 2026-09-16, A1) para que
    // la ruta calcule el tope de edición con la MISMA regla que la reversa.
    const useOrigin = level.lots!.some((l) => l.lotOriginMovementId !== undefined);
    const remainingInLot = remainingPurchaseUnits(level, movement);
    if (remainingInLot <= 0) {
      return new DataResultImpl<WarehouseStockMovement>(undefined, false, [
        WarehouseErrors.PurchaseLotConsumed,
      ]);
    }
    const toRevert = Math.min(movement.quantity, remainingInLot);
    if (useOrigin) {
      this.removeLotUnitsByOrigin(level, movement.id, toRevert);
    } else {
      this.removeLotUnits(level, movement.costPrice, toRevert);
    }
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
    // A8: la entrada espejo no debe haberse editado — la reversa es exacta o se bloquea.
    if (round2(entry.quantity) !== round2(movement.quantity)) {
      return new DataResultImpl<WarehouseStockMovement>(undefined, false, [
        WarehouseErrors.SaleOutEntryModified,
      ]);
    }
    if (entry.available < movement.quantity) {
      return new DataResultImpl<WarehouseStockMovement>(undefined, false, [
        WarehouseErrors.SaleOutAlreadyConsumed,
      ]);
    }

    // Elimina la entrada (soft-delete) y re-acredita el lote al costo exacto.
    const deleteResult = this.inventoryService.deleteInventoryEntry(movement.productId, entry.id);
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
    const origin = this.getOrCreateStockLevel(movement.warehouseId, movement.productId);
    this.ensureLots(origin);

    // A2 "todo o nada": snapshot en memoria; si algo falla, restaurar y
    // devolver error sin tocar el storage.
    const snapTarget = {
      onHand: target.onHand,
      costPrice: target.costPrice,
      lots: target.lots!.map((l) => ({ ...l })),
      updatedDate: target.updatedDate,
    };
    const snapOrigin = {
      onHand: origin.onHand,
      costPrice: origin.costPrice,
      lots: origin.lots!.map((l) => ({ ...l })),
      updatedDate: origin.updatedDate,
    };
    try {
      // Resta del destino: exactamente las unidades de este lote.
      if (cost === undefined) {
        // Sin costo en la fila (datos nuevos siempre lo traen — A6/A7):
        // descuenta FIFO del destino y acredita al promedio del nivel.
        const slices = splitByFifoLots(target.lots!, movement.quantity);
        this.consumeLots(target, slices);
      } else {
        this.removeLotUnits(target, cost, movement.quantity);
      }
      this.refreshLevelTotals(target);

      // Re-acredita el lote en el origen al costo exacto (A3: al inicio).
      this.creditLotUnits(origin, cost ?? target.costPrice, movement.quantity);
      this.refreshLevelTotals(origin);
    } catch (err) {
      target.onHand = snapTarget.onHand;
      target.costPrice = snapTarget.costPrice;
      target.lots = snapTarget.lots;
      target.updatedDate = snapTarget.updatedDate;
      origin.onHand = snapOrigin.onHand;
      origin.costPrice = snapOrigin.costPrice;
      origin.lots = snapOrigin.lots;
      origin.updatedDate = snapOrigin.updatedDate;
      if (err instanceof Error && err.message === WarehouseErrors.InsufficientStock.description) {
        return new DataResultImpl<WarehouseStockMovement>(undefined, false, [
          WarehouseErrors.InsufficientStock,
        ]);
      }
      throw err;
    }
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

  // ─── Edición de costo de compras + propagación (plan 2026-09-16, Fase 3) ──

  /**
   * Vistazo previo (solo lectura) de lo que la edición del costo de una compra
   * afectaría FUERA del almacén: las ventas que consumieron sus unidades y el
   * stock que sigue en tienda. `hasOutflow` decide si la UI pide confirmación.
   */
  getPurchasePropagationPreview(
    purchaseId: string,
    newCostPrice: number,
  ): DataResult<PurchasePropagationPreview> {
    const purchase = this.getStorageMovements().find((m) => m.id === purchaseId);
    if (!purchase) {
      return new DataResultImpl<PurchasePropagationPreview>(undefined, false, [
        WarehouseErrors.MovementNotFound,
      ]);
    }
    if (purchase.type !== 'purchase_in') {
      return new DataResultImpl<PurchasePropagationPreview>(undefined, false, [
        WarehouseErrors.QuantityInvalid,
      ]);
    }
    // R3-1: una compra ya revertida no se vuelve a editar (evita re-propagar).
    if (this.isReversed(purchaseId)) {
      return new DataResultImpl<PurchasePropagationPreview>(undefined, false, [
        WarehouseErrors.PurchaseAlreadyReversed,
      ]);
    }

    const resolved = this.resolvePurchaseOutflow(purchase);
    if (!resolved.succeeded) {
      return new DataResultImpl<PurchasePropagationPreview>(undefined, false, resolved.errors);
    }
    const { movements, entries } = resolved.data!;
    const entryIds = new Set(entries.map((e) => e.id));
    const orders = this.orderPort?.getStorageOrders() ?? [];
    const impact = summarizeOrderImpact(orders, entryIds);

    return new DataResultImpl<PurchasePropagationPreview>(
      {
        hasOutflow: movements.length > 0,
        saleOutMovements: movements.length,
        storeEntries: entries.length,
        activeOrders: impact.activeOrders,
        deactivatedOrders: impact.deactivatedOrders,
        soldUnits: impact.soldUnits,
        storeUnits: round2(entries.reduce((sum, e) => round2(sum + e.available), 0)),
        from: round2(purchase.costPrice ?? 0),
        to: round2(newCostPrice),
      },
      true,
      [],
    );
  }

  /**
   * Edición atómica del costo de una compra (Fase 3): reversa + recreación del
   * remanente del almacén — o SOLO corrección de costo si no queda remanente
   * (decisión ratificada 2026-09-20, #1) — y propagación del costo nuevo a las
   * entradas de tienda y a las órdenes ACTIVAS que consumieron esas unidades
   * (decisión #2). "Todo o nada": ante cualquier fallo restaura los snapshots en
   * memoria y no deja escritura parcial.
   *
   * Corrección LOCAL únicamente (decisión #3): no viaja por import/export.
   */
  applyPurchaseCostEdit(
    purchaseId: string,
    newQuantity: number,
    newCostPrice: number,
  ): DataResult<PurchaseCostEditOutcome> {
    const purchase = this.getStorageMovements().find((m) => m.id === purchaseId);
    if (!purchase) {
      return new DataResultImpl<PurchaseCostEditOutcome>(undefined, false, [
        WarehouseErrors.MovementNotFound,
      ]);
    }
    if (purchase.type !== 'purchase_in') {
      return new DataResultImpl<PurchaseCostEditOutcome>(undefined, false, [
        WarehouseErrors.QuantityInvalid,
      ]);
    }
    // R3-1: tras una edición exitosa la compra original queda revertida; volver a
    // enviar el mismo id re-aplicaría la corrección (doble escritura silenciosa).
    if (this.isReversed(purchaseId)) {
      return new DataResultImpl<PurchaseCostEditOutcome>(undefined, false, [
        WarehouseErrors.PurchaseAlreadyReversed,
      ]);
    }
    if (!(round2(newCostPrice) > 0)) {
      return new DataResultImpl<PurchaseCostEditOutcome>(undefined, false, [
        WarehouseErrors.QuantityInvalid,
      ]);
    }
    const warehouse = this.getWarehouseById(purchase.warehouseId);
    if (!warehouse || !warehouse.isActive) {
      return new DataResultImpl<PurchaseCostEditOutcome>(undefined, false, [
        WarehouseErrors.WarehouseNotActive,
      ]);
    }
    const product = this.productRepository.getProductById(purchase.productId);
    if (!product) {
      return new DataResultImpl<PurchaseCostEditOutcome>(undefined, false, [
        WarehouseErrors.ProductNotExists,
      ]);
    }
    if (!product.isActive) {
      return new DataResultImpl<PurchaseCostEditOutcome>(undefined, false, [
        WarehouseErrors.ProductNotActive,
      ]);
    }

    const resolved = this.resolvePurchaseOutflow(purchase);
    if (!resolved.succeeded) {
      return new DataResultImpl<PurchaseCostEditOutcome>(undefined, false, resolved.errors);
    }
    const { movements, entries } = resolved.data!;

    const level = this.getStockLevel(purchase.warehouseId, purchase.productId);
    const remaining = remainingPurchaseUnits(level, purchase);
    const costOnly = remaining <= 0;

    if (costOnly) {
      // R3-3: en modo costOnly el almacén está en 0 y el llamador no debe enviar
      // cantidad. Se RECHAZA una cantidad inconsistente (≠ 0) en vez de ignorarla.
      if (round2(newQuantity) !== 0) {
        return new DataResultImpl<PurchaseCostEditOutcome>(undefined, false, [
          WarehouseErrors.QuantityInvalid,
        ]);
      }
      if (movements.length === 0) {
        return new DataResultImpl<PurchaseCostEditOutcome>(undefined, false, [
          WarehouseErrors.PurchasePropagationNoOutflow,
        ]);
      }
    } else {
      const qtyOk = validateMovementQuantity(newQuantity);
      if (!qtyOk.succeeded) {
        return new DataResultImpl<PurchaseCostEditOutcome>(undefined, false, qtyOk.errors);
      }
      if (round2(newQuantity) > round2(remaining + 1e-9)) {
        return new DataResultImpl<PurchaseCostEditOutcome>(undefined, false, [
          WarehouseErrors.QuantityInvalid,
        ]);
      }
    }

    const snapshot = this.snapshotPurchaseEdit(purchase.productId);

    try {
      let createdMovementId: string | undefined;

      // (c) Almacén: reversa + recreación del remanente (salvo corrección pura).
      if (!costOnly) {
        const reversal = this.reverseMovement(purchaseId);
        if (!reversal.succeeded) {
          this.restorePurchaseEdit(snapshot);
          return new DataResultImpl<PurchaseCostEditOutcome>(undefined, false, reversal.errors);
        }
        const recreated = this.recordMovement({
          type: 'purchase_in',
          warehouseId: purchase.warehouseId,
          productId: purchase.productId,
          quantity: newQuantity,
          costPrice: newCostPrice,
        });
        if (!recreated.succeeded) {
          this.restorePurchaseEdit(snapshot);
          return new DataResultImpl<PurchaseCostEditOutcome>(undefined, false, recreated.errors);
        }
        createdMovementId = recreated.data?.[0]?.id;
      }

      // (b) Stock en tienda: corrige el costo de cada entrada espejo.
      for (const entry of entries) {
        const updated = this.inventoryService.updateWarehouseOriginEntryCost(
          purchase.productId,
          entry.id,
          round2(newCostPrice),
        );
        if (!updated.succeeded) {
          this.restorePurchaseEdit(snapshot);
          return new DataResultImpl<PurchaseCostEditOutcome>(undefined, false, updated.errors);
        }
      }

      // (a) Ventas ACTIVAS: corrige el snapshot de costo por entrada.
      const costs = new Map(entries.map((e) => [e.id, round2(newCostPrice)] as const));
      const impact = this.orderPort
        ? this.orderPort.updateProductCostsByInventoryIds(costs)
        : { activeOrders: 0, deactivatedOrders: 0, updatedLines: 0 };

      return new DataResultImpl<PurchaseCostEditOutcome>(
        {
          costOnly,
          storeEntries: entries.length,
          activeOrders: impact.activeOrders,
          deactivatedOrders: impact.deactivatedOrders,
          createdMovementId,
        },
        true,
        [],
      );
    } catch (err) {
      this.restorePurchaseEdit(snapshot);
      if (err instanceof Error) {
        return new DataResultImpl<PurchaseCostEditOutcome>(undefined, false, [
          { code: 'Warehouse.PurchaseCostEditFailed', description: err.message },
        ]);
      }
      throw err;
    }
  }

  /** Atribuye las salidas a tienda de una compra y resuelve sus entradas espejo. */
  private resolvePurchaseOutflow(purchase: WarehouseStockMovement): DataResult<ResolvedPurchaseOutflow> {
    const attribution = attributePurchaseOutflow(
      purchase,
      this.getStorageMovements(),
      (id) => this.isReversed(id),
    );
    if (!attribution.succeeded) {
      return new DataResultImpl<ResolvedPurchaseOutflow>(undefined, false, [
        WarehouseErrors.PurchasePropagationAmbiguous,
      ]);
    }
    const entries: InventoryEntry[] = [];
    for (const movement of attribution.saleOutMovements) {
      const resolved = this.resolveSaleOutEntry(movement);
      if (!resolved.succeeded) {
        return new DataResultImpl<ResolvedPurchaseOutflow>(undefined, false, resolved.errors);
      }
      entries.push(resolved.data!);
    }
    return new DataResultImpl<ResolvedPurchaseOutflow>(
      { movements: attribution.saleOutMovements, entries },
      true,
      [],
    );
  }

  /**
   * Localiza y valida la entrada espejo de una fila `sale_out` (enlace exacto o
   * huella legacy), SIN exigir que no haya sido consumida: para la propagación
   * el consumo es lo esperado (son justamente las unidades vendidas).
   */
  private resolveSaleOutEntry(movement: WarehouseStockMovement): DataResult<InventoryEntry> {
    const entries = this.inventoryService.getProductInventoriesByProductId(movement.productId);
    let entryId = movement.inventoryEntryId;
    if (!entryId) {
      const day = new Date(movement.createdDate).toDateString();
      const candidates = entries.filter(
        (e) =>
          e.isActive &&
          e.quantity === movement.quantity &&
          round2(e.costPrice) === round2(movement.costPrice ?? e.costPrice) &&
          new Date(e.createdDate).toDateString() === day,
      );
      if (candidates.length === 0) {
        return new DataResultImpl<InventoryEntry>(undefined, false, [
          WarehouseErrors.SaleOutEntryNotFound,
        ]);
      }
      if (candidates.length > 1) {
        return new DataResultImpl<InventoryEntry>(undefined, false, [
          WarehouseErrors.SaleOutAmbiguousEntry,
        ]);
      }
      entryId = candidates[0].id;
    }
    const entry = entries.find((e) => e.id === entryId);
    if (!entry || !entry.isActive) {
      return new DataResultImpl<InventoryEntry>(undefined, false, [
        WarehouseErrors.SaleOutEntryNotFound,
      ]);
    }
    if (round2(entry.quantity) !== round2(movement.quantity)) {
      return new DataResultImpl<InventoryEntry>(undefined, false, [
        WarehouseErrors.SaleOutEntryModified,
      ]);
    }
    return new DataResultImpl<InventoryEntry>(entry, true, []);
  }

  private snapshotPurchaseEdit(productId: string): PurchaseEditSnapshot {
    return {
      levels: structuredClone(this.getStorageStockLevels()),
      entriesByProduct: new Map([
        [
          productId,
          structuredClone(this.inventoryService.getProductInventoriesByProductId(productId)),
        ],
      ]),
      movements: structuredClone(this.getStorageMovements()),
      orders: this.orderPort ? structuredClone(this.orderPort.getStorageOrders()) : undefined,
    };
  }

  /** Restaura el estado previo de almacén/entradas/órdenes ("todo o nada", A2). */
  private restorePurchaseEdit(snapshot: PurchaseEditSnapshot): void {
    this.stockLevels = snapshot.levels;
    this.setLocalStorage('warehouse-stock-levels', this.stockLevels);
    this.movements = snapshot.movements;
    this.setLocalStorage('warehouse-stock-movements', this.movements);
    for (const [productId, entries] of snapshot.entriesByProduct) {
      this.inventoryService.addImportedEntries(productId, entries);
    }
    if (snapshot.orders) this.orderPort?.restoreOrdersSnapshot(snapshot.orders);
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
   * fusiona con un lote existente al mismo costo (conserva su posición FIFO)
   * o inserta la tanda restaurada AL INICIO para que siga cumpliendo FIFO
   * (plan 2026-09-16, A3 — nunca al final como "lo más nuevo").
   */
  private creditLotUnits(level: WarehouseStockLevel, costPrice: number, quantity: number): void {
    const lots = this.ensureLots(level);
    const exact = lots.find((l) => round2(l.costPrice) === round2(costPrice));
    if (exact) {
      exact.quantity = round2(exact.quantity + quantity);
    } else {
      lots.unshift({ costPrice, quantity: round2(quantity) });
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
      // A5: el import de niveles copia también los lotes (onHand == Σ lotes).
      if (revived.lots !== undefined) {
        existing.lots = revived.lots.map((l) => ({ ...l }));
      }
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
    // A9c: el guard también cubre reversas sin `reversalOfMovementId`
    // (datos nuevos siempre lo traen — una reversa sin referencia no se importa).
    const duplicateReversal =
      movement.type === 'reversal' &&
      (movement.reversalOfMovementId === undefined ||
        this.isReversed(movement.reversalOfMovementId));
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
      currency: DEFAULT_CURRENCY,
      createdDate: new Date(),
    };
    this.getStorageStockLevels().push(level);
    return level;
  }

  /** Quita `quantity` unidades de la tanda originada por `originMovementId` (A4). */
  private removeLotUnitsByOrigin(
    level: WarehouseStockLevel,
    originMovementId: string,
    quantity: number,
  ): void {
    let remaining = round2(quantity);
    const lots = level.lots!;
    for (let i = 0; i < lots.length && remaining > 0; i++) {
      const lot = lots[i];
      if (lot.lotOriginMovementId !== originMovementId) continue;
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

  private appendMovement(input: {
    id?: string;
    warehouseId: string;
    productId: string;
    type: WarehouseMovementType;
    quantity: number;
    reason: string | null;
    toWarehouseId?: string;
    fromWarehouseId?: string;
    /** sale_out → tienda destino (id). Opcional en otros tipos. */
    toStoreId?: string;
    /** Costo exacto del lote (D8). */
    costPrice?: number;
    /** sale_out → entrada de tienda creada (enlace 1:1, D11). */
    inventoryEntryId?: string;
    /** reversal → fila original compensada (D7a). */
    reversalOfMovementId?: string;
    /** reversal de sale_out → entrada restaurada/eliminada (D11). */
    reversalInventoryEntryId?: string;
    /** sale_out → compra que originó el lote consumido (Fase 3). */
    lotOriginMovementId?: string;
  }): WarehouseStockMovement {
    const movement: WarehouseStockMovement = {
      id: input.id ?? generateId(),
      warehouseId: input.warehouseId,
      productId: input.productId,
      type: input.type,
      quantity: input.quantity,
      reason: input.reason,
      createdDate: new Date(),
      createdByName: getCurrentUserLogin(),
      toWarehouseId: input.toWarehouseId,
      fromWarehouseId: input.fromWarehouseId,
      toStoreId: input.toStoreId,
      costPrice: input.costPrice,
      // currency-in-costs-and-prices (plan 2026-09-16): movement cost currency.
      currency: input.costPrice !== undefined ? DEFAULT_CURRENCY : undefined,
      inventoryEntryId: input.inventoryEntryId,
      reversalOfMovementId: input.reversalOfMovementId,
      reversalInventoryEntryId: input.reversalInventoryEntryId,
      lotOriginMovementId: input.lotOriginMovementId,
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
