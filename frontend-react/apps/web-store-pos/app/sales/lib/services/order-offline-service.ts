import type { BaseResponseModel, Order, OrderItem } from '@store-mgmt/domain';
import { OrderType, PaymentType, Result, success } from '@store-mgmt/domain';
import type { CartItem } from '~/shared/lib/stores/cart-store';
import { StorageKeys } from '~/shared/lib/storage/storage-keys';
import { SaleCreditOfflineService } from './sale-credit-offline-service';
import { InventoryOfflineService } from '~/inventory/lib/services/inventory-offline-service';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';
import { ProductCategoryRepository } from '~/sales/lib/repositories/product-category-repository';
import { startOfDay, addDays } from '~/shared/lib/date-utils';
import type { CategoryCartItemsView, ProductCartItemsView } from '../category-cart-items-view';
import { getCurrentUserLogin } from '~/shared/lib/auth/current-user';
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
 * Revival fields (`date`/`createdDate`/`updatedDate`) are UNCHANGED from current React
 * behavior (Decision Gate — pending fix-vs-replicate call, NOT resolved here).
 */
export class OrderOfflineService {
  private readonly creditService: SaleCreditOfflineService;
  private readonly inventoryService: InventoryOfflineService;

  private orders: Order[] | null = null;
  private lastOrdersKey: string | undefined;

  constructor(private readonly storeId: string) {
    this.creditService = new SaleCreditOfflineService(storeId);
    this.inventoryService = new InventoryOfflineService(
      storeId,
      new ProductRepository(storeId, new ProductCategoryRepository(storeId)),
    );
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

  getByDateRange(from: Date, to: Date): Order[] {
    const start = startOfDay(from);
    const end = startOfDay(addDays(to, 1));
    return this.getStorageOrders().filter(
      (o) => o.isActive && o.date >= start && o.date < end,
    );
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
    return this.getStorageOrders().filter((o) => o.date >= dayStart && o.date < dayEnd);
  }

  /**
   * ADR-5: financial helpers use RAW date boundaries (pre-snapped by the caller), NOT
   * the day-snapping `getByDateRange` (which would double-snap). 1:1 port of Angular's
   * private `getActiveOrdersBetweenDates`.
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
   * Sync replacement of Angular's `filterOrdersObservable`. `isCredit` is a tri-state:
   * -1 = any, 1 = credit only, 0 = non-credit only. `paymentType`/`start`/`end` are
   * optional and unbounded when falsy — 1:1 port, operates over active orders only,
   * RAW date comparisons (no internal day-snapping).
   */
  filterOrders(
    isCredit: number,
    paymentType?: PaymentType,
    start?: Date,
    end?: Date,
  ): Order[] {
    return this.getStorageOrders()
      .filter(
        (o) =>
          o.isActive &&
          (isCredit === -1 || (isCredit === 1 && o.isCredit) || (isCredit === 0 && !o.isCredit)) &&
          (!paymentType || paymentType === o.paymentType) &&
          (!start || o.date >= start) &&
          (!end || o.date < end),
      )
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  /**
   * 1:1 port of Angular's `OrderOfflineService.getCategoryCartItemsView` — aggregates
   * today's active order items by category, then by product, for the "Cuadre del día"
   * (Today Stats) view. Category `order` is resolved from `ProductCategoryRepository`
   * (Angular parity — `OrderOfflineService` injects `ProductCategoryRepository` directly,
   * `order-offline.service.ts:38,79`, never the offline service), falling back to
   * `Number.MAX_VALUE` when not found (Angular's exact fallback, so ghost/deleted categories
   * sort last if ever rendered in `order`).
   * NOTE: matches Angular's quirk of NOT explicitly sorting the returned array by `order`
   * — iteration order follows Map insertion order (first-seen category in orderItems).
   */
  getCategoryCartItemsView(date: Date): CategoryCartItemsView[] {
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

    return categoryItemsView;
  }

  /**
   * 1:1 port of Angular `getCategoryCartItemsViewObservable` (order-offline.service.ts:71-74).
   * No live tsx caller yet (additive). NOTE: wraps the WU1-current bare-array return of
   * `getCategoryCartItemsView` — WU4 changes that method's own return type to the B-shape
   * envelope, at which point this wrapper must unwrap `.data` instead (tracked in WU4).
   */
  getCategoryCartItemsViewObservable(date: Date): Promise<BaseResponseModel<CategoryCartItemsView[]>> {
    return Promise.resolve(success(this.getCategoryCartItemsView(date)));
  }

  create(
    cartItems: CartItem[],
    paymentType: PaymentType,
    isCredit: boolean,
    clientName: string,
    orderType: OrderType = OrderType.Normal,
    // Defaults to true so the many pre-existing tests that don't exercise the
    // module-disabled path are unaffected; the one real caller (CartShell.handleCreateOrder)
    // always passes the actual authorizationService.hasInventoryModuleAvailable() value.
    hasInventoryModule: boolean = true,
    // Angular parity: createOrder's `details` param. Takes priority over the isCredit/
    // clientName fallback when provided; existing callers that omit it are unaffected.
    details?: string,
  ): Order {
    const now = new Date();
    const orderId = generateId();

    // Build orderItems with FIFO inventory deduction if needed
    const orderItems: OrderItem[] = cartItems.map((cartItem, index) => {
      const { product, quantity } = cartItem;
      let productCosts: import('@store-mgmt/domain').InventoryEntryCost[] = [];

      // 1:1 port of Angular's OrderOfflineService.createOrderItems gate
      // (order-offline.service.ts:360): `product.discountFromInvantory &&
      // authorizationService.hasInventoryModuleAvailable()`. Previously this only checked
      // discountFromInvantory, so a product left with discountFromInvantory=true after the
      // store's inventory module was disabled would still silently deduct inventory — fixed
      // here to match Angular exactly (L4 map diff-matrix #6 / prioritized-list item #7).
      // getAvailableInventoryCosts also receives the eligibility context so it self-defends
      // against isActive/availableToSale changes since add-to-cart time, mirroring Angular's
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
        order: index,
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
      type: orderType,
      paymentType,
      isCredit,
      description: details || (isCredit ? clientName : ''),
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
      this.creditService.createSaleCredit(orderId, clientName, total, '');
    }

    return order;
  }

  update(id: string, paymentType: PaymentType): Order {
    const order = this.getOrderById(id);
    if (!order) throw new Error(`Order not found: ${id}`);
    order.paymentType = paymentType;
    order.updatedDate = new Date();
    order.updatedByName = getCurrentUserLogin();
    this.setOrdersLocalStorage(this.orders!);
    return order;
  }

  /**
   * 1:1 port of Angular's `activateOrder` (`updateOrderActive(id, true)`) — flag-only,
   * no credit/inventory cascade (unlike deactivate). Return-type contract: void, throws
   * on not-found (Angular's Result-command collapses to this per design ADR-1).
   */
  activateOrder(id: string): void {
    const order = this.getOrderById(id);
    if (!order) throw new Error(`Order not found: ${id}`);
    order.isActive = true;
    order.updatedDate = new Date();
    order.updatedByName = getCurrentUserLogin();
    this.setOrdersLocalStorage(this.orders!);
  }

  deactivate(id: string): void {
    const order = this.getOrderById(id);
    if (!order) throw new Error(`Order not found: ${id}`);

    // Step 1: Mark order inactive
    order.isActive = false;
    order.updatedDate = new Date();
    order.updatedByName = getCurrentUserLogin();
    this.setOrdersLocalStorage(this.orders!);

    // Step 2: Void associated credit if credit order. Angular's own deactivateOrder DOES
    // check this Result (order-offline.service.ts:317-324), but wiring that check into
    // Order's own deactivate() belongs to the Order slice (design ADR-4 dependency
    // order) — this slice only renames the SaleCredit-side method, keeping Order's
    // current fire-and-forget call pattern (flagged mismatch #6).
    if (order.isCredit) {
      this.creditService.deactivateSaleCreditByOrderId(id);
    }

    // Step 3: Restore inventory entries
    // Normalizes cost.id ?? cost.inventoryId for Angular-origin data (Decision 2)
    const normalizedItems = order.orderItems.map((oi) => ({
      ...oi,
      productCosts: oi.productCosts.map((cost) => ({
        ...cost,
        id: cost.id ?? (cost as unknown as { inventoryId: string }).inventoryId,
      })),
    }));
    this.inventoryService.increaseQuantitiesByOrderItems(normalizedItems);
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

  /** 1:1 port of Angular `getOrdersJson` (order-offline.service.ts:416-418). */
  getOrdersJson(): string {
    return localStorage.getItem(this.getStorageKey()) ?? '[]';
  }

  /** Private port of Angular `setOrdersLocalStorage` (order-offline.service.ts:420-423) — plain-array write. */
  private setOrdersLocalStorage(orders: Order[]): void {
    localStorage.setItem(this.getStorageKey(), JSON.stringify(orders));
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
   * on empty/missing/unparsable storage, auto-initializes by writing an empty array before
   * returning it. In the same per-order mapping pass: revives ONLY `date` to a `Date`
   * instance (Angular revives no other field here) AND backfills `isCredit=false`/
   * `paymentType=Efectivo` for legacy orders missing those fields (falsy-check semantics,
   * mirroring Angular's `!order.isCredit`/`!order.paymentType`, not an is-undefined check).
   */
  private getOrdersFromLocalStorage(): Order[] {
    try {
      const ordersJson = localStorage.getItem(this.getStorageKey());
      if (ordersJson) {
        const orders = JSON.parse(ordersJson) as Order[];
        return orders.map((order) => this.reviveAndBackfillOrder(order));
      }
    } catch {
      // ignore — fall through to auto-init
    }
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
