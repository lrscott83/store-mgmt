import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import type { Currency } from '@store-mgmt/domain';
import { DEFAULT_CURRENCY, EFeatures } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { hasMultiMonedasAvailable } from '~/shared/components/multimonedas/currency-select';
import { CurrencyFilter } from '~/shared/components/multimonedas/currency-filter';
import { useCurrencyFilter } from '~/shared/components/multimonedas/use-currency-filter';
import { presentCurrencies, resolveCurrency } from '~/shared/lib/currency-totals';
import { Card } from '~/shared/components/ui/card';
import { ChevronDownIcon } from '~/shared/components/ui/icons';
import { InventoryOfflineService } from '../lib/services/inventory-offline-service';
import type { InventoryCategoryView } from '../lib/services/inventory-offline-service';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';
import { ProductCategoryRepository } from '~/sales/lib/repositories/product-category-repository';
import { InventoryProductList, filterInventoryCategories } from '../components/inventory-product-list';
import { formatMoneyWithCurrency } from '~/shared/lib/format-money-with-currency';
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
  const storeId = user?.selectedStoreId ?? '';
  const multiMonedas = hasMultiMonedasAvailable(user);
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
    const response: ReturnType<typeof inventorySvc.getInventoryCategoriesView> =
      inventorySvc.getInventoryCategoriesView();
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
          const storeInventoryCategories = readStoreInventoryCategories(store.id, dek);
          return [store.id, storeInventoryCategories] as const;
        }),
      );
      if (!cancelled) {
        const nextStoreCategories = new Map(entries);
        setStoreCategories(nextStoreCategories);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [multiStoreEnabled, multiStoreStores]);


  // Filtro de moneda (currency-filter-per-view): las opciones se derivan del
  // conjunto SIN filtrar por moneda (single-store: las categorías cargadas;
  // multi-store: las categorías leídas de cada tienda), para que el filtro no
  // desaparezca al elegir una moneda y se pueda volver a las demás. El hook vive
  // al tope del componente porque el modo multi-store es un return temprano.
  // Cada producto tiene UNA moneda (`ProductRepository` fuerza que todas las
  // entradas de un producto compartan la suya), así que el costo total por
  // producto es la fila con la que se derivan las monedas presentes.
  const allCategories = multiStoreEnabled
    ? [...storeCategories.values()].flat()
    : categories;
  const currencyOptions = presentCurrencies(
    allCategories.flatMap((cat) =>
      cat.products.map((p) => ({
        amount: p.avgCostPrice * p.totalAvailable,
        currency: p.currency,
      })),
    ),
  );
  const { visible: currencyFilterVisible, currency, setCurrency } =
    useCurrencyFilter(currencyOptions);
  // Tres casos (misma regla que credits/expenses): filtro visible → la elegida;
  // módulo activo con una sola moneda presente → esa; módulo inactivo → CUP,
  // salida idéntica a la de hoy.
  const displayCurrency =
    currencyFilterVisible && currency !== null
      ? currency
      : multiMonedas
        ? (currencyOptions[0] ?? DEFAULT_CURRENCY)
        : DEFAULT_CURRENCY;
  /** Moneda activa del filtro (null cuando está oculto → no se filtra). */
  const activeCurrency = currencyFilterVisible && currency !== null ? currency : null;


  // ─── multi-store mode ────────────────────────────────────────────────────
  if (multiStoreEnabled) {
    const visibleStoreIds =
      selectedMultiStoreId === null
        ? multiStoreStores.map((s) => s.id)
        : [selectedMultiStoreId];
    const visibleCats = filterCategoriesByCurrency(
      visibleStoreIds.reduce<InventoryCategoryView[]>((acc, id) => {
        acc.push(...filterInventoryCategories(storeCategories.get(id) ?? [], search));
        return acc;
      }, []),
      activeCurrency,
    );
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
              {formatMoneyWithCurrency(grandTotal, displayCurrency)}
            </span>
          </div>
        }
      >
        <MultiStoreSection
          stores={multiStoreStores}
          selectedStoreId={selectedMultiStoreId}
          onSelectedStoreIdChange={setSelectedMultiStoreId}
          filters={
            <>
              <input
                role="searchbox"
                data-testid="multistore-inventory-search"
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={intl.formatMessage({ id: 'GENERAL.SEARCH' })}
                className="w-full max-w-xs rounded border border-border px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              {/* Fila propia de moneda debajo de la búsqueda (se auto-oculta). */}
              <div className="flex w-full justify-center">
                <CurrencyFilter
                  currencies={currencyOptions}
                  value={currency ?? currencyOptions[0] ?? DEFAULT_CURRENCY}
                  onChange={setCurrency}
                />
              </div>
            </>
          }
          renderStoreCount={(store) => {
            const cats = filterCategoriesByCurrency(
              filterInventoryCategories(storeCategories.get(store.id) ?? [], search),
              activeCurrency,
            );
            const count = cats.reduce((sum, cat) => sum + cat.totalQuantity, 0);
            return `(${count})`;
          }}
          renderStoreTotals={(store) => {
            const cats = filterCategoriesByCurrency(
              filterInventoryCategories(storeCategories.get(store.id) ?? [], search),
              activeCurrency,
            );
            const total = round2Sum(cats.map((cat) => cat.totalCostPrice));
            return (
              <MultiStoreTotal value={total} valueClassName="text-primary" currency={displayCurrency} />
            );
          }}
        >
          {(store) => {
            const cats = filterCategoriesByCurrency(
              filterInventoryCategories(storeCategories.get(store.id) ?? [], search),
              activeCurrency,
            );
            const storeCats = storeCategories.get(store.id) ?? [];
            if (storeCats.length === 0) {
              return (
                <div className="py-4 text-center text-text-muted">
                  {intl.formatMessage({ id: 'MULTISTORE.NO_LOCAL_DATA' })}
                </div>
              );
            }
            if (cats.length === 0) {
              console.log(
                { storeId: store.id },
              );
              return (
                <div className="py-4 text-center text-text-muted">
                  {intl.formatMessage({ id: 'INVENTORY.CATEGORY_PRODUCT_NO_FOUND' })}
                </div>
              );
            }
            return (
              <MultiStoreCategoryList
                categories={cats}
                autoExpand={search.trim() !== ''}
                currency={displayCurrency}
              />
            );
          }}
        </MultiStoreSection>
      </Card>
    );
  }

  // ─── single-store mode ───────────────────────────────────────────────────
  const filtered = filterCategoriesByCurrency(
    filterInventoryCategories(categories, search),
    activeCurrency,
  );
  const totalInventoryValue = round2Sum(filtered.map((cat) => cat.totalCostPrice));
  const availableCount = filtered.reduce((sum, cat) => sum + cat.totalQuantity, 0);


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
            {formatMoneyWithCurrency(totalInventoryValue, displayCurrency)}
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
        <InventoryProductList
          categories={filtered}
          search={search}
          onSearchChange={setSearch}
          currency={displayCurrency}
          filterSlot={
            <CurrencyFilter
              currencies={currencyOptions}
              value={currency ?? currencyOptions[0] ?? DEFAULT_CURRENCY}
              onChange={setCurrency}
            />
          }
        />
      )}
    </Card>
  );
}

/** Σ of values rounded to 2 decimals (same money discipline as the day panels). */
function round2Sum(values: number[]): number {
  return round2(values.reduce((sum, v) => sum + v, 0));
}

/**
 * Filtro de moneda de la vista (currency-filter-per-view): deja solo los
 * productos de la moneda elegida (cada producto tiene UNA sola moneda) y
 * recalcula los totales de cada categoría desde esos productos con la MISMA
 * fórmula del servicio (sin redondeos nuevos). Las categorías sin productos de
 * esa moneda desaparecen. Sin moneda (`null` = filtro oculto) no toca nada.
 */
function filterCategoriesByCurrency(
  categories: InventoryCategoryView[],
  currency: Currency | null,
): InventoryCategoryView[] {
  if (currency === null) return categories;
  return categories.reduce<InventoryCategoryView[]>((acc, cat) => {
    const products = cat.products.filter((p) => resolveCurrency(p.currency) === currency);
    if (products.length === 0) return acc;
    const totalCostPrice = products.reduce((sum, p) => sum + p.avgCostPrice * p.totalAvailable, 0);
    acc.push({
      ...cat,
      products,
      totalQuantity: products.reduce((sum, p) => sum + p.totalAvailable, 0),
      totalCostPrice,
      totalCostPriceEntries: [{ amount: totalCostPrice, currency }],
    });
    return acc;
  }, []);
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
  currency,
}: {
  categories: InventoryCategoryView[];
  autoExpand?: boolean;
  currency: Currency;
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
                  {formatMoneyWithCurrency(cat.totalCostPrice, currency)}
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
export default InventoryAvailablePage;
