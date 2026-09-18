import type { DataResult, Elaboration, ElaborationComponentActual } from '@store-mgmt/domain';
import {
  DataResult as DataResultImpl,
  ElaborationErrors,
  elaborationInsufficientStockError,
  ProductErrors,
  RecipeErrors,
  Result,
  WarehouseErrors,
} from '@store-mgmt/domain';
import { StorageKeys } from '~/shared/lib/storage/storage-keys';
import { encryptEntity } from '~/shared/lib/storage/entity-crypto';
import { readEntityOrThrow } from '~/shared/lib/storage/read-entity-or-throw';
import { getCurrentUserLogin } from '~/shared/lib/auth/current-user';
import { round2 } from '~/shared/lib/money';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';
import { planElaboration } from '../elaboration-math';
import { InventoryOfflineService } from './inventory-offline-service';
import { RecipeOfflineService } from './recipe-offline-service';
import { WarehouseOfflineService } from './warehouse-offline-service';

function generateId(): string {
  return crypto.randomUUID();
}

/**
 * One ingredient's REAL consumption, as edited by the user on the confirm
 * screen. Components omitted from this list consume their theoretical qty.
 */
export interface ElaborationActualInput {
  productId: string;
  /** Real consumed quantity (>= 0). */
  actualQty: number;
}

/** Payload accepted by {@link ElaborationOfflineService.confirmElaboration}. */
export interface ConfirmElaborationParams {
  recipeId: string;
  /** Warehouse holding the ingredients (stock check + consumption). */
  warehouseId: string;
  /** Number of batches to produce (>= 1). */
  batches: number;
  /** Edited actuals; a component absent here defaults to its theoretical qty. */
  actualComponents?: ElaborationActualInput[];
}

/**
 * ElaborationOfflineService — the production engine, offline-first per store
 * (localStorage), same persistence shape as RecipeOfflineService /
 * WarehouseOfflineService: encrypted plain-array wire format per store, a
 * per-instance cache reloaded when empty or when the store key changes, a
 * read-modify-write refresh from storage at the start of every write, auto-init
 * on a genuinely empty read, and date revival on load.
 *
 * `confirmElaboration` follows the plan's 6 steps
 * (2026-09-04-elaboration-module.md §Task 4):
 *  1. Resolve the recipe (missing row → the recipe service's precedent failure
 *     `Recipe.ProductNotExists`) and the warehouse (`Elaboration.WarehouseNotExists`).
 *  2. Read the warehouse's stock levels and validate EVERY component BEFORE any
 *     write (`actualQty <= available`, else a named
 *     `Elaboration.InsufficientStock` failure). Insufficient stock leaves the
 *     store untouched: no movements, no records, no inventory entries.
 *  3. Append one `consumption_out` movement per ingredient (qty = actualQty).
 *  4. Append one `elaboration_in` movement for the finished good (qty = producedQty).
 *  5. Append the immutable `Elaboration` record with its snapshots.
 *  6. Append the finished good's `InventoryEntry` so the sale path discounts
 *     the REAL unit cost from the first sale.
 *
 * Costing: the unit cost is
 * `(Σ actualQty × costPrice + laborCost + overhead) / producedQty`, round2,
 * where `costPrice` is the holding warehouse's weighted-average
 * `WarehouseStockLevel.costPrice` at elaboration time and the overhead applies
 * to the REAL ingredient cost.
 *
 * Elaborations are IMMUTABLE once confirmed: there is no update or delete of a
 * confirmed elaboration. The import seams exist only for the sync circuit.
 */
export class ElaborationOfflineService {
  private elaborations: Elaboration[] | null = null;
  private lastElaborationsKey: string | undefined;

  constructor(
    private readonly storeId: string,
    private readonly productRepository: ProductRepository,
    private readonly recipeService: RecipeOfflineService,
    private readonly warehouseService: WarehouseOfflineService,
    private readonly inventoryService: InventoryOfflineService,
  ) {}

  // ─── reads ───────────────────────────────────────────────────────────────

  getStorageElaborations(): Elaboration[] {
    if (
      !this.elaborations ||
      this.elaborations.length === 0 ||
      this.getCurrentStorageKey() !== this.lastElaborationsKey
    ) {
      this.elaborations = this.getElaborationsFromLocalStorage();
    }
    return this.elaborations;
  }

  getElaborations(): Elaboration[] {
    return this.getStorageElaborations();
  }

  /** Raw stored-JSON read for the sync export (mirrors the recipe reader seam). */
  getStorageElaborationsJson(): string {
    return JSON.stringify(this.getStorageElaborations());
  }

  // ─── confirm (the production transaction) ────────────────────────────────

  confirmElaboration(params: ConfirmElaborationParams): DataResult<Elaboration> {
    // Read-modify-write: reload before every write so another instance of the
    // same store cannot have its rows silently dropped (recipe-service precedent).
    this.reloadElaborations();

    const recipe = this.recipeService.getRecipeById(params.recipeId);
    if (!recipe) {
      // The domain has no `Recipe.NotExists` code; the recipe service's own
      // precedent for a missing row is `ProductNotExists`.
      return new DataResultImpl<Elaboration>(undefined, false, [RecipeErrors.ProductNotExists]);
    }

    const warehouse = this.warehouseService.getWarehouseById(params.warehouseId);
    if (!warehouse) {
      return new DataResultImpl<Elaboration>(undefined, false, [
        ElaborationErrors.WarehouseNotExists,
      ]);
    }
    if (!warehouse.isActive) {
      return new DataResultImpl<Elaboration>(undefined, false, [WarehouseErrors.Inactive]);
    }
    if (!(params.batches >= 1)) {
      return new DataResultImpl<Elaboration>(undefined, false, [RecipeErrors.InvalidQty]);
    }

    const producedQty = round2(recipe.outputQty * params.batches);
    if (!(producedQty > 0)) {
      return new DataResultImpl<Elaboration>(undefined, false, [RecipeErrors.InvalidQty]);
    }

    const levels = this.warehouseService.getStockLevels(params.warehouseId);
    const plan = planElaboration(recipe, params.batches, levels);
    const actualByProduct = new Map(
      (params.actualComponents ?? []).map((component) => [component.productId, component.actualQty]),
    );

    // Step 1/2 — validate EVERY component before ANY write.
    const components: ElaborationComponentActual[] = [];
    for (const planned of plan.components) {
      const actualQty = round2(actualByProduct.get(planned.productId) ?? planned.theoreticalQty);
      if (!(actualQty >= 0)) {
        return new DataResultImpl<Elaboration>(undefined, false, [RecipeErrors.InvalidQty]);
      }
      if (!this.productRepository.getProductById(planned.productId)) {
        return new DataResultImpl<Elaboration>(undefined, false, [ProductErrors.NotExists]);
      }
      if (actualQty > planned.available) {
        const name =
          this.productRepository.getProductById(planned.productId)?.name ?? planned.productId;
        return new DataResultImpl<Elaboration>(undefined, false, [
          elaborationInsufficientStockError(name, planned.available, actualQty),
        ]);
      }
      components.push({
        productId: planned.productId,
        theoreticalQty: planned.theoreticalQty,
        actualQty,
        costPrice: planned.costPrice,
      });
    }

    // Real cost snapshot (Costing rule 3): overhead applies to the REAL
    // ingredient cost, not the estimate.
    const realIngredientsCost = round2(
      components.reduce((sum, component) => round2(sum + component.actualQty * component.costPrice), 0),
    );
    const overheadCost = (realIngredientsCost * recipe.overheadPct) / 100;
    const laborCost = round2(recipe.laborCost * params.batches);
    // Kept raw (not round2) so the snapshot matches the plan's pinned total
    // (66.85 + 6.685 + 50 = 123.535 for the acceptance recipe); only the unit
    // cost is round2.
    const totalCost = realIngredientsCost + overheadCost + laborCost;
    const unitCost = producedQty > 0 ? round2(totalCost / producedQty) : 0;

    // Step 2 — consume the ingredients (FIFO, exact-lot movements).
    for (const component of components) {
      if (component.actualQty <= 0) continue;
      const movement = this.warehouseService.recordMovement({
        type: 'consumption_out',
        warehouseId: params.warehouseId,
        productId: component.productId,
        quantity: component.actualQty,
      });
      if (!movement.succeeded) {
        return new DataResultImpl<Elaboration>(undefined, false, movement.errors);
      }
    }

    // Step 3 — record the finished good entering the warehouse.
    const producedMovement = this.warehouseService.recordMovement({
      type: 'elaboration_in',
      warehouseId: params.warehouseId,
      productId: recipe.productId,
      quantity: producedQty,
      costPrice: unitCost,
    });
    if (!producedMovement.succeeded) {
      return new DataResultImpl<Elaboration>(undefined, false, producedMovement.errors);
    }

    const productName = this.productRepository.getProductById(recipe.productId)?.name ?? '';
    const now = new Date();
    const elaboration: Elaboration = {
      id: generateId(),
      recipeId: recipe.id,
      // The v1 Recipe model has no `name` field, so the snapshot is the finished
      // product's name (recipes snapshot by product; see plan §"Data model").
      recipeName: productName,
      productId: recipe.productId,
      warehouseId: params.warehouseId,
      batches: params.batches,
      producedQty,
      components,
      laborCost,
      overheadPct: recipe.overheadPct,
      totalCost,
      unitCost,
      isActive: true,
      createdDate: now,
      createdByName: getCurrentUserLogin(),
    };

    // Step 4 — append the immutable elaboration record.
    this.getStorageElaborations().push(elaboration);
    this.setElaborationsLocalStorage(this.elaborations!);

    // Step 5 — the sellable store entry, at the REAL unit cost.
    const entry = this.inventoryService.createInventoryEntry(
      recipe.productId,
      producedQty,
      unitCost,
    );
    if (!entry || !entry.succeeded) {
      return new DataResultImpl<Elaboration>(
        undefined,
        false,
        entry ? entry.errors : [ProductErrors.NotExists],
      );
    }

    return new DataResultImpl<Elaboration>(elaboration, true, []);
  }

  // ─── import seams (sync) ────────────────────────────────────────────────

  /** Import seam — appends an elaboration as-is (mirror of addImportedRecipe). */
  addImportedElaboration(elaboration: Elaboration): Result {
    this.reloadElaborations();
    const imported = this.reviveElaborationDates(elaboration);
    this.getStorageElaborations().push(imported);
    this.setElaborationsLocalStorage(this.elaborations!);
    return Result.Success();
  }

  /** Import seam — merges every field onto the elaboration with the same id. */
  updateImportedElaboration(elaboration: Elaboration): Result {
    this.reloadElaborations();
    const existing = this.getStorageElaborations().find((row) => row.id === elaboration.id);
    if (existing) {
      const imported = this.reviveElaborationDates(elaboration);
      existing.recipeId = imported.recipeId;
      existing.recipeName = imported.recipeName;
      existing.productId = imported.productId;
      existing.warehouseId = imported.warehouseId;
      existing.batches = imported.batches;
      existing.producedQty = imported.producedQty;
      existing.components = imported.components;
      existing.laborCost = imported.laborCost;
      existing.overheadPct = imported.overheadPct;
      existing.totalCost = imported.totalCost;
      existing.unitCost = imported.unitCost;
      existing.isActive = imported.isActive;
      existing.createdDate = imported.createdDate;
      existing.createdByName = imported.createdByName;
      existing.updatedDate = imported.updatedDate;
      existing.updatedByName = imported.updatedByName;
      this.setElaborationsLocalStorage(this.elaborations!);
    }
    return Result.Success();
  }

  // ─── persistence helpers ────────────────────────────────────────────────

  /**
   * Reloads the cache from storage before a read-modify-write. Every write path
   * must start from the freshest persisted state: another instance of this
   * store may have written since this instance last loaded, and persisting a
   * stale array would silently drop its rows (lost update).
   */
  private reloadElaborations(): void {
    this.elaborations = this.getElaborationsFromLocalStorage();
  }

  private setElaborationsLocalStorage(elaborations: Elaboration[]): void {
    localStorage.setItem(this.getStorageKey(), encryptEntity(JSON.stringify(elaborations)));
  }

  private getStorageKey(): string {
    this.lastElaborationsKey = this.getCurrentStorageKey();
    return this.lastElaborationsKey;
  }

  private getCurrentStorageKey(): string {
    return StorageKeys.entityKey('elaborations', this.storeId);
  }

  private getElaborationsFromLocalStorage(): Elaboration[] {
    const stored = readEntityOrThrow(this.getStorageKey(), (json) =>
      json
        ? (JSON.parse(json) as Elaboration[]).map((elaboration) =>
            this.reviveElaborationDates(elaboration),
          )
        : null,
    );
    if (stored) return stored;

    this.setElaborationsLocalStorage([]);
    return [];
  }

  private reviveElaborationDates(elaboration: Elaboration): Elaboration {
    const revived = { ...elaboration } as Record<string, unknown>;
    for (const field of ['createdDate', 'updatedDate']) {
      const value = revived[field];
      if (typeof value === 'string') revived[field] = new Date(value);
    }
    return revived as unknown as Elaboration;
  }
}
