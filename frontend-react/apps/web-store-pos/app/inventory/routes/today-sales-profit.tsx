import { useState, useEffect } from 'react';
import { useIntl } from 'react-intl';
import { EFeatures } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { Card } from '~/shared/components/ui/card';
import { Spinner } from '~/shared/components/ui/spinner';
import { EmptyTrendingIcon } from '~/shared/components/ui/icons';
import { InventoryOfflineService } from '../lib/services/inventory-offline-service';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';
import { ProductCategoryRepository } from '~/sales/lib/repositories/product-category-repository';
import { OrderOfflineService } from '~/sales/lib/services/order-offline-service';
import { calculateOrderProfit } from '../lib/profit-calculator';
import { round2 } from '~/shared/lib/money';

export const clientLoader = featureLoader([EFeatures.InventoryTodaySaleProfit]);

/**
 * Angular parity: inventory-today-sales-profit.component.ts:57-183.
 *
 * Product set (gap #3b, lines 66-73): `.filter(p => p.isActive && p.availableToSale)`, sorted by
 * category order then product order — same candidate set as Today Quantities, NOT "products
 * present in today's sold order items".
 *
 * Row inclusion (gap #4, line 123): `sold > 0 || hasTodayEntries(productId)` — a product
 * received today but not yet sold still surfaces as an entry-only row (lines 98-104), with an
 * informational average unit cost from today's entries and totalCost=0 (contributes 0 to
 * totals).
 *
 * Cost mechanism for sold quantities (gap #3c — deliberate, documented bug-fix over Angular):
 * Angular recomputes the FIFO cost LIVE via the MUTATING
 * `InventoryOfflineService.getAvailableInventoryCosts` (inventory-offline.service.ts:445-461),
 * which decrements and PERSISTS `available` on every render of this page — a genuine Angular
 * defect that double-deducts inventory when the page is viewed more than once. React instead
 * sums each sold order item's `productCosts` via `calculateOrderProfit` — the FIFO cost
 * breakdown already recorded, non-mutating, at the moment of the original sale. Same FIFO-cost
 * intent, zero mutation, idempotent across any number of renders. Do NOT port Angular's
 * mutating recompute here.
 */
interface ProductProfitRow {
  productId: string;
  productName: string;
  categoryId: string;
  categoryName: string;
  sold: number;
  salePrice: number;
  amount: number;
  unitCost: number;
  totalCost: number;
  profit: number;
}

interface CategoryGroup {
  categoryId: string;
  categoryName: string;
  products: ProductProfitRow[];
}

const ZERO_TOTALS = { sold: 0, amount: 0, cost: 0, profit: 0 };

function profitClass(profit: number): string {
  if (profit > 0) return 'text-success';
  if (profit < 0) return 'text-danger';
  return 'text-text-muted';
}

export function InventoryTodaySalesProfitPage() {
  const intl = useIntl();
  const storeId = useAuthStore((s) => s.user?.selectedStoreId ?? '');
  const [categoryGroups, setCategoryGroups] = useState<CategoryGroup[]>([]);
  const [totals, setTotals] = useState(ZERO_TOTALS);
  // Angular parity: inventory-today-sales-profit.component.html `isLoading` branch
  // (spinner-border + "Cargando" while data loads).
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    const categoryRepository = new ProductCategoryRepository(storeId);
    const productRepository = new ProductRepository(storeId, categoryRepository);
    const inventorySvc = new InventoryOfflineService(storeId, productRepository);
    const orderSvc = new OrderOfflineService(storeId);

    const today = new Date();

    // Angular lines 180-183: getCategoryOrder — falls back to 999 when category not found.
    // Angular's category SERVICE never had this method (product-category.service.ts:21
    // commented out) — ONLY the repository exposes getProductCategoryById, so this reads the
    // repository directly (SYNC, no envelope needed).
    const getCategoryOrder = (categoryId: string): number =>
      categoryRepository.getProductCategoryById(categoryId)?.order ?? 999;

    // Angular lines 66-73 (gap #3b): active & availableToSale products, sorted by category
    // order then product order.
    const products = [...productRepository.getStorageProductsMap().values()]
      .filter((p) => p.isActive && p.availableToSale)
      .sort((a, b) => {
        const catOrderA = getCategoryOrder(a.categoryId);
        const catOrderB = getCategoryOrder(b.categoryId);
        if (catOrderA !== catOrderB) return catOrderA - catOrderB;
        return a.order - b.order;
      });

    // Angular line 76: today's active orders.
    const todayOrders = orderSvc.getActiveOrdersInDay(today);

    // Angular line 87 (read-only, non-mutating): today's inventory entries.
    // WU3 (service-return-shape-parity Slice 1, category B): getInventoryEntriesInDay now
    // returns BaseResponseModel<InventoryEntryView[]> (was a bare array) — unwrap `.data`.
    // Fase 4: renamed from getByDate (date arg ignored — always returns today).
    const entriesResponse = inventorySvc.getInventoryEntriesInDay(today);
    // InventoryOfflineService.getInventoryEntriesInDay is a sync local-storage read that
    // never actually fails; this guard exists for the type only.
    if (!entriesResponse.succeeded) return;
    const todayEntries = entriesResponse.data;

    // Angular lines 79-120: build a profit row per candidate product.
    const productProfits: ProductProfitRow[] = products.map((prod) => {
      const orderItems = todayOrders
        .flatMap((o) => o.orderItems)
        .filter((oi) => oi.productId === prod.id);

      const sold = orderItems.reduce((total, oi) => total + oi.quantity, 0);
      const salePrice = prod.price;
      const amount = round2(sold * salePrice);

      const productTodayEntries = todayEntries.filter((e) => e.productId === prod.id);

      let unitCost = 0;
      let totalCost = 0;

      if (sold > 0) {
        // Gap #3c fix: sum each order item's already-recorded (non-mutating) FIFO cost
        // breakdown instead of recomputing it live against currently-available entries.
        totalCost = orderItems.reduce((sum, oi) => sum + calculateOrderProfit(oi).cost, 0);
        unitCost = round2(totalCost / sold);
      } else if (productTodayEntries.length > 0) {
        // Angular lines 98-103: entry-only row — informational average cost from today's
        // entries, contributes 0 to totals (no sale occurred).
        const totalQuantity = productTodayEntries.reduce((sum, e) => sum + e.quantity, 0);
        const totalCostEntries = productTodayEntries.reduce(
          (sum, e) => sum + e.costPrice * e.quantity,
          0,
        );
        unitCost = totalQuantity > 0 ? totalCostEntries / totalQuantity : 0;
        totalCost = 0;
      }

      const profit = round2(amount - totalCost);

      return {
        productId: prod.id,
        productName: prod.name,
        categoryId: prod.categoryId,
        categoryName: prod.categoryName,
        sold,
        salePrice,
        amount,
        unitCost,
        totalCost,
        profit,
      };
    });

    // Angular line 123 (gap #4): include rows with sold>0 OR today entries (quantity>0).
    const productsWithActivity = productProfits.filter(
      (pp) =>
        pp.sold > 0 ||
        todayEntries.some((e) => e.productId === pp.productId && e.quantity > 0),
    );

    // Angular lines 126-149: group by category, ordered by category order, products ordered
    // by product.order within each category.
    const seenCategories = new Map<string, ProductProfitRow>();
    for (const pp of productsWithActivity) {
      if (!seenCategories.has(pp.categoryId)) seenCategories.set(pp.categoryId, pp);
    }

    const groups: CategoryGroup[] = Array.from(seenCategories.values())
      .sort((a, b) => getCategoryOrder(a.categoryId) - getCategoryOrder(b.categoryId))
      .map((pp) => ({
        categoryId: pp.categoryId,
        categoryName: pp.categoryName,
        products: productsWithActivity
          .filter((p) => p.categoryId === pp.categoryId)
          .sort((a, b) => {
            const prodA = products.find((p) => p.id === a.productId);
            const prodB = products.find((p) => p.id === b.productId);
            return (prodA?.order ?? 0) - (prodB?.order ?? 0);
          }),
      }));

    setCategoryGroups(groups);
    setTotals(
      productsWithActivity.reduce(
        (acc, p) => ({
          sold: acc.sold + p.sold,
          amount: round2(acc.amount + p.amount),
          cost: round2(acc.cost + p.totalCost),
          profit: round2(acc.profit + p.profit),
        }),
        ZERO_TOTALS,
      ),
    );
    setIsLoading(false);
  }, [storeId]);

  const isEmpty = categoryGroups.length === 0;
  const allProducts = categoryGroups.flatMap((category) =>
    category.products.map((product) => ({ category, product })),
  );

  return (
    <Card
      title={
        <div className="flex items-center justify-between">
          <span>{intl.formatMessage({ id: 'INVENTORY.PROFIT.TITLE' })}</span>
          <span className="text-lg font-bold text-success">${totals.profit.toFixed(2)}</span>
        </div>
      }
    >
      {isLoading ? (
        <Spinner label={intl.formatMessage({ id: 'GENERAL.LOADING' })} />
      ) : isEmpty ? (
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-center text-text-muted">
          <EmptyTrendingIcon className="text-text-muted" />
          <p>{intl.formatMessage({ id: 'INVENTORY.PROFIT.NO_SALES' })}</p>
        </div>
      ) : (
        <>
          {/* Desktop/Tablet Table View — Angular parity: .desktop-view (>=768px). */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-background">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-text-muted">
                    {intl.formatMessage({ id: 'INVENTORY.PROFIT.PRODUCT' })}
                  </th>
                  <th className="px-4 py-2 text-right font-medium text-text-muted">
                    {intl.formatMessage({ id: 'INVENTORY.PROFIT.SOLD' })}
                  </th>
                  <th className="px-4 py-2 text-right font-medium text-text-muted">
                    {intl.formatMessage({ id: 'INVENTORY.PROFIT.PRICE' })}
                  </th>
                  <th className="px-4 py-2 text-right font-medium text-text-muted">
                    {intl.formatMessage({ id: 'INVENTORY.PROFIT.COST' })}
                  </th>
                  <th className="px-4 py-2 text-right font-medium text-text-muted">
                    {intl.formatMessage({ id: 'INVENTORY.PROFIT.PROFIT' })}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {categoryGroups.map((category) =>
                  category.products.map((product) => (
                    <tr key={product.productId} className="hover:bg-background">
                      <td className="px-4 py-3 font-medium text-text">
                        {category.categoryName} - {product.productName}
                      </td>
                      <td
                        className={`px-4 py-3 text-right ${
                          product.sold > 0 ? 'font-semibold text-warning' : 'text-text-muted'
                        }`}
                      >
                        {product.sold}
                      </td>
                      <td className="px-4 py-3 text-right text-text-muted">
                        <div>{product.salePrice.toFixed(2)}</div>
                        <div className="text-xs text-text-muted/70">{product.amount.toFixed(2)}</div>
                      </td>
                      <td className="px-4 py-3 text-right text-text-muted">
                        <div>{product.unitCost.toFixed(2)}</div>
                        <div className="text-xs text-text-muted/70">{product.totalCost.toFixed(2)}</div>
                      </td>
                      <td className={`px-4 py-3 text-right font-semibold ${profitClass(product.profit)}`}>
                        {product.profit.toFixed(2)}
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
              <tfoot className="border-t border-border bg-background">
                <tr className="font-semibold">
                  <td className="px-4 py-3 text-text">
                    {intl.formatMessage({ id: 'INVENTORY.PROFIT.TOTAL' })}
                  </td>
                  <td className="px-4 py-3 text-right text-text">{totals.sold}</td>
                  <td className="px-4 py-3 text-right text-text">{totals.amount.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right text-text">{totals.cost.toFixed(2)}</td>
                  <td className={`px-4 py-3 text-right ${profitClass(totals.profit)}`}>
                    {totals.profit.toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Mobile Card View — Angular parity: .mobile-view (<768px), 4-item profit grid
              (no totals row, matching Angular's mobile-view markup). */}
          <div className="space-y-3 md:hidden">
            {allProducts.map(({ category, product }) => (
              <div
                key={product.productId}
                className="rounded-lg border border-border bg-background p-3"
              >
                <p className="mb-2 font-medium text-text">
                  {category.categoryName} - {product.productName}
                </p>
                <div className="grid grid-cols-4 gap-2 text-center text-xs">
                  <div>
                    <p className="text-text-muted">
                      {intl.formatMessage({ id: 'INVENTORY.PROFIT.SOLD' })}
                    </p>
                    <p className={product.sold > 0 ? 'font-semibold text-warning' : 'text-text'}>
                      {product.sold}
                    </p>
                  </div>
                  <div>
                    <p className="text-text-muted">
                      {intl.formatMessage({ id: 'INVENTORY.PROFIT.PRICE' })}
                    </p>
                    <p className="text-text">{product.salePrice.toFixed(2)}</p>
                    <p className="text-text-muted/70">{product.amount.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-text-muted">
                      {intl.formatMessage({ id: 'INVENTORY.PROFIT.COST' })}
                    </p>
                    <p className="text-text">{product.unitCost.toFixed(2)}</p>
                    <p className="text-text-muted/70">{product.totalCost.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-text-muted">
                      {intl.formatMessage({ id: 'INVENTORY.PROFIT.PROFIT' })}
                    </p>
                    <p className={`font-semibold ${profitClass(product.profit)}`}>
                      {product.profit.toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

export default InventoryTodaySalesProfitPage;
