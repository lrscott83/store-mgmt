import { useEffect, useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import type { Product, ProductCategory, Recipe } from '@store-mgmt/domain';
import { EFeatures } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { Card } from '~/shared/components/ui/card';
import { InfoBox } from '~/shared/components/ui/info-box';
import { Button } from '~/shared/components/ui/button';
import { ChevronDownIcon, EditIcon, PlusIcon } from '~/shared/components/ui/icons';
import { confirmDialog, showBlockingError } from '~/shared/lib/blocking-alert';
import { showToastSuccess } from '~/shared/lib/toast';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';
import { ProductCategoryRepository } from '~/sales/lib/repositories/product-category-repository';
import { RecipeOfflineService } from '../lib/services/recipe-offline-service';
import type { RecipeInput } from '../lib/services/recipe-offline-service';
import { RecipeFormModal } from '../components/recipe-form-modal';

export const clientLoader = featureLoader([EFeatures.Recipes]);

/** Recipes of ONE finished-product category (collapsed-panel grouping). */
interface RecipeCategoryGroup {
  categoryId: string;
  categoryName: string;
  recipes: Recipe[];
}

/**
 * Recetas — recipe (BoM) list, grouped into collapsed panels per the finished
 * product's category (history-view pattern, `entries.tsx`). The create/edit
 * modal owns the form; deactivation goes through the app's confirm dialog and
 * is a SOFT delete (elaborations keep their snapshot). Guarded by the NEW
 * `EFeatures.Recipes` (120) feature.
 */
export function RecipesPage() {
  const intl = useIntl();
  const storeId = useAuthStore((s) => s.user?.selectedStoreId ?? '');

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Map<string, ProductCategory>>(new Map());
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<Set<string>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Recipe | null>(null);

  const service = useMemo(
    () =>
      storeId
        ? new RecipeOfflineService(
            storeId,
            new ProductRepository(storeId, new ProductCategoryRepository(storeId)),
          )
        : null,
    [storeId],
  );

  function load() {
    if (!service || !storeId) return;
    const productRepository = new ProductRepository(
      storeId,
      new ProductCategoryRepository(storeId),
    );
    setProducts([...productRepository.getStorageProductsMap().values()]);
    setCategories(new Map(productRepository.getCategoryRepository().getStorageCategoriesMap()));
    setRecipes([...service.getStorageRecipes()]);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load reads storeId/service only
  }, [service]);

  const activeProducts = useMemo(
    () =>
      products
        .filter((product) => product.isActive)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [products],
  );

  const categoryGroups = useMemo<RecipeCategoryGroup[]>(() => {
    const byCategory = new Map<string, RecipeCategoryGroup>();
    for (const recipe of recipes) {
      const product = products.find((candidate) => candidate.id === recipe.productId);
      const categoryId = product?.categoryId ?? '';
      let group = byCategory.get(categoryId);
      if (!group) {
        group = {
          categoryId,
          categoryName: categories.get(categoryId)?.name ?? '',
          recipes: [],
        };
        byCategory.set(categoryId, group);
      }
      group.recipes.push(recipe);
    }
    return [...byCategory.values()];
  }, [recipes, products, categories]);

  function toggleCategory(categoryId: string) {
    setExpandedCategoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  }

  function productName(productId: string): string {
    return products.find((product) => product.id === productId)?.name ?? productId;
  }

  function openCreateModal() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEditModal(recipe: Recipe) {
    setEditing(recipe);
    setModalOpen(true);
  }

  function handleSave(input: RecipeInput) {
    if (!service) return;
    const result = editing ? service.updateRecipe(editing.id, input) : service.addRecipe(input);
    if (!result.succeeded) {
      showBlockingError(
        intl.formatMessage({ id: 'GENERAL.ERROR' }),
        result.errors[0]?.description ?? '',
      );
      return;
    }
    setModalOpen(false);
    setEditing(null);
    showToastSuccess(
      intl.formatMessage({ id: editing ? 'RECIPE.UPDATED' : 'RECIPE.CREATED' }),
    );
    load();
  }

  async function handleDeactivate(recipe: Recipe) {
    if (!service) return;
    const confirmed = await confirmDialog({
      title: intl.formatMessage({ id: 'RECIPE.DEACTIVATE_CONFIRM_TITLE' }),
      message: intl.formatMessage({ id: 'RECIPE.DEACTIVATE_CONFIRM_MESSAGE' }),
      confirmButtonText: intl.formatMessage({ id: 'RECIPE.DEACTIVATE_CONFIRM_BUTTON' }),
      cancelButtonText: intl.formatMessage({ id: 'GENERAL.CANCEL' }),
    });
    if (!confirmed) return;

    const result = service.deactivateRecipe(recipe.id);
    if (!result.succeeded) {
      showBlockingError(
        intl.formatMessage({ id: 'GENERAL.ERROR' }),
        result.errors[0]?.description ?? '',
      );
      return;
    }
    showToastSuccess(intl.formatMessage({ id: 'RECIPE.DEACTIVATED' }));
    load();
  }

  const totalCount = recipes.length;

  return (
    <Card
      padding="tight"
      title={
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            {intl.formatMessage({ id: 'RECIPE.TITLE' })}
            <span
              data-testid="recipes-count"
              className="rounded-full bg-primary-light px-2 py-0.5 text-xs font-semibold text-primary"
            >
              ({totalCount})
            </span>
          </span>
          <Button variant="primary" onClick={openCreateModal} data-testid="recipe-new">
            <PlusIcon />
            {intl.formatMessage({ id: 'RECIPE.NEW' })}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <RecipeFormModal
          open={modalOpen}
          recipe={editing ?? undefined}
          products={activeProducts}
          onClose={() => {
            setModalOpen(false);
            setEditing(null);
          }}
          onSave={handleSave}
        />

        {recipes.length === 0 && (
          <InfoBox variant="primary" className="text-center">
            {intl.formatMessage({ id: 'RECIPE.EMPTY' })}
          </InfoBox>
        )}

        <div className="space-y-2">
          {categoryGroups.map((group) => {
            const isExpanded = expandedCategoryIds.has(group.categoryId);
            return (
              <div
                key={group.categoryId}
                className="rounded-lg border border-border bg-background"
              >
                <button
                  type="button"
                  onClick={() => toggleCategory(group.categoryId)}
                  className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left"
                  data-testid={`recipe-category-toggle-${group.categoryId}`}
                  aria-expanded={isExpanded}
                >
                  <span className="text-sm font-semibold uppercase tracking-wide text-text-muted">
                    {group.categoryName} ({group.recipes.length})
                  </span>
                  <ChevronDownIcon isExpanded={isExpanded} className="text-text-muted" />
                </button>
                {isExpanded && (
                  <div className="divide-y divide-border border-t border-border">
                    {group.recipes.map((recipe) => (
                      <div
                        key={recipe.id}
                        data-testid={`recipe-row-${recipe.id}`}
                        className="flex items-center justify-between gap-4 px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium text-text">
                            {productName(recipe.productId)}
                            {!recipe.isActive && (
                              <span className="ml-2 text-xs text-text-muted">
                                ({intl.formatMessage({ id: 'RECIPE.INACTIVE' })})
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-text-muted">
                            {intl.formatMessage(
                              { id: 'RECIPE.COMPONENTS_COUNT' },
                              { count: recipe.components.length },
                            )}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <span className="hidden text-xs text-text-muted sm:inline">
                            {intl.formatMessage({ id: 'RECIPE.OUTPUT_QTY' })}: {recipe.outputQty}
                          </span>
                          {recipe.isActive && (
                            <>
                              <button
                                type="button"
                                onClick={() => openEditModal(recipe)}
                                aria-label={intl.formatMessage({ id: 'RECIPE.EDIT_ACTION' })}
                                title={intl.formatMessage({ id: 'RECIPE.EDIT_ACTION' })}
                                data-testid={`recipe-edit-${recipe.id}`}
                                className="rounded p-1 text-text-muted hover:bg-background-hover hover:text-primary"
                              >
                                <EditIcon className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDeactivate(recipe)}
                                data-testid={`recipe-deactivate-${recipe.id}`}
                                className="rounded px-2 py-1 text-xs font-medium text-danger hover:bg-danger/10"
                              >
                                {intl.formatMessage({ id: 'RECIPE.DEACTIVATE' })}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

export default RecipesPage;
