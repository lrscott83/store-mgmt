import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SharedModule } from '../../shared/shared.module';
import { TranslationModule } from 'src/app/_modules/i18n/translation.module';
import { TranslateService } from '@ngx-translate/core';
import { ProductRepository } from 'src/app/application/products/product.repository';
import { Product } from 'src/app/domain/entities/products/product.model';
import { ProductCategoryRepository } from 'src/app/application/categories/product-category.repository';
import { ProductCategory } from 'src/app/domain/entities/product-categories/product-category.model';
import { OrderOfflineService } from 'src/app/application/orders/order-offline.service';
import { InventoryOfflineService } from 'src/app/application/entries/inventory-offline.service';
import { Order } from 'src/app/domain/entities/orders/order.model';

export interface ProductProfit {
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

export interface CategoryGroup {
  categoryId: string;
  categoryName: string;
  products: ProductProfit[];
}

@Component({
  selector: 'app-inventory-today-sales-profit',
  imports: [CommonModule, SharedModule, TranslationModule],
  templateUrl: './inventory-today-sales-profit.component.html',
  styleUrl: './inventory-today-sales-profit.component.scss'
})
export class InventoryTodaySalesProfitComponent implements OnInit {
  categoryGroups: CategoryGroup[] = [];
  isLoading = true;

  // Totals
  totalSold = 0;
  totalAmount = 0;
  totalCost = 0;
  totalProfit = 0;

  constructor(
    private translate: TranslateService,
    private productRepository: ProductRepository,
    private categoryRepository: ProductCategoryRepository,
    private orderService: OrderOfflineService,
    private inventoryService: InventoryOfflineService
  ) {}

  ngOnInit(): void {
    this.loadProfitData();
  }

  private loadProfitData(): void {
    this.isLoading = true;
    const today = new Date();

    // Get products that are active and available for sale
    const products = [...this.productRepository.getStorageProductsMap().values()]
      .filter((p) => p.isActive && p.availableToSale)
      .sort((a, b) => {
        const catOrderA = this.getCategoryOrder(a.categoryId);
        const catOrderB = this.getCategoryOrder(b.categoryId);
        if (catOrderA !== catOrderB) return catOrderA - catOrderB;
        return a.order - b.order;
      });

    // Get today's orders
    const todayOrders: Order[] = this.orderService.getActiveOrdersInDay(today);

    // Build product profits
    const productProfits: ProductProfit[] = products.map((prod) => {
      const orderItems = todayOrders.flatMap((o) => o.orderItems).filter((oi) => oi.productId === prod.id);

      const sold: number = orderItems.reduce((total, oi) => total + oi.quantity, 0);
      const salePrice: number = prod.price;
      const amount: number = sold * salePrice;

      // Calculate cost based on today's entries
      const todayEntries = this.inventoryService.getInventoryEntriesInDay(today);
      const productTodayEntries = todayEntries.succeeded ? todayEntries.data.filter((e) => e.productId === prod.id) : [];

      let unitCost = 0;
      let totalCost = 0;

      if (sold > 0) {
        // Use the available inventory cost method to get the cost for sold items
        const inventoryCosts = this.inventoryService.getAvailableInventoryCosts(prod.id, sold);
        totalCost = inventoryCosts.reduce((sum, ic) => sum + ic.costPrice * ic.quantity, 0);
        unitCost = totalCost / sold;
      } else if (productTodayEntries.length > 0) {
        // If no sales but there are entries, use average cost from entries
        const totalQuantity = productTodayEntries.reduce((sum, e) => sum + e.quantity, 0);
        const totalCostEntries = productTodayEntries.reduce((sum, e) => sum + e.costPrice * e.quantity, 0);
        unitCost = totalQuantity > 0 ? totalCostEntries / totalQuantity : 0;
        totalCost = 0;
      }

      const profit: number = amount - totalCost;

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
        profit
      };
    });

    // Filter out products with no sales and no entries
    const productsWithActivity = productProfits.filter((pp) => pp.sold > 0 || this.hasTodayEntries(pp.productId));

    // Group by category
    const categoryMap = new Map<string, ProductProfit>();
    productsWithActivity.forEach((pp) => {
      if (!categoryMap.has(pp.categoryId)) {
        categoryMap.set(pp.categoryId, pp);
      }
    });

    this.categoryGroups = Array.from(categoryMap.values())
      .sort((a, b) => {
        const catOrderA = this.getCategoryOrder(a.categoryId);
        const catOrderB = this.getCategoryOrder(b.categoryId);
        return catOrderA - catOrderB;
      })
      .map((pp) => ({
        categoryId: pp.categoryId,
        categoryName: pp.categoryName,
        products: productsWithActivity
          .filter((p) => p.categoryId === pp.categoryId)
          .sort((a, b) => {
            const prodA = products.find((p) => p.id === a.productId);
            const prodB = products.find((p) => p.id === b.productId);
            return (prodA?.order ?? 0) - (prodB?.order ?? 0);
          })
      }));

    // Calculate totals
    this.calculateTotals();

    this.isLoading = false;
  }

  private hasTodayEntries(productId: string): boolean {
    const today = new Date();
    const todayEntries = this.inventoryService.getInventoryEntriesInDay(today);
    if (!todayEntries.succeeded) return false;
    return todayEntries.data.some((e) => e.productId === productId && e.quantity > 0);
  }

  private calculateTotals(): void {
    this.totalSold = 0;
    this.totalAmount = 0;
    this.totalCost = 0;
    this.totalProfit = 0;

    this.categoryGroups.forEach((cg) => {
      cg.products.forEach((p) => {
        this.totalSold += p.sold;
        this.totalAmount += p.amount;
        this.totalCost += p.totalCost;
        this.totalProfit += p.profit;
      });
    });
  }

  private getCategoryOrder(categoryId: string): number {
    const category = this.categoryRepository.getProductCategoryById(categoryId);
    return category?.order ?? 999;
  }

  trackByCategory(index: number, category: CategoryGroup): string {
    return category.categoryId;
  }

  trackByProduct(index: number, product: ProductProfit): string {
    return product.productId;
  }
}
