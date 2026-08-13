import type { BaseResponseModel, Order, OrderItem } from '@store-mgmt/domain';
import { DataResult, OrderErrors, OrderType, PaymentType, Result, success } from '@store-mgmt/domain';
import type { CartItem } from '~/shared/lib/stores/cart-store';
import { StorageKeys } from '~/shared/lib/storage/storage-keys';
import { encryptEntity, decryptEntity } from '~/shared/lib/storage/entity-crypto';
import { readEntityOrThrow } from '~/shared/lib/storage/read-entity-or-throw';
import { SaleCreditOfflineService } from './sale-credit-offline-service';
import { InventoryOfflineService } from '~/inventory/lib/services/inventory-offline-service';
import { ExpenseOfflineService } from '~/expenses/lib/services/expense-offline-service';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';
import { ProductCategoryRepository } from '~/sales/lib/repositories/product-category-repository';
import { startOfDay, addDays } from '~/shared/lib/date-utils';
import type { CategoryCartItemsView, ProductCartItemsView } from '../category-cart-items-view';
import { getCurrentUserLogin } from '~/shared/lib/auth/current-user';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { hasInventoryModuleAvailable } from '~/shared/lib/auth/authorization-service';
import { calculateOrderProfit } from '~/inventory/lib/profit-calculator';

/**
 * TopProduct — view model for getTopProductsProfitInLastMonth/getTopProductsSaleQuantityInLastMonth.
 * Sync equivalent of Angular's presentation TopProduct model.
 */
export interface TopProduct {
  id: string;
  name: string;
  value: number;
}

/**
 * ChartData — mirrors Angular's presentation view model
 * (`presentation/_models/chart-data,model.ts:1-4`) returned by `getLastMonthSales`/
 * `getLastMonthSaleProfits`. Angular types both fields as `any`; React types them
 * concretely as the actual runtime shape those methods always produce.
 */
export interface ChartData {
  label: Date;
  value: number;
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

function getOrderItemsTotal(items: OrderItem[]): number {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

function getOrderItemsCount(items: OrderItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

function generateId(): string {
  return crypto.randomUUID();
}

/**
 * OrderOfflineService — persistence is inlined (no shared `BaseRepository<T>`; that base
 * class has no Angular correlate, playbook rule 12). Per-instance cache
 * (`orders`/`lastOrdersKey`), reloaded only when empty or the store key changes, auto-init
 * on empty read, PLAIN-ARRAY wire format — 1:1 port of `order-offline.service.ts:400-451`.
 * Revival on read is `date`-only (`reviveAndBackfillOrder`); `createdDate`/`updatedDate`
 * are left as raw strings, matching Angular exactly.
 */
export class OrderOfflineService {
  private readonly creditService: SaleCreditOfflineService;
  private readonly inventoryService: InventoryOfflineService;
  private readonly expenseService: ExpenseOfflineService;

  private orders: Order[] | null = null;
  private lastOrdersKey: string | undefined;

  constructor(private readonly storeId: string) {
    this.creditService = new SaleCreditOfflineService(storeId);
    this.inventoryService = new InventoryOfflineService(
      storeId,
      new ProductRepository(storeId, new ProductCategoryRepository(storeId)),
    );
    // Angular parity: OrderOfflineService injects ExpenseOfflineService directly
    // (order-offline.service.ts:24,38) — used by getLastMonthSaleProfits' expense-netting.
    this.expenseService = new ExpenseOfflineService(storeId);
  }

  /** 1:1 port of Angular `getStorageOrders` (order-offline.service.ts:400-405). */
  getStorageOrders(): Order[] {
    if (!this.orders || this.orders.length === 0 || this.getCurrentStorageKey() !== this.lastOrdersKey) {
      this.orders = this.getOrdersFromLocalStorage();
    }
    return this.orders;
  }

  /** 1:1 port of Angular `getOrderById` (order-offline.service.ts:67-69). */
  getOrderById(id: string): Order | undefined {
    return this.getStorageOrders().find((o) => o.id === id);
  }

  /**
   * 1:1 port of Angular `getActiveOrdersInDay` (order-offline.service.ts:299-303) — IGNORES
   * the passed `date` param and always uses today's day boundaries. The param is kept in
   * the signature for call-site compatibility, mirroring Angular's own unused param.
   */
  getActiveOrdersInDay(_date: Date): Order[] {
    const dayStart = startOfDay(new Date());
    const dayEnd = addDays(dayStart, 1);
    return this.getStorageOrders().filter(
      (o) => o.isActive && o.date >= dayStart && o.date < dayEnd,
    );
  }

  /**
   * 1:1 port of Angular `getActiveTodayOrdersObservable` (order-offline.service.ts:286-288).
   * No live tsx caller yet (additive).
   */
  getActiveTodayOrdersObservable(): Promise<BaseResponseModel<Order[]>> {
    return Promise.resolve(success(this.getActiveOrdersInDay(new Date())));
  }

  /**
   * BUG FIX (angular-bugs-policy): Angular's `getOrdersInDay(date)` ignores the passed
   * `date` param entirely and always uses `new Date()`. React honors it — the whole
   * point of the parameter. Unlike `getActiveOrdersInDay`, this returns ALL orders in
   * the day regardless of `isActive` (1:1 port of Angular's own filter, which has no
   * isActive check).
   */
  getOrdersInDay(date: Date): Order[] {
    const dayStart = startOfDay(date);
    const dayEnd = startOfDay(addDays(date, 1));
    return this.getStorageOrders()
      .filter((o) => o.date >= dayStart && o.date < dayEnd)
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  /**
   * ADR-5: financial helpers use RAW date boundaries (pre-snapped by the caller) rather
   * than re-snapping to day boundaries internally (which would double-snap). 1:1 port of
   * Angular's private `getActiveOrdersBetweenDates`.
   */
  private activeOrdersBetween(start: Date, end: Date): Order[] {
    return this.getStorageOrders()
      .filter((o) => o.isActive && o.date >= start && o.date < end)
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  getActiveOrdersPriceBetweenDates(start: Date, end: Date): number {
    return this.activeOrdersBetween(start, end).reduce((sum, o) => sum + o.total, 0);
  }

  getActiveOrdersPriceToday(): number {
    const start = startOfDay(new Date());
    const end = addDays(start, 1);
    return this.getActiveOrdersPriceBetweenDates(start, end);
  }

  getActiveOrdersPriceYesterday(): number {
    const start = startOfDay(addDays(new Date(), -1));
    const end = startOfDay(new Date());
    return this.getActiveOrdersPriceBetweenDates(start, end);
  }

  getActiveOrdersProfitBetweenDates(start: Date, end: Date): number {
    let profit = 0;
    for (const order of this.activeOrdersBetween(start, end)) {
      for (const item of order.orderItems) {
        profit += calculateOrderProfit(item).profit;
      }
    }
    return profit;
  }

  getActiveOrdersProfitToday(): number {
    const start = startOfDay(new Date());
    const end = addDays(start, 1);
    return this.getActiveOrdersProfitBetweenDates(start, end);
  }

  getActiveOrdersProfitYesterday(): number {
    const start = startOfDay(addDays(new Date(), -1));
    const end = startOfDay(new Date());
    return this.getActiveOrdersProfitBetweenDates(start, end);
  }

  /**
   * 1:1 port of Angular `getLastMonthSales` (order-offline.service.ts:229-244) — rule 12
   * relocation (this logic used to live in an invented standalone
   * `StatisticsAggregationService`; Angular keeps it ON `OrderOfflineService`, so it lives
   * here too). NO parameters — always keyed off `new Date()` at call time, matching Angular
   * exactly. Returns 30 `ChartData` entries (oldest → newest, last entry = today).
   *
   * Date-window divergence (angular-bugs-policy, rule 8 — CONSCIOUS, approved, NOT
   * replicated): Angular recomputes `startDate = startOfDay(today)` INSIDE the loop on
   * every iteration instead of per-bucket, so `startDate` never actually varies — every
   * bucket but the last ends up querying an empty/inverted [today, earlierDay) range, and
   * only the i=0 ("today") bucket ever resolves real data. That is a real Angular bug; it
   * is confirmed and intentionally NOT replicated here. React keeps the already-correct
   * per-bucket window: each of the 30 buckets queries its OWN [dayStart, dayStart+1) range.
   */
  getLastMonthSales(): ChartData[] {
    const today = new Date();
    const data: ChartData[] = [];
    for (let i = 29; i >= 0; i--) {
      const label = addDays(today, -i);
      const dayStart = startOfDay(label);
      const dayEnd = addDays(dayStart, 1);
      data.push({
        label,
        value: this.getActiveOrdersPriceBetweenDates(dayStart, dayEnd),
      });
    }
    return data;
  }

  /**
   * 1:1 port of Angular `getLastMonthSaleProfits` (order-offline.service.ts:211-227) — same
   * rule-12 relocation as `getLastMonthSales`. NO parameters. Nets out each bucket's active
   * expenses: `value = orderProfit(day) - expenseService.getActiveExpensesPriceBetweenDates
   * (dayStart, dayStart+1)`.
   *
   * Same date-window divergence as `getLastMonthSales` above (angular-bugs-policy, rule 8 —
   * CONSCIOUS, approved, NOT replicated): Angular's own `getLastMonthSaleProfits` has the
   * identical `startDate = startOfDay(today)` recomputed-every-iteration bug, so React keeps
   * the fixed per-bucket [dayStart, dayStart+1) window and only adds the expense
   * subtraction on top.
   */
  getLastMonthSaleProfits(): ChartData[] {
    const today = new Date();
    const data: ChartData[] = [];
    for (let i = 29; i >= 0; i--) {
      const label = addDays(today, -i);
      const dayStart = startOfDay(label);
      const dayEnd = addDays(dayStart, 1);
      const orderProfit = this.getActiveOrdersProfitBetweenDates(dayStart, dayEnd);
      const dayExpenses = this.expenseService.getActiveExpensesPriceBetweenDates(dayStart, dayEnd);
      data.push({
        label,
        value: orderProfit - dayExpenses,
      });
    }
    return data;
  }

  /**
   * BUG FIX (angular-bugs-policy): Angular's private `getTopProductsInLastMonth(calculateProfit, top)`
   * takes a `top` param but its body hardcodes `.slice(0, 5)`, ignoring it — both public
   * callers (`getTopProductsProfitInLastMonth`/`getTopProductsSaleQuantityInLastMonth`) are
   * therefore always capped at 5 regardless of what they pass. React honors `top` (default 5).
   * Window: rolling last 29 days from `now` (RAW, not day-snapped — 1:1 port), active orders only.
   */
  private getTopProductsInLastMonth(calculateProfit: boolean, top: number): TopProduct[] {
    const now = new Date();
    const lastMonth = addDays(now, -29);
    const monthOrders = this.getStorageOrders().filter(
      (o) => o.isActive && o.date >= lastMonth && o.date < now,
    );

    const topProductsMap = new Map<string, TopProduct>();
    for (const order of monthOrders) {
      for (const item of order.orderItems) {
        let entry = topProductsMap.get(item.productId);
        if (!entry) {
          entry = { id: item.productId, name: item.productName, value: 0 };
          topProductsMap.set(item.productId, entry);
        }
        entry.value += calculateProfit ? calculateOrderProfit(item).profit : item.quantity;
      }
    }

    return Array.from(topProductsMap.values())
      .sort((p1, p2) => p2.value - p1.value)
      .slice(0, top);
  }

  getTopProductsProfitInLastMonth(top: number = 5): TopProduct[] {
    return this.getTopProductsInLastMonth(true, top);
  }

  getTopProductsSaleQuantityInLastMonth(top: number = 5): TopProduct[] {
    return this.getTopProductsInLastMonth(false, top);
  }

  /**
   * 1:1 port of Angular `filterOrdersObservable` (order-offline.service.ts:290-297),
   * C-shape (async, `Promise<BaseResponseModel<Order[]>>`, never rejects). Renamed from
   * `filterOrders`. `isCredit` is a tri-state: -1 = any, 1 = credit only, 0 = non-credit
   * only. `paymentType`/`start`/`end` are optional and unbounded when falsy — operates
   * over active orders only, RAW date comparisons (no internal day-snapping).
   */
  filterOrdersObservable(
    isCredit: number,
    paymentType?: PaymentType,
    start?: Date,
    end?: Date,
  ): Promise<BaseResponseModel<Order[]>> {
    const filtered = this.getStorageOrders()
      .filter(
        (o) =>
          o.isActive &&
          (isCredit === -1 || (isCredit === 1 && o.isCredit) || (isCredit === 0 && !o.isCredit)) &&
          (!paymentType || paymentType === o.paymentType) &&
          (!start || o.date >= start) &&
          (!end || o.date < end),
      )
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    return Promise.resolve(success(filtered));
  }

  /**
   * 1:1 port of Angular `getCategoryCartItemsView` (order-offline.service.ts:76-109),
   * B-shape (sync, `BaseResponseModel<CategoryCartItemsView[]>` envelope, no Promise) —
   * aggregates today's active order items by category, then by product, for the "Cuadre
   * del día" (Today Stats) view. Category `order` is resolved from
   * `ProductCategoryRepository` (Angular parity — `OrderOfflineService` injects
   * `ProductCategoryRepository` directly, `order-offline.service.ts:38,79`, never the
   * offline service), falling back to `Number.MAX_VALUE` when not found (Angular's exact
   * fallback, so ghost/deleted categories sort last if ever rendered in `order`).
   * NOTE: matches Angular's quirk of NOT explicitly sorting the returned array by `order`
   * — iteration order follows Map insertion order (first-seen category in orderItems).
   */
  getCategoryCartItemsView(date: Date): BaseResponseModel<CategoryCartItemsView[]> {
    const categoryRepository = new ProductCategoryRepository(this.storeId);
    const storageCategories = categoryRepository.getProductCategories();
    const orderItems: OrderItem[] = this.getActiveOrdersInDay(date).flatMap(
      (order) => order.orderItems,
    );
    const categoryGroups = groupBy(orderItems, 'categoryId');

    const categoryItemsView: CategoryCartItemsView[] = [];
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
      const storageCategory = storageCategories.find((c) => c.id === item.categoryId);
      categoryItemsView.push({
        id: item.categoryId,
        name: item.categoryName,
        order: storageCategory ? storageCategory.order : Number.MAX_VALUE,
        total: getOrderItemsTotal(categoryItems),
        itemsCount: getOrderItemsCount(categoryItems),
        productItems,
      });
    });

    return success(categoryItemsView);
  }

  /**
   * 1:1 port of Angular `getCategoryCartItemsViewObservable` (order-offline.service.ts:71-74).
   * No live tsx caller yet (additive). Unwraps `.data` off the now-enveloped sync call —
   * the sync call already returns a `BaseResponseModel`, so the Observable variant reuses
   * its `.data` as the payload rather than double-wrapping the whole envelope.
   */
  getCategoryCartItemsViewObservable(date: Date): Promise<BaseResponseModel<CategoryCartItemsView[]>> {
    // getCategoryCartItemsView is a sync local-storage read that always returns success();
    // this guard exists for the type only.
    const response = this.getCategoryCartItemsView(date);
    return Promise.resolve(response);
  }

  /**
   * 1:1 port of Angular `createOrder` (order-offline.service.ts:42-65), C-shape (async,
   * envelope, never rejects). Param order matches Angular exactly: `(cartItems, type,
   * isCredit, paymentType, details, client)`. The invented `hasInventoryModule` param is
   * REMOVED — the inventory-deduction gate is now sourced internally via
   * `useAuthStore.getState().user` + `hasInventoryModuleAvailable(user)`, mirroring
   * Angular's injected `AuthorizationService.hasInventoryModuleAvailable()`
   * (order-offline.service.ts:360). `details`/`client` keep a light TS-only optionality
   * (`details?`, `client = ''`) so the pre-existing details-fallback description logic
   * (`details || (isCredit ? client : '')`) — itself unchanged by this rename — still
   * compiles positionally; every value ever supplied at these positions is identical to
   * what Angular's own callers always pass.
   */
  createOrder(
    cartItems: CartItem[],
    type: OrderType,
    isCredit: boolean,
    paymentType: PaymentType,
    details?: string,
    client: string = '',
  ): Promise<BaseResponseModel<Order>> {
    const now = new Date();
    const orderId = generateId();

    const user = useAuthStore.getState().user;
    const hasInventoryModule = user ? hasInventoryModuleAvailable(user) : false;

    // Build orderItems with FIFO inventory deduction if needed
    const orderItems: OrderItem[] = cartItems.map((cartItem) => {
      const { product, quantity } = cartItem;
      let productCosts: import('@store-mgmt/domain').InventoryEntryCost[] = [];

      // 1:1 port of Angular's OrderOfflineService.createOrderItems gate
      // (order-offline.service.ts:360): `product.discountFromInvantory &&
      // authorizationService.hasInventoryModuleAvailable()`. getAvailableInventoryCosts
      // also receives the eligibility context so it self-defends against
      // isActive/availableToSale changes since add-to-cart time, mirroring Angular's
      // internal hasAvailableProductToSale chain.
      if (product.discountFromInvantory && hasInventoryModule) {
        productCosts = this.inventoryService.getAvailableInventoryCosts(product.id, quantity, {
          product,
          hasInventoryModule,
        });
      }

      return {
        productId: product.id,
        productName: product.name,
        categoryId: product.categoryId,
        categoryName: product.categoryName,
        name: product.name,
        quantity,
        price: cartItem.price ?? product.price,
        productBusinessId: product.businessId ?? '',
        productCosts,
        // Angular parity (order-offline.service.ts:377): stamps OrderItem.order from the
        // Product's own catalog display-order attribute, NOT the cart array index.
        order: product.order,
      };
    });

    const total = cartItems.reduce(
      (sum, item) => sum + (item.price ?? item.product.price) * item.quantity,
      0,
    );
    const itemsCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

    const order: Order = {
      id: orderId,
      orderItems,
      total,
      itemsCount,
      date: now,
      type,
      paymentType,
      isCredit,
      description: details || (isCredit ? client : ''),
      isActive: true,
      createdDate: now,
      createdByName: getCurrentUserLogin(),
      updatedDate: undefined,
      updatedByName: undefined,
    };

    // 1:1 port of Angular `createOrder` (order-offline.service.ts:60-61): push onto the
    // cached array, then persist the whole array.
    this.getStorageOrders().push(order);
    this.setOrdersLocalStorage(this.orders!);

    if (isCredit) {
      // Angular always passes '' for note (order-offline.service.ts:63); the returned
      // DataResult is ignored, mirroring Angular's own fire-and-forget call.
      this.creditService.createSaleCredit(orderId, client, total, '');
    }

    return Promise.resolve(success(order));
  }

  /**
   * 1:1 port of Angular `updateTodayOrder` (order-offline.service.ts:342-352), D-shape
   * (sync, `DataResult<Order>`, never throws). Renamed from `update`.
   */
  updateTodayOrder(id: string, paymentType: PaymentType): DataResult<Order> {
    const order = this.getOrderById(id);
    if (!order) return new DataResult<Order>(undefined, false, [OrderErrors.NotExists]);
    order.paymentType = paymentType;
    order.updatedDate = new Date();
    order.updatedByName = getCurrentUserLogin();
    this.setOrdersLocalStorage(this.orders!);
    return new DataResult<Order>(order, true, []);
  }

  /**
   * Private port of Angular's `updateOrderActive` (order-offline.service.ts:330-340) —
   * shared flag-flip helper backing both `activateOrder` and the first step of
   * `deactivateOrder`, mirroring Angular's own factoring (neither method duplicates the
   * not-found/stamp logic).
   */
  private updateOrderActive(id: string, isActive: boolean): Result {
    const order = this.getOrderById(id);
    if (!order) return Result.Failure([OrderErrors.NotExists]);
    order.isActive = isActive;
    order.updatedDate = new Date();
    order.updatedByName = getCurrentUserLogin();
    this.setOrdersLocalStorage(this.orders!);
    return Result.Success();
  }

  /**
   * 1:1 port of Angular's `activateOrder` (`updateOrderActive(id, true)`) — flag-only,
   * no credit/inventory cascade (unlike deactivateOrder). D-shape: `Result`, never throws.
   */
  activateOrder(id: string): Result {
    return this.updateOrderActive(id, true);
  }

  /**
   * 1:1 port of Angular `deactivateOrder` (order-offline.service.ts:317-328), D-shape
   * (sync, `Result`, never throws). Cascade-guard restored: `updateOrderActive` failure
   * short-circuits to `Result.Failure([])`; `creditService.deactivateSaleCreditByOrderId`
   * is called UNCONDITIONALLY (Angular does NOT gate this on `order.isCredit` — read
   * :322-324 — no-op-succeeds when the order has no credit, per
   * `SaleCreditOfflineService.deactivateSaleCreditByOrderId`'s own contract) and its
   * failure ALSO short-circuits to `Result.Failure([])` BEFORE any inventory restock;
   * only on cascade success does restock run, returning THAT call's `Result` directly
   * (not a blanket `Success()`).
   */
  deactivateOrder(id: string): Result {
    const flagResult = this.updateOrderActive(id, false);
    if (!flagResult.succeeded) return Result.Failure([]);

    const creditResult = this.creditService.deactivateSaleCreditByOrderId(id);
    if (!creditResult.succeeded) return Result.Failure([]);

    const order = this.getOrderById(id)!;
    return this.inventoryService.increaseQuantitiesByOrderItems(order.orderItems);
  }

  /**
   * order-sync-import-parity: 1:1 port of Angular's `addImportedOrder`
   * (order-offline.service.ts:430-436) — appends the imported order, reviving `date` to a
   * `Date` instance. Always returns `Result.Success()`.
   */
  addImportedOrder(order: Order): Result {
    const imported: Order = { ...order, date: new Date(order.date) };
    this.getStorageOrders().push(imported);
    this.setOrdersLocalStorage(this.orders!);
    return Result.Success();
  }

  /**
   * order-sync-import-parity: 1:1 port of Angular's `updateImportedOrder`
   * (order-offline.service.ts:438-449) — NARROW 4-field merge on the existing record by
   * id: overwrites ONLY `date` (revived)/`isActive`/`updatedDate`/`updatedByName`; leaves
   * `total`/`orderItems`/`isCredit`/`paymentType`/`description` and every other field
   * untouched. No-op when the id is absent. Always returns `Result.Success()`.
   */
  updateImportedOrder(importedOrder: Order): Result {
    const order = this.getStorageOrders().find((o) => o.id === importedOrder.id);
    if (order) {
      order.date = new Date(importedOrder.date);
      order.isActive = importedOrder.isActive;
      order.updatedDate = importedOrder.updatedDate;
      order.updatedByName = importedOrder.updatedByName;
      this.setOrdersLocalStorage(this.orders!);
    }
    return Result.Success();
  }

  /**
   * 1:1 port of Angular `getOrdersJson` (order-offline.service.ts:416-418) — falsy-check
   * fallback (`||`), NOT nullish (`??`): an empty-string stored value also falls back to
   * `"[]"`, matching Angular exactly. At-rest encryption seam: decrypted immediately at
   * the `getItem` boundary, BEFORE the `||` fallback.
   */
  getOrdersJson(): string {
    return decryptEntity(localStorage.getItem(this.getStorageKey())) || '[]';
  }

  /**
   * Private port of Angular `setOrdersLocalStorage` (order-offline.service.ts:420-423) —
   * plain-array write. At-rest encryption seam: encrypted immediately after
   * `JSON.stringify`, before `setItem`.
   */
  private setOrdersLocalStorage(orders: Order[]): void {
    localStorage.setItem(this.getStorageKey(), encryptEntity(JSON.stringify(orders)));
  }

  /** Private port of Angular `getStorageKey` (order-offline.service.ts:407-410) — records the last-used key. */
  private getStorageKey(): string {
    this.lastOrdersKey = this.getCurrentStorageKey();
    return this.lastOrdersKey;
  }

  /** Private port of Angular `getCurrentStorageKey` (order-offline.service.ts:412-414). */
  private getCurrentStorageKey(): string {
    return StorageKeys.entityKey('orders', this.storeId);
  }

  /**
   * Private port of Angular `getOrdersFromLocalStorage` (order-offline.service.ts:451-470) —
   * on a genuinely empty store (absent key, or an empty-string value), auto-initializes by
   * writing an empty array before returning it — this half is real Angular parity. An
   * unreadable store (corrupt/unparsable JSON, or ciphertext with no data key in memory)
   * throws instead and never writes (design D4). In the same per-order mapping pass: revives
   * ONLY `date` to a `Date` instance (Angular revives no other field here) AND backfills
   * `isCredit=false`/`paymentType=Efectivo` for legacy orders missing those fields
   * (falsy-check semantics, mirroring Angular's `!order.isCredit`/`!order.paymentType`, not
   * an is-undefined check).
   */
  private getOrdersFromLocalStorage(): Order[] {
    // design D4: an unreadable store propagates and is never written over. The
    // auto-init below survives only for its honest case — no stored value at
    // all, i.e. a genuinely new store.
    const stored = readEntityOrThrow(this.getStorageKey(), (json) =>
      json ? (JSON.parse(json) as Order[]).map((order) => this.reviveAndBackfillOrder(order)) : null,
    );
    if (stored) return stored;

    this.setOrdersLocalStorage([]);
    return [];
  }

  private reviveAndBackfillOrder(order: Order): Order {
    const revived = { ...order } as Record<string, unknown>;
    if (typeof revived.date === 'string') revived.date = new Date(revived.date);
    if (!revived.isCredit) revived.isCredit = false;
    if (!revived.paymentType) revived.paymentType = PaymentType.Efectivo;
    return revived as unknown as Order;
  }
}
