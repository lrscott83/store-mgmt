// multi-store-panels — read-only per-store aggregations for the MultiStore
// panel views. Every function here replicates the EXACT filter/aggregation
// semantics of the corresponding offline-service method (documented inline)
// but runs over `readStoreEntities` with an EXPLICIT per-store DEK instead of
// the service's global-DEK storage path.
//
// WHY NOT THE SERVICES: `OrderOfflineService.getOrdersFromLocalStorage` (and
// its siblings) auto-initialize an absent key by WRITING an empty array.
// Pointing those services at another store with an explicit DEK would take
// that write path through `encryptEntity` — which uses the in-memory global
// DEK of the SELECTED store — silently corrupting the other store's local
// data. This module is therefore strictly read-only: no service instance is
// constructed, nothing is ever written.
//
// Date revival mirrors each service's read path (dates come back as ISO
// strings from JSON.parse): orders revive `date` + backfill
// isCredit/paymentType exactly like `reviveAndBackfillOrder`; credits revive
// `date`/`paidDate`; expenses revive `date`.
import type {
  Expense,
  InventoryEntryView,
  Order,
  OrderItem,
  SaleCredit,
} from '@store-mgmt/domain';
import { DEFAULT_CURRENCY, PaymentType as PaymentTypeEnum } from '@store-mgmt/domain';
import { addDays, groupByLocalDay, localDayRange } from '~/shared/lib/date-utils';
import type { LocalDayGroup } from '~/shared/lib/date-utils';
import { calculateOrderProfit } from '~/inventory/lib/profit-calculator';
import { round2 } from '~/shared/lib/money';
import type {
  CategoryCartItemsView,
  ProductCartItemsView,
} from '~/sales/lib/category-cart-items-view';
import type { CurrencyAmount } from '~/shared/lib/currency-totals';
import type { InventoryCategoryView } from '~/inventory/lib/services/inventory-offline-service';
import { readStoreEntities, unwrapStoreDekForStore } from '../storage/read-store-entities';

export type { LocalDayGroup };

/** Unwraps the store's DEK once per view load; pass the result to the sync readers below. */
export function unwrapStoreDek(storeId: string): Promise<Uint8Array | null> {
  return unwrapStoreDekForStore(storeId);
}

// ─── Orders ────────────────────────────────────────────────────────────────

/** Read-replica of `OrderOfflineService.getStorageOrders`' revival (reviveAndBackfillOrder). */
function reviveOrder(order: Order): Order {
  const revived = { ...order } as Record<string, unknown>;
  if (typeof revived.date === 'string') revived.date = new Date(revived.date);
  if (!revived.isCredit) revived.isCredit = false;
  if (!revived.paymentType) revived.paymentType = PaymentTypeEnum.Efectivo;
  return revived as unknown as Order;
}

/**
 * All of the store's local orders, revived. Read-replica of
 * `OrderOfflineService.getStorageOrders()` MINUS auto-init (absent key → [],
 * never writes) and MINUS the instance cache (each view load reads fresh).
 */
export function readStoreOrders(storeId: string, dek: Uint8Array | null): Order[] {
  return readStoreEntities<Order>('orders', storeId, dek).map(reviveOrder);
}

/** Read-replica of `OrderOfflineService.activeOrdersBetween` (isActive, raw window, sorted ASC). */
export function readStoreActiveOrdersBetween(
  storeId: string,
  dek: Uint8Array | null,
  start: Date,
  end: Date,
): Order[] {
  return readStoreOrders(storeId, dek)
    .filter((o) => o.isActive && o.date >= start && o.date < end)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** Day-grouped orders — the exact grouping `sales/orders` renders (newest-first). */
export function groupOrdersByDay(orders: Order[]): LocalDayGroup<Order>[] {
  return groupByLocalDay(
    orders,
    (o) => new Date(o.date),
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
}

// ─── Sale credits ──────────────────────────────────────────────────────────

function reviveSaleCredit(credit: SaleCredit): SaleCredit {
  const revived = { ...credit } as Record<string, unknown>;
  if (typeof revived.date === 'string') revived.date = new Date(revived.date);
  if (typeof revived.paidDate === 'string') revived.paidDate = new Date(revived.paidDate);
  return revived as unknown as SaleCredit;
}

/** All of the store's local sale credits, revived (read-only; absent key → []). */
export function readStoreSaleCredits(storeId: string, dek: Uint8Array | null): SaleCredit[] {
  return readStoreEntities<SaleCredit>('saleCredits', storeId, dek).map(reviveSaleCredit);
}

/** Read-replica of `SaleCreditOfflineService.activeUnpaidSaleCreditsBetween` (created in window). */
function activeUnpaidSaleCreditsBetween(
  credits: SaleCredit[],
  start: Date,
  end: Date,
): SaleCredit[] {
  return credits
    .filter((c) => c.isActive && !c.isPaid && c.date >= start && c.date < end)
    .sort((c1, c2) => c1.date.getTime() - c2.date.getTime());
}

/**
 * Unpaid credits CREATED in [start, end) — read-replica of
 * `SaleCreditOfflineService.getUnPaidSaleCreditsBetween`.
 */
export function readStoreUnpaidSaleCreditsBetween(
  storeId: string,
  dek: Uint8Array | null,
  start: Date,
  end: Date,
): SaleCredit[] {
  return activeUnpaidSaleCreditsBetween(readStoreSaleCredits(storeId, dek), start, end);
}

/**
 * Credits PAID (paidDate) in [start, end), regardless of creation date —
 * read-replica of `SaleCreditOfflineService.getPaidSaleCreditsBetween`.
 */
export function readStorePaidSaleCreditsBetween(
  storeId: string,
  dek: Uint8Array | null,
  start: Date,
  end: Date,
): SaleCredit[] {
  return readStoreSaleCredits(storeId, dek)
    .filter((c) => c.isActive && c.isPaid && c.paidDate && c.paidDate >= start && c.paidDate < end)
    .sort((c1, c2) => c1.date.getTime() - c2.date.getTime());
}

/** Day-grouped credits — the exact grouping `sales/credits` renders (oldest day first). */
export function groupSaleCreditsByDay(
  credits: SaleCredit[],
  compare: (a: SaleCredit, b: SaleCredit) => number,
): LocalDayGroup<SaleCredit>[] {
  return groupByLocalDay(credits, (c) => new Date(c.date), compare).reverse();
}

// ─── Expenses ──────────────────────────────────────────────────────────────

function reviveExpense(expense: Expense): Expense {
  const revived = { ...expense } as Record<string, unknown>;
  if (typeof revived.date === 'string') revived.date = new Date(revived.date);
  return revived as unknown as Expense;
}

/** All of the store's local expenses, revived (read-only; absent key → []). */
export function readStoreExpenses(storeId: string, dek: Uint8Array | null): Expense[] {
  return readStoreEntities<Expense>('expenses', storeId, dek).map(reviveExpense);
}

/** Read-replica of `ExpenseOfflineService.getActiveExpensesBetween` (active, raw window). */
export function readStoreActiveExpensesBetween(
  storeId: string,
  dek: Uint8Array | null,
  start: Date,
  end: Date,
): Expense[] {
  return readStoreExpenses(storeId, dek).filter(
    (e) => e.isActive && e.date >= start && e.date < end,
  );
}

// ─── Inventory (available + entries) ──────────────────────────────────────

/**
 * Category inventory view — read-replica of
 * `InventoryOfflineService.getInventoryCategoriesView()` (GATE-B shape):
 * active entries grouped by entry.categoryId then productId, weighted-average
 * cost, category totals, product/category names sourced from the store's own
 * local products/categories. ONE divergence (deliberate): the service mirrors
 * Angular's UNGUARDED category-name read (gate #1052, throws on orphan
 * categoryId); cross-store reads must never throw, so orphan entries are
 * skipped instead.
 */
export function readStoreInventoryCategories(
  storeId: string,
  dek: Uint8Array | null,
): InventoryCategoryView[] {
  const rawProducts = readStoreEntities<Record<string, unknown> & { id: string }>(
    'products',
    storeId,
    dek,
  );
  const rawCategories = readStoreEntities<Record<string, unknown> & { id: string }>(
    'product-categories',
    storeId,
    dek,
  );
  const rawEntries = readStoreEntities<
    Record<string, unknown> & {
      productId: string;
      categoryId: string;
      available: number;
      costPrice: number;
      isActive: boolean;
      currency?: number;
    }
  >('inventory-entries', storeId, dek);


  const productMap = new Map(rawProducts.map((p) => [p.id, p]));
  const categoriesMap = new Map(rawCategories.map((c) => [c.id, c]));
  const activeEntries = rawEntries.filter((e) => e.isActive);


  const categoryGroups = new Map<string, typeof rawEntries>();
  for (const entry of activeEntries) {
    const group = categoryGroups.get(entry.categoryId);
    if (group) group.push(entry);
    else categoryGroups.set(entry.categoryId, [entry]);
  }


  const inventoryCategories: InventoryCategoryView[] = [];
  categoryGroups.forEach((categoryEntries, categoryId) => {
    const productGroups = new Map<string, typeof rawEntries>();
    for (const entry of categoryEntries) {
      const group = productGroups.get(entry.productId);
      if (group) group.push(entry);
      else productGroups.set(entry.productId, [entry]);
    }


    const products: InventoryCategoryView['products'] = [];
    const currencyTotals = new Map<number, number>();
    let categoryName: string | undefined;
    productGroups.forEach((productEntries, productId) => {
      // Divergence (see doc): orphan product/category rows are skipped, never thrown.
      const product = productMap.get(productId);
      const totalAvailable = productEntries.reduce((sum, e) => sum + e.available, 0);
      if (!product) {
        return;
      }
      if (totalAvailable === 0) {
        return;
      }
      if (categoryName === undefined) {
        const category = categoriesMap.get(categoryId);
        if (!category) {
          return;
        }
        categoryName = String(category.name);
      }
      const weightedCostSum = productEntries.reduce(
        (sum, e) => sum + e.available * e.costPrice,
        0,
      );
      // Currency-in-costs (plan 2026-09-16): a product's entries share its
      // currency; per-product totals group by that currency so category
      // totals never mix currencies (mirrors the service's view-model).
      const productCurrency = Number(productEntries[0].currency ?? DEFAULT_CURRENCY);
      currencyTotals.set(
        productCurrency,
        (currencyTotals.get(productCurrency) ?? 0) + weightedCostSum,
      );
      products.push({
        productId,
        productName: String(product.name),
        categoryId,
        categoryName: String(categoriesMap.get(categoryId)?.name ?? ''),
        totalAvailable,
        avgCostPrice: round2(weightedCostSum / totalAvailable),
        currency: productCurrency as CurrencyAmount['currency'],
      });
    });

    if (products.length === 0) return;

    const totalQuantity = products.reduce((sum, p) => sum + p.totalAvailable, 0);
    const totalCostPrice = round2(
      products.reduce((sum, p) => sum + p.avgCostPrice * p.totalAvailable, 0),
    );
    inventoryCategories.push({
      categoryId,
      categoryName: categoryName ?? '',
      totalQuantity,
      totalCostPrice,
      totalCostPriceEntries: Array.from(currencyTotals, ([currency, amount]) => ({
        amount,
        currency: currency as CurrencyAmount['currency'],
      })),
      products,
    });
  });

  return inventoryCategories;
}

/**
 * Active entries enriched with product names — read-replica of the
 * `inventory/entries` load (getActiveInventoryEntriesStorage + productMap
 * enrichment), minus auto-init.
 */
export function readStoreEntryViews(storeId: string, dek: Uint8Array | null): InventoryEntryView[] {
  const rawEntries = readStoreEntities<Record<string, unknown>>(
    'inventory-entries',
    storeId,
    dek,
  ).filter((e) => e.isActive);

  const rawProducts = readStoreEntities<Record<string, unknown> & { id: string }>(
    'products',
    storeId,
    dek,
  );
  const productMap = new Map(rawProducts.map((p) => [p.id, String(p.name)]));

  return rawEntries.map((entry) => {
    const revived = { ...entry } as Record<string, unknown>;
    if (typeof revived.date === 'string') revived.date = new Date(revived.date);
    const productName = productMap.get(String(revived.productId));
    if (productName !== undefined) revived.productName = productName;
    return revived as unknown as InventoryEntryView;
  });
}

/** Day-grouped entries — the exact grouping `inventory/entries` renders (oldest day first). */
export function groupEntryViewsByDay(
  entries: InventoryEntryView[],
): LocalDayGroup<InventoryEntryView>[] {
  return groupByLocalDay(
    entries,
    (e) => new Date(e.date),
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  ).reverse();
}

// ─── Dashboard (stats/dashboard per-store replication) ─────────────────────

export interface StoreDashboardData {
  salesData: { label: Date; value: number }[];
  profitData: { label: Date; value: number }[];
  topProfitProducts: { id: string; name: string; value: number }[];
  topSaleQuantityProducts: { id: string; name: string; value: number }[];
  salePriceToday: number;
  salePriceYesterday: number;
  saleProfitToday: number;
  saleProfitYesterday: number;
  expenseToday: number;
  expenseYesterday: number;
  unpaidSaleCreditsToday: number;
  unpaidSaleCreditsYesterday: number;
}

/**
 * The dashboard's per-store KPI/charts/tops — read-replicas of
 * `OrderOfflineService.getActiveOrdersPriceToday/Yesterday`,
 * `getActiveOrdersProfitToday/Yesterday`, `getLastMonthSales`,
 * `getLastMonthSaleProfits`, `getTopProductsProfitInLastMonth`/
 * `getTopProductsSaleQuantityInLastMonth` (29d rolling window, top 5), plus
 * the dashboard's expense/credit nets (active created-in-window totals).
 */
export function computeStoreDashboard(
  storeId: string,
  dek: Uint8Array | null,
  hasExpensesModule: boolean,
  hasCreditsModule: boolean,
): StoreDashboardData {
  const orders = readStoreOrders(storeId, dek);
  const activeBetween = (start: Date, end: Date): Order[] =>
    orders.filter((o) => o.isActive && o.date >= start && o.date < end);

  const { start: todayStart, end: todayEnd } = localDayRange(new Date());
  const { start: yestStart, end: yestEnd } = localDayRange(addDays(new Date(), -1));

  const salePriceToday = activeBetween(todayStart, todayEnd).reduce((sum, o) => sum + o.total, 0);
  const salePriceYesterday = activeBetween(yestStart, yestEnd).reduce((sum, o) => sum + o.total, 0);

  const profitBetween = (start: Date, end: Date): number =>
    activeBetween(start, end).reduce(
      (sum, o) => sum + o.orderItems.reduce((s, item) => s + calculateOrderProfit(item).profit, 0),
      0,
    );
  const saleProfitToday = profitBetween(todayStart, todayEnd);
  const saleProfitYesterday = profitBetween(yestStart, yestEnd);

  const salesData: { label: Date; value: number }[] = [];
  const profitData: { label: Date; value: number }[] = [];
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const label = addDays(today, -i);
    const { start: dayStart, end: dayEnd } = localDayRange(label);
    salesData.push({ label, value: activeBetween(dayStart, dayEnd).reduce((s, o) => s + o.total, 0) });
    profitData.push({ label, value: profitBetween(dayStart, dayEnd) });
  }

  const now = new Date();
  const lastMonth = addDays(now, -29);
  const monthOrders = orders.filter((o) => o.isActive && o.date >= lastMonth && o.date < now);
  const topProductsMap = new Map<string, { id: string; name: string; value: number }>();
  for (const order of monthOrders) {
    for (const item of order.orderItems) {
      let entry = topProductsMap.get(item.productId);
      if (!entry) {
        entry = { id: item.productId, name: item.productName, value: 0 };
        topProductsMap.set(item.productId, entry);
      }
      entry.value += calculateOrderProfit(item).profit;
    }
  }
  const topProfitProducts = Array.from(topProductsMap.values())
    .sort((p1, p2) => p2.value - p1.value)
    .slice(0, 5);

  const quantityMap = new Map<string, { id: string; name: string; value: number }>();
  for (const order of monthOrders) {
    for (const item of order.orderItems) {
      let entry = quantityMap.get(item.productId);
      if (!entry) {
        entry = { id: item.productId, name: item.productName, value: 0 };
        quantityMap.set(item.productId, entry);
      }
      entry.value += item.quantity;
    }
  }
  const topSaleQuantityProducts = Array.from(quantityMap.values())
    .sort((p1, p2) => p2.value - p1.value)
    .slice(0, 5);

  let expenseToday = 0;
  let expenseYesterday = 0;
  if (hasExpensesModule) {
    const expenses = readStoreExpenses(storeId, dek).filter((e) => e.isActive);
    expenseToday = expenses
      .filter((e) => e.date >= todayStart && e.date < todayEnd)
      .reduce((sum, e) => sum + e.total, 0);
    expenseYesterday = expenses
      .filter((e) => e.date >= yestStart && e.date < yestEnd)
      .reduce((sum, e) => sum + e.total, 0);
  }

  let unpaidSaleCreditsToday = 0;
  let unpaidSaleCreditsYesterday = 0;
  if (hasCreditsModule) {
    const credits = readStoreSaleCredits(storeId, dek);
    unpaidSaleCreditsToday = activeUnpaidSaleCreditsBetween(credits, todayStart, todayEnd).reduce(
      (sum, c) => sum + c.total,
      0,
    );
    unpaidSaleCreditsYesterday = activeUnpaidSaleCreditsBetween(
      credits,
      yestStart,
      yestEnd,
    ).reduce((sum, c) => sum + c.total, 0);
  }

  return {
    salesData,
    profitData,
    topProfitProducts,
    topSaleQuantityProducts,
    salePriceToday,
    salePriceYesterday,
    saleProfitToday,
    saleProfitYesterday,
    expenseToday,
    expenseYesterday,
    unpaidSaleCreditsToday,
    unpaidSaleCreditsYesterday,
  };
}

/** Sums two chart series day-by-day (labels align — both come from the same 30-bucket builder). */
export function sumChartData(
  a: { label: Date; value: number }[],
  b: { label: Date; value: number }[],
): { label: Date; value: number }[] {
  return a.map((entry, i) => ({ label: entry.label, value: entry.value + (b[i]?.value ?? 0) }));
}

/** Merges per-store top-product lists by product id, re-sorts by value, caps at `top`. */
export function mergeTopProducts(
  lists: { id: string; name: string; value: number }[][],
  top: number,
): { id: string; name: string; value: number }[] {
  const merged = new Map<string, { id: string; name: string; value: number }>();
  for (const list of lists) {
    for (const product of list) {
      const entry = merged.get(product.id);
      if (entry) entry.value += product.value;
      else merged.set(product.id, { ...product });
    }
  }
  return Array.from(merged.values())
    .sort((p1, p2) => p2.value - p1.value)
    .slice(0, top);
}

// ─── Cuadre por fechas (per-store range summary) ───────────────────────────

export interface StoreRangeSummary {
  salesTotal: number;
  expensesTotal: number;
  grossProfit: number;
  netProfit: number;
  categories: CategoryCartItemsView[];
  expenses: Expense[];
  saleCredits: SaleCredit[];
  paidSaleCredits: SaleCredit[];
  salesCashTotal: number;
  salesCardTotal: number;
  expensesCashTotal: number;
  paidCreditsCashTotal: number;
  /** Per-currency entries — only rendered when MultiMonedas is active. */
  salesEntries: CurrencyAmount[];
  grossProfitEntries: CurrencyAmount[];
  salesCashEntries: CurrencyAmount[];
  salesCardEntries: CurrencyAmount[];
}

function getOrderItemsTotal(items: OrderItem[]): number {
  return round2(items.reduce((sum, item) => sum + round2(item.price * item.quantity), 0));
}

function getOrderItemsCount(items: OrderItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

function groupBy<T>(items: T[], key: keyof T): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const groupId = String(item[key]);
    const collection = groups.get(groupId);
    if (collection) collection.push(item);
    else groups.set(groupId, [item]);
  }
  return groups;
}

/**
 * The cuadre range summary for ONE store — read-replica of
 * `OrderOfflineService.getActiveOrdersPriceBetweenDates` /
 * `getActiveOrdersProfitBetweenDates` / `getCategoryCartItemsViewBetweenDates`
 * (category `order` fallback MAX_VALUE), plus the cuadre's expense/credit
 * panels. Same KPI semantics as the view: Ganancias Bruta = Σ order profit,
 * Ganancias = Bruta − Gastos.
 */
export function computeStoreRangeSummary(
  storeId: string,
  dek: Uint8Array | null,
  rangeStart: Date,
  rangeEnd: Date,
  hasExpensesModule: boolean,
  hasCreditsModule: boolean,
): StoreRangeSummary {
  const activeOrders = readStoreActiveOrdersBetween(storeId, dek, rangeStart, rangeEnd);
  const salesTotal = activeOrders.reduce((sum, o) => sum + o.total, 0);
  const grossProfit = activeOrders.reduce(
    (sum, o) => sum + o.orderItems.reduce((s, item) => s + calculateOrderProfit(item).profit, 0),
    0,
  );

  const rawCategories = readStoreEntities<Record<string, unknown> & { id: string }>(
    'product-categories',
    storeId,
    dek,
  );
  const orderItems: OrderItem[] = activeOrders.flatMap((order) => order.orderItems);
  const categoryGroups = groupBy(orderItems, 'categoryId');
  const categories: CategoryCartItemsView[] = [];
  categoryGroups.forEach((categoryItems) => {
    const item = categoryItems[0];
    const productGroups = groupBy(categoryItems, 'productId');
    const productItems: ProductCartItemsView[] = [];
    productGroups.forEach((products) => {
      const product = products[0];
      productItems.push({
        name: product.name,
        order: product.order,
        total: getOrderItemsTotal(products),
        itemsCount: getOrderItemsCount(products),
        price: product.price,
      });
    });
    const storageCategory = rawCategories.find((c) => c.id === item.categoryId);
    categories.push({
      id: item.categoryId,
      name: item.categoryName,
      order: storageCategory ? Number(storageCategory.order) : Number.MAX_VALUE,
      total: getOrderItemsTotal(categoryItems),
      itemsCount: getOrderItemsCount(categoryItems),
      productItems,
    });
  });

  const salesCashTotal = activeOrders
    .filter((o) => o.paymentType === PaymentTypeEnum.Efectivo && !o.isCredit)
    .reduce((acc, o) => acc + o.total, 0);
  const salesCardTotal = activeOrders
    .filter((o) => o.paymentType === PaymentTypeEnum.Tarjeta && !o.isCredit)
    .reduce((acc, o) => acc + o.total, 0);

  const salesEntries: CurrencyAmount[] = activeOrders.map((o) => ({
    amount: o.total,
    currency: o.currency,
  }));
  const grossProfitEntries: CurrencyAmount[] = activeOrders.flatMap((o) =>
    o.orderItems.map((item) => ({
      amount: calculateOrderProfit(item).profit,
      currency: item.currency ?? o.currency,
    })),
  );
  const salesCashEntries: CurrencyAmount[] = activeOrders
    .filter((o) => o.paymentType === PaymentTypeEnum.Efectivo && !o.isCredit)
    .map((o) => ({ amount: o.total, currency: o.currency }));
  const salesCardEntries: CurrencyAmount[] = activeOrders
    .filter((o) => o.paymentType === PaymentTypeEnum.Tarjeta && !o.isCredit)
    .map((o) => ({ amount: o.total, currency: o.currency }));

  let expenses: Expense[] = [];
  let expensesTotal = 0;
  let expensesCashTotal = 0;
  if (hasExpensesModule) {
    expenses = readStoreActiveExpensesBetween(storeId, dek, rangeStart, rangeEnd);
    expensesTotal = expenses.reduce((acc, e) => acc + e.total, 0);
    expensesCashTotal = expenses
      .filter((e) => e.paymentType === PaymentTypeEnum.Efectivo)
      .reduce((acc, e) => acc + e.total, 0);
  }

  let saleCredits: SaleCredit[] = [];
  let paidSaleCredits: SaleCredit[] = [];
  let paidCreditsCashTotal = 0;
  if (hasCreditsModule) {
    saleCredits = readStoreUnpaidSaleCreditsBetween(storeId, dek, rangeStart, rangeEnd);
    paidSaleCredits = readStorePaidSaleCreditsBetween(storeId, dek, rangeStart, rangeEnd);
    paidCreditsCashTotal = paidSaleCredits
      .filter((c) => c.paidType === PaymentTypeEnum.Efectivo)
      .reduce((acc, c) => acc + c.total, 0);
  }

  const netProfit = grossProfit - expensesTotal;

  return {
    salesTotal,
    expensesTotal,
    grossProfit,
    netProfit,
    categories,
    expenses,
    saleCredits,
    paidSaleCredits,
    salesCashTotal,
    salesCardTotal,
    expensesCashTotal,
    paidCreditsCashTotal,
    salesEntries,
    grossProfitEntries,
    salesCashEntries,
    salesCardEntries,
  };
}

/** Sums per-store range summaries into the general (outside-panels) KPIs. */
export function sumRangeSummaries(summaries: StoreRangeSummary[]): {
  salesTotal: number;
  expensesTotal: number;
  grossProfit: number;
  netProfit: number;
} {
  return {
    salesTotal: round2(summaries.reduce((acc, s) => acc + s.salesTotal, 0)),
    expensesTotal: round2(summaries.reduce((acc, s) => acc + s.expensesTotal, 0)),
    grossProfit: round2(summaries.reduce((acc, s) => acc + s.grossProfit, 0)),
    netProfit: round2(summaries.reduce((acc, s) => acc + s.netProfit, 0)),
  };
}
