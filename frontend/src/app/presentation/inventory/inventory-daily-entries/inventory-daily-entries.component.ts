import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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
import { InventoryProductView } from 'src/app/application/entries/inventory-product-view';
import { Result } from 'src/app/domain/commons/result';

export interface ProductDailyEntry {
  productId: string;
  productName: string;
  categoryId: string;
  categoryName: string;
  order: number;
  inicio: number;
  entradas: number;
  disponible: number;
  final: number;
  vendido: number;
  errors: string[];
}

export interface CategoryFilter {
  id: string;
  name: string;
  isSelected: boolean;
}

@Component({
  selector: 'app-inventory-daily-entries',
  imports: [CommonModule, SharedModule, TranslationModule, FormsModule],
  templateUrl: './inventory-daily-entries.component.html',
  styleUrl: './inventory-daily-entries.component.scss'
})
export class InventoryDailyEntriesComponent implements OnInit {
  products: ProductDailyEntry[] = [];
  filteredProducts: ProductDailyEntry[] = [];
  categories: CategoryFilter[] = [];
  searchTerm = '';
  selectedCategories: Set<string> = new Set();

  // Summary
  totalInicio = 0;
  totalEntradas = 0;
  totalDisponible = 0;
  totalVendido = 0;
  totalFinal = 0;

  // Cash summary
  totalSalesAmount = 0;
  totalCostAmount = 0;
  totalProfit = 0;

  isLoading = true;
  showErrorMessage = false;

  constructor(
    private translate: TranslateService,
    private productRepository: ProductRepository,
    private categoryRepository: ProductCategoryRepository,
    private orderService: OrderOfflineService,
    private inventoryService: InventoryOfflineService
  ) {}

  ngOnInit(): void {
    this.loadData();
  }

  private loadData(): void {
    this.isLoading = true;
    const today = new Date();

    // Get products that are active and available for sale (same as inventory-today-quantities)
    const allProducts = [...this.productRepository.getStorageProductsMap().values()]
      .filter((p) => p.isActive && p.availableToSale)
      .sort((a, b) => {
        const catOrderA = this.getCategoryOrder(a.categoryId);
        const catOrderB = this.getCategoryOrder(b.categoryId);
        if (catOrderA !== catOrderB) return catOrderA - catOrderB;
        return a.order - b.order;
      });

    // Get categories
    const allCategories = [...this.categoryRepository.getStorageCategoriesMap().values()].sort((a, b) => a.order - b.order);

    this.categories = allCategories.map((c) => ({
      id: c.id,
      name: c.name,
      isSelected: false
    }));

    // Get today's orders (for reference - actual sales from system)
    const todayOrders: Order[] = this.orderService.getActiveOrdersInDay(today);

    // Get today's entries
    const todayEntries = this.inventoryService.getInventoryEntriesInDay(today);

    // Get inventory products view
    const inventoryCategories = this.inventoryService.getInventoryCategoriesView();
    const inventoryProducts: InventoryProductView[] = inventoryCategories.succeeded
      ? inventoryCategories.data.flatMap((c) => c.products)
      : [];

    // Build product daily entries - same logic as inventory-today-quantities
    this.products = allProducts.map((prod) => {
      const orderItems = todayOrders.flatMap((o) => o.orderItems).filter((oi) => oi.productId === prod.id);
      const productTodayEntries = todayEntries.succeeded ? todayEntries.data.filter((e) => e.productId === prod.id) : [];

      const availableProduct = inventoryProducts.find((p) => p.productId === prod.id);
      const disponible: number = availableProduct?.quantity ?? 0;

      // Today's entries and sales from the system
      const systemEntradas: number = productTodayEntries.reduce((total, e) => total + e.quantity, 0);
      const systemVendido: number = orderItems.reduce((total, oi) => total + oi.quantity, 0);

      // User will input their own entradas and final
      // inicio = disponible (current inventory at start of day)
      const inicio: number = disponible;
      const entradas = 0; // User input starts at 0
      const calculatedDisponible = inicio + entradas; // User can modify this via entradas input
      const final = calculatedDisponible - systemVendido; // User can modify this

      return {
        productId: prod.id,
        productName: prod.name,
        categoryId: prod.categoryId,
        categoryName: prod.categoryName,
        order: prod.order,
        inicio,
        entradas,
        disponible: calculatedDisponible,
        final,
        vendido: systemVendido, // Read-only from system
        errors: []
      };
    });

    // Sort by category order then product order
    this.products.sort((a, b) => {
      const catOrderA = this.getCategoryOrder(a.categoryId);
      const catOrderB = this.getCategoryOrder(b.categoryId);
      if (catOrderA !== catOrderB) return catOrderA - catOrderB;
      return a.order - b.order;
    });

    this.filteredProducts = [...this.products];
    this.calculateTotals();
    this.isLoading = false;
  }

  private getCategoryOrder(categoryId: string): number {
    const category = this.categoryRepository.getProductCategoryById(categoryId);
    return category?.order ?? 999;
  }

  onSearchChange(): void {
    this.applyFilters();
  }

  toggleCategory(categoryId: string): void {
    if (this.selectedCategories.has(categoryId)) {
      this.selectedCategories.delete(categoryId);
    } else {
      this.selectedCategories.add(categoryId);
    }
    this.applyFilters();
  }

  selectAllCategories(): void {
    this.selectedCategories.clear();
    this.applyFilters();
  }

  private applyFilters(): void {
    this.filteredProducts = this.products.filter((p) => {
      const matchesSearch =
        !this.searchTerm ||
        p.productName.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
        p.categoryName.toLowerCase().includes(this.searchTerm.toLowerCase());

      const matchesCategory = this.selectedCategories.size === 0 || this.selectedCategories.has(p.categoryId);

      return matchesSearch && matchesCategory;
    });
  }

  onEntradasChange(productId: string, value: number): void {
    const product = this.products.find((p) => p.productId === productId);
    if (product) {
      product.entradas = value;
      // Disponible = Inicio + Entradas
      product.disponible = product.inicio + product.entradas;
      // Vendido = Disponible - Final
      product.vendido = product.disponible - product.final;
      this.validateProduct(product);
      this.calculateTotals();
      this.applyFilters();
    }
  }

  onFinalChange(productId: string, value: number): void {
    const product = this.products.find((p) => p.productId === productId);
    if (product) {
      product.final = value;
      // Vendido = Disponible - Final
      product.vendido = product.disponible - product.final;
      this.validateProduct(product);
      this.calculateTotals();
      this.applyFilters();
    }
  }

  private validateProduct(product: ProductDailyEntry): void {
    product.errors = [];

    if (product.vendido < 0) {
      product.errors.push('Vendido < 0');
    }
    if (product.disponible < product.inicio) {
      product.errors.push('Disponible < Inicio');
    }
    if (product.entradas < 0) {
      product.errors.push('Entradas < 0');
    }
    if (product.final < 0) {
      product.errors.push('Final < 0');
    }
  }

  private calculateTotals(): void {
    this.totalInicio = 0;
    this.totalEntradas = 0;
    this.totalDisponible = 0;
    this.totalVendido = 0;
    this.totalFinal = 0;
    this.totalSalesAmount = 0;
    this.totalCostAmount = 0;

    this.products.forEach((p) => {
      this.totalInicio += p.inicio;
      this.totalEntradas += p.entradas;
      this.totalDisponible += p.disponible;
      this.totalVendido += p.vendido;
      this.totalFinal += p.final;

      // Calculate amounts
      const product = this.productRepository.getProductById(p.productId);
      if (product) {
        this.totalSalesAmount += p.vendido * product.price;
      }

      // Cost from inventory
      const inventoryCosts = this.inventoryService.getAvailableInventoryCosts(p.productId, p.vendido);
      const cost = inventoryCosts.reduce((sum, ic) => sum + ic.costPrice * ic.quantity, 0);
      this.totalCostAmount += cost;
    });

    this.totalProfit = this.totalSalesAmount - this.totalCostAmount;

    // Check if there are any errors
    this.showErrorMessage = this.products.some((p) => p.errors.length > 0);
  }

  generateEntriesAndOrder(): void {
    // Validate all products
    let hasErrors = false;
    this.products.forEach((p) => {
      this.validateProduct(p);
      if (p.errors.length > 0) {
        hasErrors = true;
      }
    });

    if (hasErrors) {
      this.showErrorMessage = true;
      this.calculateTotals();
      return;
    }

    // Generate entries for products with positive entradas
    const productsWithEntries = this.products.filter((p) => p.entradas > 0);

    productsWithEntries.forEach((p) => {
      const result: Result = this.inventoryService.createInventoryEntry(p.productId, p.entradas, 0);
      if (!result.succeeded) {
        console.error(`Failed to create entry for ${p.productName}:`, result.errors);
      }
    });

    // Calculate new disponible for each product
    this.products.forEach((p) => {
      const newDisponible = p.inicio + p.entradas - p.vendido;
      if (newDisponible !== p.disponible) {
        this.inventoryService.updateAvailableInventories(p.productId, newDisponible);
      }
    });

    // Show success message and reload
    this.loadData();
  }

  hasError(product: ProductDailyEntry, errorType: string): boolean {
    return product.errors.some((e) => e.includes(errorType));
  }

  trackByProduct(index: number, product: ProductDailyEntry): string {
    return product.productId;
  }

  trackByCategory(index: number, category: CategoryFilter): string {
    return category.id;
  }
}
