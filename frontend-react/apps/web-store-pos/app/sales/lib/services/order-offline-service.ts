import type { Order, OrderItem } from '@store-mgmt/domain';
import { OrderType, PaymentType } from '@store-mgmt/domain';
import type { CartItem } from '~/shared/lib/stores/cart-store';
import { BaseRepository } from '~/shared/lib/storage/base-repository';
import { SaleCreditOfflineService } from './sale-credit-offline-service';
import { InventoryOfflineService } from '~/inventory/lib/services/inventory-offline-service';

const repo = new BaseRepository<Order>('orders', ['date', 'createdDate', 'updatedDate']);

function generateId(): string {
  return crypto.randomUUID();
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export class OrderOfflineService {
  private readonly creditService: SaleCreditOfflineService;
  private readonly inventoryService: InventoryOfflineService;

  constructor(private readonly storeId: string) {
    this.creditService = new SaleCreditOfflineService(storeId);
    this.inventoryService = new InventoryOfflineService(storeId);
  }

  getAll(): Order[] {
    return Array.from(repo.getAll(this.storeId).values());
  }

  getById(id: string): Order | undefined {
    return repo.getById(this.storeId, id);
  }

  getByDateRange(from: Date, to: Date): Order[] {
    const start = startOfDay(from);
    const end = startOfDay(addDays(to, 1));
    return this.getAll().filter(
      (o) => o.isActive && o.date >= start && o.date < end,
    );
  }

  getActiveOrdersInDay(date: Date): Order[] {
    const dayStart = startOfDay(date);
    const dayEnd = startOfDay(addDays(date, 1));
    return this.getAll().filter(
      (o) => o.isActive && o.date >= dayStart && o.date < dayEnd,
    );
  }

  create(
    cartItems: CartItem[],
    paymentType: PaymentType,
    isCredit: boolean,
    clientName: string,
  ): Order {
    const now = new Date();
    const orderId = generateId();

    // Build orderItems with FIFO inventory deduction if needed
    const orderItems: OrderItem[] = cartItems.map((cartItem, index) => {
      const { product, quantity } = cartItem;
      let productCosts: import('@store-mgmt/domain').InventoryEntryCost[] = [];

      if (product.discountFromInvantory) {
        productCosts = this.inventoryService.getAvailableInventoryCosts(product.id, quantity);
      }

      return {
        productId: product.id,
        productName: product.name,
        categoryId: product.categoryId,
        categoryName: product.categoryName,
        name: product.name,
        quantity,
        price: product.price,
        productBusinessId: product.businessId ?? '',
        productCosts,
        order: index,
      };
    });

    const total = cartItems.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
    const itemsCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

    const order: Order = {
      id: orderId,
      orderItems,
      total,
      itemsCount,
      date: now,
      type: OrderType.Normal,
      paymentType,
      isCredit,
      description: isCredit ? clientName : '',
      isActive: true,
      createdDate: now,
      createdByName: '',
      updatedDate: now,
      updatedByName: '',
    };

    repo.upsert(this.storeId, order);

    if (isCredit) {
      this.creditService.createFromOrder(orderId, clientName, total);
    }

    return order;
  }

  update(id: string, paymentType: PaymentType): Order {
    const order = repo.getById(this.storeId, id);
    if (!order) throw new Error(`Order not found: ${id}`);
    const updated: Order = {
      ...order,
      paymentType,
      updatedDate: new Date(),
    };
    repo.upsert(this.storeId, updated);
    return updated;
  }

  deactivate(id: string): void {
    const order = repo.getById(this.storeId, id);
    if (!order) throw new Error(`Order not found: ${id}`);

    // Step 1: Mark order inactive
    const updated: Order = {
      ...order,
      isActive: false,
      updatedDate: new Date(),
    };
    repo.upsert(this.storeId, updated);

    // Step 2: Void associated credit if credit order
    if (order.isCredit) {
      this.creditService.voidByOrderId(id);
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
}
