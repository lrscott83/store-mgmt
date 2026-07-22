import type { BaseResponseModel, InventoryEntry, InventoryEntryView, Order, Product } from '@store-mgmt/domain';
import type { InventoryCategoryView } from '~/inventory/lib/services/inventory-offline-service';
import type { InventoryTodaySaleRow } from './inventory-today-sale-pdf';

/**
 * Narrow dependency slices — only the methods `generateProductRows` actually calls.
 * Kept structurally compatible with `ProductRepository`, `OrderOfflineService`, and
 * `InventoryOfflineService` so production call sites can pass the real service
 * instances directly, while tests can pass minimal fakes.
 */
export interface GenerateProductRowsProductService {
  getAvailableProducts(): Product[];
}

export interface GenerateProductRowsOrderService {
  getActiveOrdersInDay(date: Date): Order[];
}

export interface GenerateProductRowsInventoryService {
  getInventoryEntriesInDay(date: Date): BaseResponseModel<InventoryEntryView[]>;
  getInventoryCategoriesView(): BaseResponseModel<InventoryCategoryView[]>;
  getProductInventoriesByProductId(productId: string): InventoryEntry[];
}

/**
 * 1:1 port of Angular's `InventoryTodaySaleComponent.generateProductRows()`
 * (frontend/src/app/presentation/reports/inventory-today-sale/inventory-today-sale.component.ts:176-226).
 *
 * Same per-product aggregation, same column order/values (13-col
 * `InventoryTodaySaleRow`, `unit` hardcoded literal `'U'`) — only the shape differs:
 * Angular returns a raw `any[]` tuple already formatted for the PDF table body; here
 * we return typed `InventoryTodaySaleRow[]` (numbers, not `toFixed` strings — matching
 * the interface documented on `inventory-today-sale-pdf.ts`), with formatting applied
 * later at the PDF edge (`toRowValues`).
 *
 * Constructor param order (productService, orderService, inventoryService) mirrors
 * Angular's DI order for readability/diffability against the source.
 */
export function generateProductRows(
  productService: GenerateProductRowsProductService,
  orderService: GenerateProductRowsOrderService,
  inventoryService: GenerateProductRowsInventoryService,
  today: Date = new Date(),
): InventoryTodaySaleRow[] {
  const products = productService.getAvailableProducts();
  const todayOrders = orderService.getActiveOrdersInDay(today);
  const todayEntries = inventoryService.getInventoryEntriesInDay(today);
  const inventoryCategories = inventoryService.getInventoryCategoriesView();
  const inventoryProducts = inventoryCategories.succeeded
    ? inventoryCategories.data.flatMap((c) => c.products)
    : [];

  return products.map((prod) => {
    const orderItems = todayOrders.flatMap((o) => o.orderItems).filter((oi) => oi.productId === prod.id);
    const productTodayEntries = todayEntries.succeeded
      ? todayEntries.data.filter((e) => e.productId === prod.id)
      : [];
    const productAvailableEntries: InventoryEntry[] = inventoryService
      .getProductInventoriesByProductId(prod.id)
      .filter((e) => e.available && e.available > 0);
    const availableProduct = inventoryProducts.find((p) => p.productId === prod.id);
    const available = availableProduct?.totalAvailable ?? 0;
    const entryQuantity = productTodayEntries.reduce((total, e) => total + e.quantity, 0);
    const vendido = orderItems.reduce((total, oi) => total + oi.quantity, 0);
    const disponible = available + vendido;
    const inicio = available + vendido - entryQuantity;
    const precioVenta =
      orderItems.length > 0 ? orderItems.reduce((total, oi) => total + oi.price, 0) / orderItems.length : 0;
    const importeVenta = vendido * precioVenta;
    let costoUnitario = 0;
    if (productAvailableEntries.length > 0) {
      costoUnitario =
        productAvailableEntries.reduce((total, e) => total + e.costPrice * e.quantity, 0) /
        productAvailableEntries.reduce((total, e) => total + e.quantity, 0);
    }
    const costoTotal = vendido * costoUnitario;
    const cpVenta = importeVenta > 0 ? costoTotal / importeVenta : 0;
    const final = disponible - vendido;
    const importeFinal = final * costoUnitario;

    return {
      productId: prod.id,
      productName: prod.name,
      unit: 'U',
      inicio,
      entrada: entryQuantity,
      disponible,
      vendido,
      precioVenta,
      importeVenta,
      costoUnitario,
      costoTotal,
      cpVenta,
      final,
      importeFinal,
    };
  });
}
