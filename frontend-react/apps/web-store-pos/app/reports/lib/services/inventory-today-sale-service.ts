import type { InventoryEntry, Order, OrderItem, Product } from '@store-mgmt/domain';
import { ProductOfflineService } from '~/sales/lib/services/product-offline-service';
import { OrderOfflineService } from '~/sales/lib/services/order-offline-service';
import { InventoryOfflineService } from '~/inventory/lib/services/inventory-offline-service';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';

/**
 * One row of the 13-column per-product inventory-at-sale-price ledger.
 * Typed numbers (NOT `toFixed` strings) — formatting happens at the display/PDF edge.
 */
export interface InventoryTodaySaleRow {
  productId: string;
  /** Col 1 — Producto */
  productName: string;
  /** Col 2 — U (hardcoded literal, NOT a product unit-of-measure field — Angular parity) */
  unit: string;
  /** Col 3 — Inicio = available + vendido - entrada */
  inicio: number;
  /** Col 4 — Entrada = sum of today's inventory entry quantities */
  entrada: number;
  /** Col 5 — Disponible = available + vendido */
  disponible: number;
  /** Col 6 — Vendido = sum of today's order-item quantities */
  vendido: number;
  /** Col 7 — Precio Venta = avg(today's order-item prices), 0 if none */
  precioVenta: number;
  /** Col 8 — Importe Venta = vendido x precioVenta */
  importeVenta: number;
  /** Col 9 — Costo Unitario = quantity-weighted avg costPrice across active (available>0) entries */
  costoUnitario: number;
  /** Col 10 — Costo Total = vendido x costoUnitario */
  costoTotal: number;
  /** Col 11 — C.P Venta = costoTotal / importeVenta when importeVenta>0, else 0 */
  cpVenta: number;
  /** Col 12 — Final = disponible - vendido */
  final: number;
  /** Col 13 — Importe Final = final x costoUnitario */
  importeFinal: number;
}

/**
 * InventoryTodaySaleService — 1:1 port of Angular's dormant
 * `InventoryTodaySaleComponent.generateProductRows()`
 * (frontend/src/app/presentation/reports/inventory-today-sale/inventory-today-sale.component.ts:176-226),
 * the intended 13-column per-product inventory-at-sale-price ledger (Stage 7, spec Slice A).
 *
 * Composes EXISTING offline services — no FIFO/cost duplication:
 * - ProductOfflineService.getAll() [inline isActive filter — React has no getAvailableProducts, ADR-4]
 * - OrderOfflineService.getActiveOrdersInDay(date)
 * - InventoryOfflineService.getByDate(date) [today's entries]
 * - InventoryOfflineService.getAvailableQuantity(productId) [Σ active available]
 * - InventoryOfflineService.getProductInventoriesByProductId(productId) [col-9 weighting — ADR-2]
 *
 * Read-only: makes zero mutations to any repository. MUST NEVER call
 * `getAvailableInventoryCosts` (FIFO deduction — mutates/persists stock).
 */
export class InventoryTodaySaleService {
  private readonly productService: ProductOfflineService;
  private readonly orderService: OrderOfflineService;
  private readonly inventoryService: InventoryOfflineService;

  constructor(storeId: string) {
    this.productService = new ProductOfflineService(storeId);
    this.orderService = new OrderOfflineService(storeId);
    this.inventoryService = new InventoryOfflineService(storeId, new ProductRepository(storeId));
  }

  getProductRows(date: Date = new Date()): InventoryTodaySaleRow[] {
    const products: Product[] = this.productService.getAll().filter((p) => p.isActive);
    const todayOrders: Order[] = this.orderService.getActiveOrdersInDay(date);
    // WU3 (service-return-shape-parity Slice 1, category B): getByDate now returns
    // BaseResponseModel<InventoryEntryView[]> (was a bare array) — unwrap `.data`. This
    // service is scheduled for removal per ADR-6 (aggregation inlining), kept working here
    // ahead of that later slice.
    const todayEntries = this.inventoryService.getByDate(date).data;

    return products.map((prod) => {
      const orderItems: OrderItem[] = todayOrders
        .flatMap((o) => o.orderItems)
        .filter((oi) => oi.productId === prod.id);

      const entrada = todayEntries
        .filter((e) => e.productId === prod.id)
        .reduce((total, e) => total + e.quantity, 0);

      // Col-9 divergence guard (design ADR-2 / spec Slice A — CRITICAL): weight by
      // entry.quantity over entries with available>0 (Angular's live behavior). Do NOT
      // weight by entry.available (that's getAvailableByCategory's avgCostPrice, which
      // diverges for partially-sold entries) and NEVER call getAvailableInventoryCosts
      // (it mutates/deducts stock via FIFO).
      const productAvailableEntries: InventoryEntry[] = this.inventoryService
        .getProductInventoriesByProductId(prod.id)
        .filter((e) => e.available > 0);

      const available = this.inventoryService.getAvailableQuantity(prod.id).available;
      const vendido = orderItems.reduce((total, oi) => total + oi.quantity, 0);
      const disponible = available + vendido;
      const inicio = available + vendido - entrada;
      const precioVenta =
        orderItems.length > 0
          ? orderItems.reduce((total, oi) => total + oi.price, 0) / orderItems.length
          : 0;
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
        entrada,
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
}
