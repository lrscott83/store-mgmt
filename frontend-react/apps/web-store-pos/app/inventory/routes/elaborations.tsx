import { useEffect, useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import type { Elaboration, Product, Recipe, Warehouse } from '@store-mgmt/domain';
import { EFeatures } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { Card } from '~/shared/components/ui/card';
import { InfoBox } from '~/shared/components/ui/info-box';
import { Button } from '~/shared/components/ui/button';
import { ChevronDownIcon, SaveIcon } from '~/shared/components/ui/icons';
import { showToastSuccess } from '~/shared/lib/toast';
import { round2 } from '~/shared/lib/money';
import { formatCurrency } from '~/shared/lib/format-currency';
import { formatLocalDate, groupByLocalDay } from '~/shared/lib/date-utils';
import type { LocalDayGroup } from '~/shared/lib/date-utils';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';
import { ProductCategoryRepository } from '~/sales/lib/repositories/product-category-repository';
import { planElaboration } from '../lib/elaboration-math';
import type { ElaborationPlan } from '../lib/elaboration-math';
import { ElaborationOfflineService } from '../lib/services/elaboration-offline-service';
import { InventoryOfflineService } from '../lib/services/inventory-offline-service';
import { RecipeOfflineService } from '../lib/services/recipe-offline-service';
import { WarehouseOfflineService } from '../lib/services/warehouse-offline-service';

export const clientLoader = featureLoader([EFeatures.Elaborations]);

/**
 * Elaboraciones — "Nueva elaboración": recipe → batches → holding warehouse →
 * components review (theoretical vs editable real, cost per component, totals)
 * → confirm. The service is the source of truth for stock: an over-consumption
 * attempt fails with the NAMED `Elaboration.InsufficientStock` message
 * (product + available + needed) and writes nothing. On success a toast is
 * shown and the day-grouped history below (pattern `entries.tsx`) renders the
 * finished product, produced quantity, real total cost and real unit cost.
 */
export function ElaborationsPage() {
  const intl = useIntl();
  const storeId = useAuthStore((s) => s.user?.selectedStoreId ?? '');

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [elaborations, setElaborations] = useState<Elaboration[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedRecipeId, setSelectedRecipeId] = useState('');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [batches, setBatches] = useState('1');
  /** Edited real quantities, index-aligned with `plan.components`; absent → theoretical. */
  const [actuals, setActuals] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expandedDayKeys, setExpandedDayKeys] = useState<Set<string>>(new Set());

  const services = useMemo(() => {
    if (!storeId) return null;
    const productRepository = new ProductRepository(
      storeId,
      new ProductCategoryRepository(storeId),
    );
    const inventoryService = new InventoryOfflineService(storeId, productRepository);
    const recipeService = new RecipeOfflineService(storeId, productRepository);
    const warehouseService = new WarehouseOfflineService(
      storeId,
      productRepository,
      inventoryService,
    );
    const elaborationService = new ElaborationOfflineService(
      storeId,
      productRepository,
      recipeService,
      warehouseService,
      inventoryService,
    );
    return { productRepository, recipeService, warehouseService, elaborationService };
  }, [storeId]);

  function load() {
    if (!services) return;
    setRecipes(services.recipeService.getStorageRecipes().filter((recipe) => recipe.isActive));
    setWarehouses(
      services.warehouseService.getStorageWarehouses().filter((warehouse) => warehouse.isActive),
    );
    setElaborations([...services.elaborationService.getStorageElaborations()].reverse());
    setProducts([...services.productRepository.getStorageProductsMap().values()]);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load reads the services only
  }, [services]);

  // A new recipe/batches/warehouse invalidates the edited actuals and any prior
  // error: the rows default back to the freshly computed theoretical quantities,
  // and a stale failure message can no longer describe the new selection.
  useEffect(() => {
    setActuals([]);
    setError(null);
  }, [selectedRecipeId, selectedWarehouseId, batches]);

  const selectedRecipe = recipes.find((recipe) => recipe.id === selectedRecipeId);
  const batchesNum = parseInt(batches, 10);
  const plan: ElaborationPlan | null =
    services && selectedRecipe && selectedWarehouseId && batchesNum >= 1
      ? planElaboration(
          selectedRecipe,
          batchesNum,
          services.warehouseService.getStockLevels(selectedWarehouseId),
        )
      : null;

  function productName(productId?: string): string {
    if (!productId) return '';
    return products.find((product) => product.id === productId)?.name ?? productId;
  }

  function actualQtyOf(index: number, theoreticalQty: number): number {
    const raw = actuals[index];
    if (raw === undefined) return theoreticalQty;
    const parsed = parseFloat(raw);
    // Clamp negatives: a negative "real" quantity has no physical meaning and
    // would otherwise surface negative preview costs. The service re-validates
    // and stays the source of truth (`Elaboration.InvalidQty`), so the preview
    // must never let a negative value contribute either.
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }

  // Honest signal for the silent clamp: a typed negative real quantity is
  // replaced by 0 in the preview and the payload, so the screen must say so.
  const hasNegativeActual = useMemo(
    () =>
      actuals.some((raw) => {
        if (raw === undefined) return false;
        const parsed = parseFloat(raw);
        return Number.isFinite(parsed) && parsed < 0;
      }),
    [actuals],
  );

  // Live real-cost preview: the overhead applies to the REAL ingredient cost,
  // exactly like the service's snapshot.
  const realIngredientsCost = plan
    ? round2(
        plan.components.reduce(
          (sum, component, index) =>
            round2(sum + actualQtyOf(index, component.theoreticalQty) * component.costPrice),
          0,
        ),
      )
    : 0;
  const realOverheadCost = selectedRecipe
    ? (realIngredientsCost * selectedRecipe.overheadPct) / 100
    : 0;
  const realLaborCost = plan ? plan.laborCostTotal : 0;
  const realTotalCost = realIngredientsCost + realOverheadCost + realLaborCost;
  const realUnitCost =
    plan && plan.producedQty > 0 ? round2(realTotalCost / plan.producedQty) : 0;

  const canConfirm =
    !!services &&
    !!selectedRecipe &&
    selectedWarehouseId !== '' &&
    Number.isFinite(batchesNum) &&
    batchesNum >= 1;

  function handleConfirm() {
    if (!services || !selectedRecipe || !canConfirm) return;
    setError(null);
    const result = services.elaborationService.confirmElaboration({
      recipeId: selectedRecipe.id,
      warehouseId: selectedWarehouseId,
      batches: batchesNum,
      actualComponents: plan
        ? plan.components.map((component, index) => ({
            productId: component.productId,
            actualQty: actualQtyOf(index, component.theoreticalQty),
          }))
        : undefined,
    });
    if (!result.succeeded) {
      setError(result.errors[0]?.description ?? '');
      return;
    }
    showToastSuccess(intl.formatMessage({ id: 'ELABORATION.CONFIRMED' }));
    setSelectedRecipeId('');
    setSelectedWarehouseId('');
    setBatches('1');
    load();
  }

  function toggleDayPanel(dayKey: string) {
    setExpandedDayKeys((prev) => {
      const next = new Set(prev);
      if (next.has(dayKey)) next.delete(dayKey);
      else next.add(dayKey);
      return next;
    });
  }

  const historyDayGroups = useMemo<LocalDayGroup<Elaboration>[]>(
    () => groupByLocalDay(elaborations, (elaboration) => new Date(elaboration.createdDate)),
    [elaborations],
  );

  const isEmptyModule = warehouses.length === 0 || recipes.length === 0;
  const emptyMessageId =
    warehouses.length === 0 ? 'ELABORATION.NO_WAREHOUSE' : 'ELABORATION.NO_RECIPES';

  return (
    <div className="space-y-4">
      <Card padding="tight" title={intl.formatMessage({ id: 'ELABORATION.TITLE' })}>
        <div className="space-y-4">
          {isEmptyModule ? (
            <InfoBox variant="primary" className="text-center">
              {intl.formatMessage({ id: emptyMessageId })}
            </InfoBox>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label
                    htmlFor="elaboration-recipe"
                    className="mb-1 block text-sm font-medium text-text"
                  >
                    {intl.formatMessage({ id: 'ELABORATION.RECIPE' })}
                  </label>
                  <select
                    id="elaboration-recipe"
                    data-testid="elaboration-recipe"
                    value={selectedRecipeId}
                    onChange={(e) => setSelectedRecipeId(e.target.value)}
                    className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">
                      {intl.formatMessage({ id: 'ELABORATION.SELECT_RECIPE' })}
                    </option>
                    {recipes.map((recipe) => (
                      <option key={recipe.id} value={recipe.id}>
                        {productName(recipe.productId)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="elaboration-batches"
                    className="mb-1 block text-sm font-medium text-text"
                  >
                    {intl.formatMessage({ id: 'ELABORATION.BATCHES' })}
                  </label>
                  <input
                    id="elaboration-batches"
                    data-testid="elaboration-batches"
                    type="number"
                    min="1"
                    step="1"
                    value={batches}
                    onChange={(e) => setBatches(e.target.value)}
                    className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label
                    htmlFor="elaboration-warehouse"
                    className="mb-1 block text-sm font-medium text-text"
                  >
                    {intl.formatMessage({ id: 'ELABORATION.WAREHOUSE' })}
                  </label>
                  <select
                    id="elaboration-warehouse"
                    data-testid="elaboration-warehouse"
                    value={selectedWarehouseId}
                    onChange={(e) => setSelectedWarehouseId(e.target.value)}
                    className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">
                      {intl.formatMessage({ id: 'ELABORATION.SELECT_WAREHOUSE' })}
                    </option>
                    {warehouses.map((warehouse) => (
                      <option key={warehouse.id} value={warehouse.id}>
                        {warehouse.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {plan && (
                <div data-testid="elaboration-plan" className="space-y-3">
                  <h3 className="text-sm font-semibold text-text">
                    {intl.formatMessage({ id: 'ELABORATION.COMPONENTS_TITLE' })}
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-muted">
                          <th className="py-2 pr-2">
                            {intl.formatMessage({ id: 'ELABORATION.PRODUCT' })}
                          </th>
                          <th className="py-2 pr-2 text-right">
                            {intl.formatMessage({ id: 'ELABORATION.THEORETICAL' })}
                          </th>
                          <th className="py-2 pr-2 text-right">
                            {intl.formatMessage({ id: 'ELABORATION.ACTUAL' })}
                          </th>
                          <th className="py-2 pr-2 text-right">
                            {intl.formatMessage({ id: 'ELABORATION.COST_PRICE' })}
                          </th>
                          <th className="py-2 text-right">
                            {intl.formatMessage({ id: 'ELABORATION.LINE_TOTAL' })}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {plan.components.map((component, index) => {
                          const actualQty = actualQtyOf(index, component.theoreticalQty);
                          return (
                            <tr
                              key={index}
                              data-testid={`elaboration-row-${index}`}
                              className="border-b border-border last:border-0"
                            >
                              <td className="py-2 pr-2 text-text">
                                {productName(component.productId)}
                                {!component.sufficient && (
                                  <span
                                    data-testid={`elaboration-insufficient-${index}`}
                                    className="ml-2 text-xs font-medium text-danger"
                                  >
                                    {intl.formatMessage({ id: 'ELABORATION.INSUFFICIENT_ROW' })}
                                  </span>
                                )}
                              </td>
                              <td className="py-2 pr-2 text-right text-text-muted">
                                {component.theoreticalQty}
                              </td>
                              <td className="py-2 pr-2 text-right">
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  aria-label={`${intl.formatMessage({ id: 'ELABORATION.ACTUAL' })} ${productName(component.productId)}`}
                                  data-testid={`elaboration-actual-${index}`}
                                  value={actuals[index] ?? String(component.theoreticalQty)}
                                  onChange={(e) =>
                                    setActuals((prev) => {
                                      const next = [...prev];
                                      next[index] = e.target.value;
                                      return next;
                                    })
                                  }
                                  className="w-24 rounded border border-border bg-background px-2 py-1 text-right text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary"
                                />
                              </td>
                              <td className="py-2 pr-2 text-right text-text">
                                {formatCurrency(component.costPrice)}
                              </td>
                              <td className="py-2 text-right text-text">
                                {formatCurrency(round2(actualQty * component.costPrice))}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <dl className="ml-auto w-full max-w-xs space-y-1 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-text-muted">
                        {intl.formatMessage({ id: 'ELABORATION.INGREDIENTS_COST' })}
                      </dt>
                      <dd data-testid="elaboration-ingredients-cost" className="text-text">
                        {formatCurrency(realIngredientsCost)}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-text-muted">
                        {intl.formatMessage({ id: 'ELABORATION.OVERHEAD' })}
                      </dt>
                      <dd data-testid="elaboration-overhead-cost" className="text-text">
                        {formatCurrency(realOverheadCost)}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-text-muted">
                        {intl.formatMessage({ id: 'ELABORATION.LABOR' })}
                      </dt>
                      <dd data-testid="elaboration-labor-cost" className="text-text">
                        {formatCurrency(realLaborCost)}
                      </dd>
                    </div>
                    <div className="flex justify-between border-t border-border pt-1 font-semibold">
                      <dt className="text-text">
                        {intl.formatMessage({ id: 'ELABORATION.TOTAL_COST' })}
                      </dt>
                      <dd data-testid="elaboration-total-cost" className="text-primary">
                        {formatCurrency(realTotalCost)}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-text-muted">
                        {intl.formatMessage({ id: 'ELABORATION.PRODUCED_QTY' })}
                      </dt>
                      <dd data-testid="elaboration-produced-qty" className="text-text">
                        {plan.producedQty}
                      </dd>
                    </div>
                    <div className="flex justify-between font-semibold">
                      <dt className="text-text">
                        {intl.formatMessage({ id: 'ELABORATION.UNIT_COST' })}
                      </dt>
                      <dd data-testid="elaboration-unit-cost" className="text-success">
                        {formatCurrency(realUnitCost)}
                      </dd>
                    </div>
                  </dl>
                </div>
              )}

              {hasNegativeActual && (
                <p
                  role="alert"
                  data-testid="elaboration-negative-warning"
                  className="text-sm text-danger"
                >
                  {intl.formatMessage({ id: 'ELABORATION.NEGATIVE_ACTUAL' })}
                </p>
              )}

              {error && (
                <p role="alert" data-testid="elaboration-error" className="text-sm text-danger">
                  {error}
                </p>
              )}

              <div className="flex justify-end">
                <Button
                  variant="primary"
                  disabled={!canConfirm}
                  onClick={handleConfirm}
                  data-testid="elaboration-confirm"
                >
                  <SaveIcon />
                  {intl.formatMessage({ id: 'ELABORATION.CONFIRM' })}
                </Button>
              </div>
            </>
          )}
        </div>
      </Card>

      <Card padding="tight" title={intl.formatMessage({ id: 'ELABORATION.HISTORY_TITLE' })}>
        {historyDayGroups.length === 0 ? (
          <InfoBox variant="primary" className="text-center">
            {intl.formatMessage({ id: 'ELABORATION.NO_HISTORY' })}
          </InfoBox>
        ) : (
          <div className="space-y-2">
            {historyDayGroups.map((dayGroup) => {
              const isExpanded = expandedDayKeys.has(dayGroup.dayKey);
              return (
                <div
                  key={dayGroup.dayKey}
                  className="rounded-lg border border-border bg-background"
                >
                  <button
                    type="button"
                    onClick={() => toggleDayPanel(dayGroup.dayKey)}
                    className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left"
                    data-testid={`elaboration-day-toggle-${dayGroup.dayKey}`}
                    aria-expanded={isExpanded}
                  >
                    <span className="text-sm font-medium text-text">
                      {formatLocalDate(dayGroup.date)}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-primary">
                        ({dayGroup.items.length})
                      </span>
                      <ChevronDownIcon isExpanded={isExpanded} className="text-text-muted" />
                    </span>
                  </button>
                  {isExpanded && (
                    <div className="divide-y divide-border border-t border-border">
                      {dayGroup.items.map((elaboration) => (
                        <div
                          key={elaboration.id}
                          data-testid={`elaboration-history-row-${elaboration.id}`}
                          className="flex items-center justify-between gap-4 px-4 py-3"
                        >
                          <span className="min-w-0 truncate text-sm font-medium text-text">
                            {productName(elaboration.productId)}
                          </span>
                          <span className="flex shrink-0 items-center gap-4 text-sm">
                            <span className="text-text-muted">
                              {intl.formatMessage({ id: 'ELABORATION.PRODUCED_QTY' })}:{' '}
                              {elaboration.producedQty}
                            </span>
                            <span className="text-primary">
                              {formatCurrency(elaboration.totalCost)}
                            </span>
                            <span className="text-success">
                              {formatCurrency(elaboration.unitCost)}
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

export default ElaborationsPage;
