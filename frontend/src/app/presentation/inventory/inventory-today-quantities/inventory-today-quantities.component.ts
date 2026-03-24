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
import { InventoryEntryView } from 'src/app/domain/entities/entries/inventory-entry-view.model';
import { InventoryCategoryView } from 'src/app/application/entries/inventory-category.view';
import { InventoryProductView } from 'src/app/application/entries/inventory-product-view';

export interface ProductQuantity {
  productId: string;
  productName: string;
  categoryId: string;
  categoryName: string;
  inicio: number;
  entradas: number;
  disponible: number;
  vendido: number;
  final: number;
}

export interface CategoryGroup {
  categoryId: string;
  categoryName: string;
  products: ProductQuantity[];
}

@Component({
  selector: 'app-inventory-today-quantities',
  imports: [CommonModule, SharedModule, TranslationModule],
  templateUrl: './inventory-today-quantities.component.html',
  styleUrl: './inventory-today-quantities.component.scss'
})
export class InventoryTodayQuantitiesComponent implements OnInit {
  categoryGroups: CategoryGroup[] = [];
  isLoading = true;

  constructor(
    private translate: TranslateService,
    private productRepository: ProductRepository,
    private categoryRepository: ProductCategoryRepository,
    private orderService: OrderOfflineService,
    private inventoryService: InventoryOfflineService
  ) {}

  ngOnInit(): void {
    this.loadInventoryData();
  }

  private loadInventoryData(): void {
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

    // Get today's entries
    const todayEntries = this.inventoryService.getInventoryEntriesInDay(today);

    // Get inventory products view
    const inventoryCategories = this.inventoryService.getInventoryCategoriesView();
    const inventoryProducts: InventoryProductView[] = inventoryCategories.succeeded
      ? inventoryCategories.data.flatMap((c) => c.products)
      : [];

    // Build product quantities
    const productQuantities: ProductQuantity[] = products.map((prod) => {
      const orderItems = todayOrders.flatMap((o) => o.orderItems).filter((oi) => oi.productId === prod.id);

      const productTodayEntries = todayEntries.succeeded ? todayEntries.data.filter((e) => e.productId === prod.id) : [];

      const availableProduct = inventoryProducts.find((p) => p.productId === prod.id);
      const disponible: number = availableProduct?.quantity ?? 0;

      const entradas: number = productTodayEntries.reduce((total, e) => total + e.quantity, 0);
      const vendido: number = orderItems.reduce((total, oi) => total + oi.quantity, 0);
      const inicio: number = disponible + vendido - entradas;
      const final: number = disponible - vendido;

      return {
        productId: prod.id,
        productName: prod.name,
        categoryId: prod.categoryId,
        categoryName: prod.categoryName,
        inicio,
        entradas,
        disponible,
        vendido,
        final
      };
    });

    // Group by category
    const categoryMap = new Map<string, ProductQuantity>();
    productQuantities.forEach((pq) => {
      if (!categoryMap.has(pq.categoryId)) {
        categoryMap.set(pq.categoryId, pq);
      }
    });

    this.categoryGroups = Array.from(categoryMap.values())
      .sort((a, b) => {
        const catOrderA = this.getCategoryOrder(a.categoryId);
        const catOrderB = this.getCategoryOrder(b.categoryId);
        return catOrderA - catOrderB;
      })
      .map((pq) => ({
        categoryId: pq.categoryId,
        categoryName: pq.categoryName,
        products: productQuantities
          .filter((p) => p.categoryId === pq.categoryId)
          .sort((a, b) => {
            const prodA = products.find((p) => p.id === a.productId);
            const prodB = products.find((p) => p.id === b.productId);
            return (prodA?.order ?? 0) - (prodB?.order ?? 0);
          })
      }));

    this.isLoading = false;
  }

  private getCategoryOrder(categoryId: string): number {
    const category = this.categoryRepository.getProductCategoryById(categoryId);
    return category?.order ?? 999;
  }

  trackByCategory(index: number, category: CategoryGroup): string {
    return category.categoryId;
  }

  trackByProduct(index: number, product: ProductQuantity): string {
    return product.productId;
  }
}
