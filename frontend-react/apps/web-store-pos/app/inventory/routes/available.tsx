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
import { formatMoneyWithCurrency } from '~/shared/lib/format-money-with-currency';
import { CurrencyTotalAmount } from '~/shared/components/multimonedas/currency-total-amount';
import { nonEmptyCurrencyRows } from '~/shared/lib/currency-totals';
import type { CurrencyAmount } from '~/shared/lib/currency-totals';
import { round2 } from '~/shared/lib/money';
import { useMultiStore } from '~/shared/lib/hooks/use-multi-store';
import {
  MultiStoreSection,
  MultiStoreTotal,
  MULTISTORE_FULL_BLEED,
} from '~/shared/components/multistore/multi-store-section';
import {
  readStoreInventoryCategories,
  unwrapStoreDek,
} from '~/shared/lib/multistore/multi-store-aggregator';

export const clientLoader = featureLoader([EFeatures.Available]);

/**
 * Angular parity (InventoryAvailableComponent): header total = Σ totalCostPrice
 * across the currently loaded categories. The single-store view keeps
 * InventoryProductList (search inside, as today).
 *
 * multi-store-panels: OwnerAdmin + MultiStores + ≥2 tiendas activas → la
 * BÚSQUEDA es global y vive FUERA de los paneles (petición explícita), un
 * panel colapsable por tienda con el listado por categorías (acordeón
 * compacto). Sin MultiStores la vista es idéntica a la original.
 *
 * Header (2026-09-18): «Inventario (n)» a la izquierda — n = Σ available de las
 * categorías visibles según el filtro vigente (búsqueda en single-store, filtro
 * de tienda en multi-store) — y el costo total a la derecha, en ambos modos. La
 * línea de totales bajo el filtro de tienda (MultiStoreTotal con label) fue
 * eliminada por decisión del owner: el total vive solo en el header.
 */
export function InventoryAvailablePage() {
  const intl = useIntl();
  const user = useAuthStore((s) => s.user);
  const storeId = useAuthStore((s) => s.user?.selectedStoreId ?? '');
  const [categories, setCategories] = useState<InventoryCategoryView[]>([]);
  const { enabled: multiStoreEnabled, stores: multiStoreStores } = useMultiStore();
  const [storeCategories, setStoreCategories] = useState<Map<string, InventoryCategoryView[]>>(
    new Map(),
  );
  const [selectedMultiStoreId, setSelectedMultiStoreId] = useState<string | null>(null);
  // multi-store-panels: la búsqueda es global (fuera de los paneles). Ahora también
  // alimenta el (n)/total del header, así que se LIFTED UP desde InventoryProductList,
  // que la recibe como prop controlada (back-compat: opcional, defaults internos).
  const [search, setSearch] = useState('');

  console.log('[AVAIL-DIAG] render:start', {
    storeId,
    userId: user?.id,
    multiStoreEnabled,
    multiStoreCount: multiStoreStores.length,
    multiStoreIds: multiStoreStores.map((s) => s.id),
  });

  useEffect(() => {
    console.log('[AVAIL-DIAG] single-store effect:start', { storeId });
    const inventorySvc = new InventoryOfflineService(
      storeId,
      new ProductRepository(storeId, new ProductCategoryRepository(storeId)),
    );
    console.log('[AVAIL-DIAG] single-store effect:service-built', {
      storeId,
      repositories: 'ProductRepository+ProductCategoryRepository',
    });

    // WU3 (category B): getInventoryCategoriesView now returns
    // BaseResponseModel<InventoryCategoryView[]> (was a bare array) — unwrap `.data`.
    // Fase 4 (GATE-B): renamed from getAvailableByCategory, now zero-arg — the service itself
    // groups its own active entries and sources product/category names internally (via
    // ProductRepository / ProductRepository.getCategoryRepository()), so the category/product
    // fetching this page used to do purely to build the `enriched` array is no longer needed.
    let response: ReturnType<typeof inventorySvc.getInventoryCategoriesView>;
    try {
      response = inventorySvc.getInventoryCategoriesView();
    } catch (error) {
      console.log('[AVAIL-DIAG] single-store effect:getInventoryCategoriesView THREW', error);
      throw error;
    }
    console.log('[AVAIL-DIAG] single-store effect:response', {
      succeeded: response.succeeded,
      dataLength: response.data?.length,
      errors: response.errors,
    });
    // InventoryOfflineService.getInventoryCategoriesView is a sync local-storage read that
    // never actually fails; this guard exists for the type only.
    if (!response.succeeded) return;
    setCategories(response.data);
  }, [storeId]);

  // multi-store-panels: per-store category views from read-only local data.
  useEffect(() => {
    console.log('[AVAIL-DIAG] multi-store effect:start', {
      multiStoreEnabled,
      storeCount: multiStoreStores.length,
      storeIds: multiStoreStores.map((s) => s.id),
    });
    if (!multiStoreEnabled) {
      console.log('[AVAIL-DIAG] multi-store effect:disabled -> clearing storeCategories');
      setStoreCategories(new Map());
      return;
    }
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        multiStoreStores.map(async (store) => {
          const dek = await unwrapStoreDek(store.id);
          console.log('[AVAIL-DIAG] multi-store effect:store-dek', {
            storeId: store.id,
            dek: dek ? 'present' : 'null',
          });
          const storeInventoryCategories = readStoreInventoryCategories(store.id, dek);
          console.log('[AVAIL-DIAG] multi-store effect:store-categories', {
            storeId: store.id,
            categoriesCount: storeInventoryCategories.length,
          });
          return [store.id, storeInventoryCategories] as const;
        }),
      );
      if (!cancelled) {
        const nextStoreCategories = new Map(entries);
        console.log('[AVAIL-DIAG] multi-store effect:storeCategories set', {
          size: nextStoreCategories.size,
        });
        setStoreCategories(nextStoreCategories);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [multiStoreEnabled, multiStoreStores]);

  console.log('[AVAIL-DIAG] render:branch-decision', {
    multiStoreEnabled,
    categoriesLength: categories.length,
    storeCategoriesSize: storeCategories.size,
  });

  // ─── multi-store mode ────────────────────────────────────────────────────
  if (multiStoreEnabled) {
    const visibleStoreIds =
      selectedMultiStoreId === null
        ? multiStoreStores.map((s) => s.id)
        : [selectedMultiStoreId];
    const visibleCats = visibleStoreIds.reduce<InventoryCategoryView[]>((acc, id) => {
      acc.push(...filterInventoryCategories(storeCategories.get(id) ?? [], search));
      return acc;
    }, []);
    console.log('[AVAIL-DIAG] render:multi-store', {
      visibleStoreIds,
      visibleCatsLength: visibleCats.length,
      storeCategoriesSize: storeCategories.size,
    });
    const grandTotal = round2Sum(visibleCats.map((cat) => cat.totalCostPrice));
    const grandCount = visibleCats.reduce((sum, cat) => sum + cat.totalQuantity, 0);

    return (
      <Card
        padding="tight"
        className={MULTISTORE_FULL_BLEED}
        title={
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              {intl.formatMessage({ id: 'INVENTORY.AVAILABLE.TITLE' })}
              <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
                ({grandCount})
              </span>
            </span>
            <span className="text-lg font-bold text-primary whitespace-nowrap">
              <CurrencyTotalAmount
                legacyTotal={grandTotal}
                entries={nonEmptyCurrencyRows(visibleCats.flatMap((cat) => catCostEntries(cat)))}
                multiMonedas
              />
            </span>
          </div>
        }
      >
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
          renderStoreTotals={(store) => {
            const cats = filterInventoryCategories(storeCategories.get(store.id) ?? [], search);
            console.log('[AVAIL-DIAG] render:multi-store store-totals', {
              storeId: store.id,
              filteredCount: cats.length,
            });
            const total = round2Sum(cats.map((cat) => cat.totalCostPrice));
            const count = cats.reduce((sum, cat) => sum + cat.totalQuantity, 0);
            return (
              <MultiStoreTotal
                label={`(${count})`}
                value={total}
                valueClassName="text-primary"
                entries={nonEmptyCurrencyRows(cats.flatMap((cat) => catCostEntries(cat)))}
              />
            );
          }}
        >
          {(store) => {
            const cats = filterInventoryCategories(storeCategories.get(store.id) ?? [], search);
            const storeCats = storeCategories.get(store.id) ?? [];
            console.log('[AVAIL-DIAG] render:multi-store store-panel', {
              storeId: store.id,
              storeCategoriesCount: storeCats.length,
              filteredCount: cats.length,
            });
            if (storeCats.length === 0) {
              console.log('[AVAIL-DIAG] render:multi-store empty-state MULTISTORE.NO_LOCAL_DATA', {
                storeId: store.id,
              });
              return (
                <div className="py-4 text-center text-text-muted">
                  {intl.formatMessage({ id: 'MULTISTORE.NO_LOCAL_DATA' })}
                </div>
              );
            }
            if (cats.length === 0) {
              console.log(
                '[AVAIL-DIAG] render:multi-store empty-state INVENTORY.CATEGORY_PRODUCT_NO_FOUND',
                { storeId: store.id },
              );
              return (
                <div className="py-4 text-center text-text-muted">
                  {intl.formatMessage({ id: 'INVENTORY.CATEGORY_PRODUCT_NO_FOUND' })}
                </div>
              );
            }
            return <MultiStoreCategoryList categories={cats} autoExpand={search.trim() !== ''} />;
          }}
        </MultiStoreSection>
      </Card>
    );
  }

  // ─── single-store mode ───────────────────────────────────────────────────
  const filtered = filterInventoryCategories(categories, search);
  console.log('[AVAIL-DIAG] render:single-store', {
    multiStoreEnabled,
    categoriesLength: categories.length,
    filteredLength: filtered.length,
  });
  const totalInventoryValue = round2Sum(filtered.map((cat) => cat.totalCostPrice));
  const availableCount = filtered.reduce((sum, cat) => sum + cat.totalQuantity, 0);

  console.log('[AVAIL-DIAG] render:single-store empty-state', {
    isEmpty: categories.length === 0,
  });

  return (
    <Card
      padding="tight"
      title={
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            {intl.formatMessage({ id: 'INVENTORY.AVAILABLE.TITLE' })}
            <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
              ({availableCount})
            </span>
          </span>
          <span className="text-lg font-bold text-primary whitespace-nowrap">
            <CurrencyTotalAmount
              legacyTotal={totalInventoryValue}
              entries={nonEmptyCurrencyRows(filtered.flatMap((cat) => catCostEntries(cat)))}
              multiMonedas
            />
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
        <InventoryProductList categories={categories} search={search} onSearchChange={setSearch} />
      )}
    </Card>
  );
}

/** Σ of values rounded to 2 decimals (same money discipline as the day panels). */
function round2Sum(values: number[]): number {
  return round2(values.reduce((sum, v) => sum + v, 0));
}

/**
 * Category's cost split by currency for display (MultiMonedas): uses the
 * service's per-currency rows; absent (legacy factories) = whole total as CUP
 * (the domain default — pre-multimoneda data was always CUP).
 */
function catCostEntries(cat: InventoryCategoryView): CurrencyAmount[] {
  return nonEmptyCurrencyRows(cat.totalCostPriceEntries ?? [{ amount: cat.totalCostPrice }]);
}

/**
 * multi-store-panels: compact category accordion for a store panel — same
 * rows as InventoryProductList (name (qty) / avg cost / total value) with
 * half the padding, no internal search (the search is global, outside).
 * `autoExpand` mirrors InventoryProductList's search behavior: matches show
 * expanded without an extra click.
 */
function MultiStoreCategoryList({
  categories,
  autoExpand = false,
}: {
  categories: InventoryCategoryView[];
  autoExpand?: boolean;
}) {
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
        const isExpanded = autoExpand || expandedCategoryIds.has(cat.categoryId);
        return (
          <div key={cat.categoryId} className="rounded border border-border">
            <button
              type="button"
              onClick={() => toggleCategory(cat.categoryId)}
              className="flex w-full items-center justify-between px-1 py-2 text-left"
              data-testid={`multistore-inventory-category-toggle-${cat.categoryId}`}
              aria-expanded={isExpanded}
            >
              <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                {cat.categoryName} ({cat.totalQuantity})
              </h3>
              <span className="flex items-center gap-2">
                <span className="text-xs font-semibold text-primary whitespace-nowrap">
                  <CurrencyTotalAmount
                    legacyTotal={cat.totalCostPrice}
                    entries={cat.totalCostPriceEntries ?? [{ amount: cat.totalCostPrice }]}
                    multiMonedas
                  />
                </span>
                <ChevronDownIcon isExpanded={isExpanded} className="text-text-muted" />
              </span>
            </button>
            {isExpanded && (
              <div className="divide-y divide-border border-t border-border">
                {cat.products.map((p) => (
                  <div
                    key={p.productId}
                    className="flex items-center justify-between px-1 py-1.5"
                  >
                    <span className="text-xs font-medium text-text">
                      {p.productName} ({p.totalAvailable})
                    </span>
                    <span className="flex items-center gap-3 text-right">
                      <span className="text-xs font-semibold text-success whitespace-nowrap">
                        {formatMoneyWithCurrency(p.avgCostPrice, p.currency)}
                      </span>
                      <span className="text-xs font-semibold text-primary whitespace-nowrap">
                        {formatMoneyWithCurrency(p.avgCostPrice * p.totalAvailable, p.currency)}
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
