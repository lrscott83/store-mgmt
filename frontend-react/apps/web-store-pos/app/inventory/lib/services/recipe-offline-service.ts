import type { BaseError, DataResult, Recipe, RecipeComponent } from '@store-mgmt/domain';
import { DataResult as DataResultImpl, RecipeErrors, Result } from '@store-mgmt/domain';
import { StorageKeys } from '~/shared/lib/storage/storage-keys';
import { encryptEntity } from '~/shared/lib/storage/entity-crypto';
import { readEntityOrThrow } from '~/shared/lib/storage/read-entity-or-throw';
import { getCurrentUserLogin } from '~/shared/lib/auth/current-user';
import { round2 } from '~/shared/lib/money';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';

function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Payload accepted by `addRecipe`/`updateRecipe`. The server-managed audit
 * fields and `isActive` are NOT part of the input: the service owns them
 * (`isActive` flips only through `deactivateRecipe`).
 */
export interface RecipeInput {
  /** Finished product id (must exist, any category). */
  productId: string;
  /** Units of the finished product ONE batch produces (round2, > 0). */
  outputQty: number;
  /** Ingredients consumed per output unit — at least one component. */
  components: RecipeComponent[];
  /** Fixed labor cost per batch (optional, defaults to 0). */
  laborCost?: number;
  /** Overhead as a percentage of the ingredients cost (optional, defaults to 0; 0–100). */
  overheadPct?: number;
}

/**
 * RecipeOfflineService — recipes (BoM) repository, offline-first per store
 * (localStorage), same persistence shape as ExchangeRateOfflineService /
 * WarehouseOfflineService: encrypted plain-array wire format per store, a
 * per-instance cache reloaded when empty or when the store key changes, a
 * read-modify-write refresh from storage at the start of every write,
 * auto-init on a genuinely empty read, and date revival on load.
 *
 * Business rules (plan 2026-09-04-elaboration-module.md §Task 3):
 * - The finished product must exist (`ProductRepository`).
 * - A recipe needs at least one component; every component needs `qty > 0`
 *   and `scrapPct` within 0–100; `outputQty > 0`; `overheadPct` within 0–100.
 * - At most ONE active recipe per finished product: a second one fails
 *   `Recipe.DuplicateForProduct`. `updateRecipe` excludes the recipe being
 *   edited, so a recipe updating itself is never a false duplicate.
 * - `deactivateRecipe` is a soft delete: elaborations keep their snapshot and
 *   the product becomes free for a new active recipe.
 * - Writes always return a `DataResult` and never throw.
 */
export class RecipeOfflineService {
  private recipes: Recipe[] | null = null;
  private lastRecipesKey: string | undefined;

  constructor(
    private readonly storeId: string,
    private readonly productRepository: ProductRepository,
  ) {}

  // ─── reads ───────────────────────────────────────────────────────────────

  getStorageRecipes(): Recipe[] {
    if (
      !this.recipes ||
      this.recipes.length === 0 ||
      this.getCurrentStorageKey() !== this.lastRecipesKey
    ) {
      this.recipes = this.getRecipesFromLocalStorage();
    }
    return this.recipes;
  }

  getRecipeById(id: string): Recipe | undefined {
    return this.getStorageRecipes().find((recipe) => recipe.id === id);
  }

  getActiveRecipeForProduct(productId: string): Recipe | undefined {
    return this.getStorageRecipes().find(
      (recipe) => recipe.productId === productId && recipe.isActive,
    );
  }

  /** Raw stored-JSON read for the sync export (mirrors the exchange-rates reader seam). */
  getStorageRecipesJson(): string {
    return JSON.stringify(this.getStorageRecipes());
  }

  // ─── writes ──────────────────────────────────────────────────────────────

  addRecipe(input: RecipeInput): DataResult<Recipe> {
    this.reloadRecipes();
    const errors = this.validateInput(input);
    if (errors.length === 0 && this.getActiveRecipeForProduct(input.productId)) {
      errors.push(RecipeErrors.DuplicateForProduct);
    }
    if (errors.length > 0) {
      return new DataResultImpl<Recipe>(undefined, false, errors);
    }

    const now = new Date();
    const recipe: Recipe = {
      id: generateId(),
      productId: input.productId,
      outputQty: round2(input.outputQty),
      components: this.normalizeComponents(input.components),
      laborCost: round2(input.laborCost ?? 0),
      overheadPct: round2(input.overheadPct ?? 0),
      isActive: true,
      createdDate: now,
      createdByName: getCurrentUserLogin(),
    };
    this.getStorageRecipes().push(recipe);
    this.setRecipesLocalStorage(this.recipes!);
    return new DataResultImpl<Recipe>(recipe, true, []);
  }

  updateRecipe(id: string, input: RecipeInput): DataResult<Recipe> {
    this.reloadRecipes();
    const existing = this.getRecipeById(id);
    if (!existing) {
      // The domain error family has no `Recipe.NotExists` code; the closest
      // existing failure is `ProductNotExists` (the recipe cannot be located,
      // so its product reference cannot be validated either). Kept as a
      // graceful `DataResult` failure — never a throw.
      return new DataResultImpl<Recipe>(undefined, false, [RecipeErrors.ProductNotExists]);
    }

    const errors = this.validateInput(input);
    // Self-exclusion: the recipe being edited does not count as its own duplicate.
    const duplicate = this.getStorageRecipes().find(
      (recipe) =>
        recipe.productId === input.productId && recipe.isActive && recipe.id !== existing.id,
    );
    if (duplicate) {
      errors.push(RecipeErrors.DuplicateForProduct);
    }
    if (errors.length > 0) {
      return new DataResultImpl<Recipe>(undefined, false, errors);
    }

    existing.productId = input.productId;
    existing.outputQty = round2(input.outputQty);
    existing.components = this.normalizeComponents(input.components);
    existing.laborCost = round2(input.laborCost ?? 0);
    existing.overheadPct = round2(input.overheadPct ?? 0);
    existing.updatedDate = new Date();
    existing.updatedByName = getCurrentUserLogin();
    this.setRecipesLocalStorage(this.recipes!);
    return new DataResultImpl<Recipe>(existing, true, []);
  }

  /**
   * Soft delete: sets `isActive = false` and frees the product for a new
   * active recipe. Elaborations keep their own snapshot, so history is safe.
   */
  deactivateRecipe(id: string): DataResult<Recipe> {
    this.reloadRecipes();
    const existing = this.getRecipeById(id);
    if (!existing) {
      return new DataResultImpl<Recipe>(undefined, false, [RecipeErrors.ProductNotExists]);
    }
    existing.isActive = false;
    existing.updatedDate = new Date();
    existing.updatedByName = getCurrentUserLogin();
    this.setRecipesLocalStorage(this.recipes!);
    return new DataResultImpl<Recipe>(existing, true, []);
  }

  // ─── import seams (sync) ────────────────────────────────────────────────

  /** Import seam — appends a recipe as-is (sync import; mirror of addImportedExchangeRate). */
  addImportedRecipe(recipe: Recipe): Result {
    this.reloadRecipes();
    const imported = this.reviveRecipeDates(recipe);
    this.getStorageRecipes().push(imported);
    this.setRecipesLocalStorage(this.recipes!);
    return Result.Success();
  }

  /** Import seam — merges every field onto the recipe with the same id. */
  updateImportedRecipe(recipe: Recipe): Result {
    this.reloadRecipes();
    const existing = this.getRecipeById(recipe.id);
    if (existing) {
      const imported = this.reviveRecipeDates(recipe);
      existing.productId = imported.productId;
      existing.outputQty = imported.outputQty;
      existing.components = imported.components;
      existing.laborCost = imported.laborCost;
      existing.overheadPct = imported.overheadPct;
      existing.isActive = imported.isActive;
      existing.createdDate = imported.createdDate;
      existing.createdByName = imported.createdByName;
      existing.updatedDate = imported.updatedDate;
      existing.updatedByName = imported.updatedByName;
      this.setRecipesLocalStorage(this.recipes!);
    }
    return Result.Success();
  }

  // ─── validation helpers ─────────────────────────────────────────────────

  private validateInput(input: RecipeInput): BaseError[] {
    const errors: BaseError[] = [];

    if (!this.productRepository.getProductById(input.productId)) {
      errors.push(RecipeErrors.ProductNotExists);
    }

    if (!input.components || input.components.length === 0) {
      errors.push(RecipeErrors.EmptyComponents);
    }

    const invalidQty = !(input.outputQty > 0);
    const invalidComponents = (input.components ?? []).some(
      (component) =>
        !(component.qty > 0) || !(component.scrapPct >= 0 && component.scrapPct <= 100),
    );
    const overheadPct = input.overheadPct ?? 0;
    const invalidOverhead = !(overheadPct >= 0 && overheadPct <= 100);
    if (invalidQty || invalidComponents || invalidOverhead) {
      errors.push(RecipeErrors.InvalidQty);
    }

    return errors;
  }

  private normalizeComponents(components: RecipeComponent[]): RecipeComponent[] {
    return components.map((component) => ({
      productId: component.productId,
      qty: round2(component.qty),
      scrapPct: round2(component.scrapPct),
    }));
  }

  // ─── persistence helpers ────────────────────────────────────────────────

  /**
   * Reloads the cache from storage before a read-modify-write. Every write
   * path must start from the freshest persisted state: another instance of
   * this store may have written since this instance last loaded, and
   * persisting a stale array would silently drop its rows (lost update).
   */
  private reloadRecipes(): void {
    this.recipes = this.getRecipesFromLocalStorage();
  }

  private setRecipesLocalStorage(recipes: Recipe[]): void {
    localStorage.setItem(this.getStorageKey(), encryptEntity(JSON.stringify(recipes)));
  }

  private getStorageKey(): string {
    this.lastRecipesKey = this.getCurrentStorageKey();
    return this.lastRecipesKey;
  }

  private getCurrentStorageKey(): string {
    return StorageKeys.entityKey('recipes', this.storeId);
  }

  private getRecipesFromLocalStorage(): Recipe[] {
    const stored = readEntityOrThrow(this.getStorageKey(), (json) =>
      json ? (JSON.parse(json) as Recipe[]).map((recipe) => this.reviveRecipeDates(recipe)) : null,
    );
    if (stored) return stored;

    this.setRecipesLocalStorage([]);
    return [];
  }

  private reviveRecipeDates(recipe: Recipe): Recipe {
    const revived = { ...recipe } as Record<string, unknown>;
    for (const field of ['createdDate', 'updatedDate']) {
      const value = revived[field];
      if (typeof value === 'string') revived[field] = new Date(value);
    }
    return revived as unknown as Recipe;
  }
}
