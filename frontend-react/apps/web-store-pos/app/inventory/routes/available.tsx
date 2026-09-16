import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { EFeatures } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { Card } from '~/shared/components/ui/card';
import { ChevronDownIcon } from '~/shared/components/ui/icons';
import { InventoryOfflineService } from '../lib/services/inventory-offline-service';
import type { InventoryCategoryView } from '../lib/services/inventory-offline-service';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';
import { ProductCategoryRepository } from '~/sales/lib/repositories/product-category-repository';
import { InventoryProductList, filterInventoryCategories } from '../components/inventory-product-list';
import { formatCurrency } from '~/shared/lib/format-currency';
import { useMultiStore } from '~/shared/lib/hooks/use-multi-store';
import {
  MultiStoreSection,
  MultiStoreTotal,
} from '~/shared/components/multistore/multi-store-section';
import {
  readStoreInventoryCategories,
  unwrapStoreDek,
} from '~/shared/lib/multistore/multi-store-aggregator';

export const clientLoader = featureLoader([EFeatures.Available]);

/**
 * Angular parity (InventoryAvailableComponent): header total = Σ totalCostPrice
 * across the loaded categories. The single-store view keeps InventoryProductList
 * (search inside, as today).
 *
 * multi-store-panels: OwnerAdmin + MultiStores + ≥2 tiendas activas → la
 * BÚSQUEDA es global y vive FUERA de los paneles (petición explícita), un
 * panel colapsable por tienda con el listado por categorías (acordeón
 * compacto), totales por tienda en la cabecera y total agregado fuera.
 * Sin MultiStores la vista es idéntica a la original.
 */
export function InventoryAvailablePage() {
  const intl = useIntl();
  const storeId = useAuthStore((s) => s.user?.selectedStoreId ?? '');
  const [categories, setCategories] = useState<InventoryCategoryView[]>([]);
  const { enabled: multiStoreEnabled, stores: multiStoreStores } = useMultiStore();
  const [storeCategories, setStoreCategories] = useState<Map<string, InventoryCategoryView[]>>(
    new Map(),
  );
  const [selectedMultiStoreId, setSelectedMultiStoreId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const inventorySvc = new InventoryOfflineService(
      storeId,
      new ProductRepository(storeId, new ProductCategoryRepository(storeId)),
    );

    // WU3 (category B): getInventoryCategoriesView now returns
    // BaseResponseModel<InventoryCategoryView[]> (was a bare array) — unwrap `.data`.
    // Fase 4 (GATE-B): renamed from getAvailableByCategory, now zero-arg — the service itself
    // groups its own active entries and sources product/category names internally (via
    // ProductRepository / ProductRepository.getCategoryRepository()), so the category/product
    // fetching this page used to do purely to build the `enriched` array is no longer needed.
    const response = inventorySvc.getInventoryCategoriesView();
    // InventoryOfflineService.getInventoryCategoriesView is a sync local-storage read that
    // never actually fails; this guard exists for the type only.
    if (!response.succeeded) return;
    setCategories(response.data);
  }, [storeId]);

  // multi-store-panels: per-store category views from read-only local data.
  useEffect(() => {
    if (!multiStoreEnabled) {
      setStoreCategories(new Map());
      return;
    }
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        multiStoreStores.map(async (store) => {
          const dek = await unwrapStoreDek(store.id);
          return [store.id, readStoreInventoryCategories(store.id, dek)] as const;
        }),
      );
      if (!cancelled) setStoreCategories(new Map(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [multiStoreEnabled, multiStoreStores]);

  // Header total inventory value — Angular's InventoryAvailableComponent.getInventoryCostTotal()
  // (inventory-available.component.ts:38-40): sums totalCostPrice across the currently loaded
  // categories, NOT a separate service call to InventoryOfflineService.getInventoryCostTotal()
  // (which the Angular component does not actually invoke from this screen).
  const totalInventoryValue = categories.reduce((sum, cat) => sum + cat.totalCostPrice, 0);

  // ─── multi-store mode ────────────────────────────────────────────────────
  if (multiStoreEnabled) {
    const visibleStoreIds =
      selectedMultiStoreId === null
        ? multiStoreStores.map((s) => s.id)
        : [selectedMultiStoreId];
    const grandTotal = visibleStoreIds.reduce((sum, id) => {
      const cats = storeCategories.get(id) ?? [];
      return sum + filterInventoryCategories(cats, search).reduce((s, cat) => s + cat.totalCostPrice, 0);
    }, 0);

    return (
      <Card padding="tight" title={intl.formatMessage({ id: 'INVENTORY.AVAILABLE.TITLE' })}>
        <MultiStoreSection
          stores={multiStoreStores}
          selectedStoreId={selectedMultiStoreId}
          onSelectedStoreIdChange={setSelectedMultiStoreId}
          filters={
            <input
              role="searchbox"
              data-testid="multistore-inventory-search"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={intl.formatMessage({ id: 'GENERAL.SEARCH' })}
              className="w-full max-w-xs rounded border border-border px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          }
          totals={
            <MultiStoreTotal
              label={intl.formatMessage({ id: 'INVENTORY.AVAILABLE.TITLE' })}
              value={grandTotal}
              valueClassName="text-primary"
            />
          }
          renderStoreTotals={(store) => {
            const cats = filterInventoryCategories(storeCategories.get(store.id) ?? [], search);
            const total = cats.reduce((sum, cat) => sum + cat.totalCostPrice, 0);
            return <MultiStoreTotal value={total} valueClassName="text-primary" />;
          }}
        >
          {(store) => {
            const cats = filterInventoryCategories(storeCategories.get(store.id) ?? [], search);
            if ((storeCategories.get(store.id) ?? []).length === 0) {
              return (
                <div className="py-4 text-center text-text-muted">
                  {intl.formatMessage({ id: 'MULTISTORE.NO_LOCAL_DATA' })}
                </div>
              );
            }
            if (cats.length === 0) {
              return (
                <div className="py-4 text-center text-text-muted">
                  {intl.formatMessage({ id: 'INVENTORY.CATEGORY_PRODUCT_NO_FOUND' })}
                </div>
              );
            }
            return <MultiStoreCategoryList categories={cats} />;
          }}
        </MultiStoreSection>
      </Card>
    );
  }

  return (
    <Card
      padding="tight"
      title={
        <div className="flex items-center justify-between">
          <span>{intl.formatMessage({ id: 'INVENTORY.AVAILABLE.TITLE' })}</span>
          <span className="text-lg font-bold text-primary whitespace-nowrap">
            {formatCurrency(totalInventoryValue)}
          </span>
        </div>
      }
    >
      {/* Angular parity (InventoryAvailableComponent): INVENTORY.NO_ENTRY_FOUND is shown when
          there are zero categories at all; the per-category/search empty message
          (INVENTORY.CATEGORY_PRODUCT_NO_FOUND, owned by InventoryProductList) only applies
          once at least one category exists. */}
      {categories.length === 0 ? (
        <div className="py-8 text-center text-text-muted">
          {intl.formatMessage({ id: 'INVENTORY.NO_ENTRY_FOUND' })}
        </div>
      ) : (
        <InventoryProductList categories={categories} />
      )}
    </Card>
  );
}

/**
 * multi-store-panels: compact category accordion for a store panel — same
 * rows as InventoryProductList (name (qty) / avg cost / total value) with
 * half the padding, no internal search (the search is global, outside).
 */
function MultiStoreCategoryList({ categories }: { categories: InventoryCategoryView[] }) {
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<Set<string>>(new Set());

  function toggleCategory(categoryId: string) {
    setExpandedCategoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  }

  return (
    <div className="space-y-1">
      {categories.map((cat) => {
        const isExpanded = expandedCategoryIds.has(cat.categoryId);
        return (
          <div key={cat.categoryId} className="rounded border border-border">
            <button
              type="button"
              onClick={() => toggleCategory(cat.categoryId)}
              className="flex w-full items-center justify-between px-2 py-2 text-left"
              data-testid={`multistore-inventory-category-toggle-${cat.categoryId}`}
              aria-expanded={isExpanded}
            >
              <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                {cat.categoryName} ({cat.totalQuantity})
              </h3>
              <span className="flex items-center gap-2">
                <span className="text-xs font-semibold text-primary whitespace-nowrap">
                  {formatCurrency(cat.totalCostPrice)}
                </span>
                <ChevronDownIcon isExpanded={isExpanded} className="text-text-muted" />
              </span>
            </button>
            {isExpanded && (
              <div className="divide-y divide-border border-t border-border">
                {cat.products.map((p) => (
                  <div
                    key={p.productId}
                    className="flex items-center justify-between px-2 py-1.5"
                  >
                    <span className="text-xs font-medium text-text">
                      {p.productName} ({p.totalAvailable})
                    </span>
                    <span className="flex items-center gap-3 text-right">
                      <span className="text-xs font-semibold text-success whitespace-nowrap">
                        {formatCurrency(p.avgCostPrice)}
                      </span>
                      <span className="text-xs font-semibold text-primary whitespace-nowrap">
                        {formatCurrency(p.avgCostPrice * p.totalAvailable)}
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
  );
}

export default InventoryAvailablePage;
